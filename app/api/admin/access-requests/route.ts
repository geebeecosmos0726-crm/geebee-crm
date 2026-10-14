import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !serviceKey || !token) return Response.json({ error: "Access request service is not configured." }, { status: 500 });
  const auth = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await auth.auth.getUser(token);
  if (userError || !userData.user?.email) return Response.json({ error: "Sign in again to view access requests." }, { status: 401 });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const user = userData.user;
  const userEmail = user.email!;
  const { data: owned } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", user.id).maybeSingle();
  const { data: membership } = owned ? { data: null } : await db.from("crm_workspace_members").select("workspace_owner_id, role").ilike("email", userEmail).eq("role", "admin").maybeSingle();
  const ownerId = owned?.owner_id || membership?.workspace_owner_id;
  if (!ownerId) return Response.json({ error: "Administrator access is required." }, { status: 403 });
  const [{ data: profiles, error: profileError }, { data: members, error: memberError }] = await Promise.all([
    db.from("crm_profiles").select("user_id, full_name, phone, email, created_at").order("created_at", { ascending: false }).limit(200),
    db.from("crm_workspace_members").select("id, workspace_owner_id, email, role, modules").eq("workspace_owner_id", ownerId).order("email"),
  ]);
  if (profileError || memberError) return Response.json({ error: profileError?.message || memberError?.message || "Could not load access requests." }, { status: 400 });
  const granted = new Set((members || []).map((member) => member.email.toLowerCase()));
  // This server route intentionally returns the approved list as well as
  // pending requests. Browser table policies can allow a member to sign in
  // while still hiding that row from an administrator's direct browser query.
  const { data: ownerUser } = await db.auth.admin.getUserById(ownerId);
  const owner = ownerUser.user?.email ? [{ id: 0, workspace_owner_id: ownerId, email: ownerUser.user.email, role: "admin", modules: ["Overview", "Clients", "Leads", "Orders", "Catalogue", "Invoices", "Payments", "Shipments"] }] : [];
  const activeMembers = [...owner, ...(members || []).filter((member) => member.email.toLowerCase() !== ownerUser.user?.email?.toLowerCase())];
  return Response.json({ requests: (profiles || []).filter((profile) => !granted.has(profile.email.toLowerCase()) && profile.user_id !== ownerId), members: activeMembers });
}

export async function DELETE(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const body = await request.json().catch(() => ({}));
  if (!url || !serviceKey || !token || typeof body.userId !== "string") return Response.json({ error: "Access request service is not configured." }, { status: 400 });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user?.email) return Response.json({ error: "Sign in again to manage access requests." }, { status: 401 });
  const user = userData.user;
  const { data: owned } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", user.id).maybeSingle();
  const { data: membership } = owned ? { data: null } : await db.from("crm_workspace_members").select("workspace_owner_id, role").ilike("email", user.email!).eq("role", "admin").maybeSingle();
  const ownerId = owned?.owner_id || membership?.workspace_owner_id;
  if (!ownerId || body.userId === ownerId) return Response.json({ error: "Administrator access is required." }, { status: 403 });
  const { data: profile, error: profileError } = await db.from("crm_profiles").select("email").eq("user_id", body.userId).maybeSingle();
  if (profileError || !profile) return Response.json({ error: "Access request was not found." }, { status: 404 });
  const { data: member } = await db.from("crm_workspace_members").select("id").eq("workspace_owner_id", ownerId).ilike("email", profile.email).maybeSingle();
  if (member) return Response.json({ error: "This user already has workspace access." }, { status: 400 });
  const { error: deleteError } = await db.from("crm_profiles").delete().eq("user_id", body.userId);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 400 });
  await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: user.email!, action: "Rejected access request", module: "Team access", details: profile.email });
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const body = await request.json().catch(() => ({}));
  if (!url || !serviceKey || !token || typeof body.email !== "string" || !["admin", "employee"].includes(body.role)) return Response.json({ error: "Access approval service is not configured." }, { status: 400 });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user?.email) return Response.json({ error: "Sign in again to approve access." }, { status: 401 });
  const user = userData.user;
  const { data: owned } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", user.id).maybeSingle();
  const { data: membership } = owned ? { data: null } : await db.from("crm_workspace_members").select("workspace_owner_id, role").ilike("email", user.email!).eq("role", "admin").maybeSingle();
  const ownerId = owned?.owner_id || membership?.workspace_owner_id;
  if (!ownerId) return Response.json({ error: "Administrator access is required." }, { status: 403 });
  const email = body.email.trim().toLowerCase();
  const modules = body.role === "admin" ? ["Overview", "Clients", "Leads", "Orders", "Catalogue", "Invoices", "Payments", "Shipments"] : Array.isArray(body.modules) ? body.modules.filter((module: unknown) => typeof module === "string") : ["Overview"];
  const { data, error } = await db.from("crm_workspace_members").upsert({ workspace_owner_id: ownerId, email, role: body.role, modules }, { onConflict: "workspace_owner_id,email" }).select("id, workspace_owner_id, email, role, modules").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: user.email, action: "Approved employee access", module: "Team access", details: `${email} — ${body.role}` });
  return Response.json({ member: data });
}
