import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !anonKey || !serviceKey || !token) return Response.json({ error: "Access request service is not configured." }, { status: 500 });
  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
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
    db.from("crm_workspace_members").select("email").eq("workspace_owner_id", ownerId),
  ]);
  if (profileError || memberError) return Response.json({ error: profileError?.message || memberError?.message || "Could not load access requests." }, { status: 400 });
  const granted = new Set((members || []).map((member) => member.email.toLowerCase()));
  return Response.json({ requests: (profiles || []).filter((profile) => !granted.has(profile.email.toLowerCase()) && profile.user_id !== ownerId) });
}
