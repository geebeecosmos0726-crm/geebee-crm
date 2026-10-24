import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !serviceKey || !token) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: user, error: userError } = await db.auth.getUser(token);
  if (userError || !user.user?.email) return Response.json({ error: "Administrator access is required." }, { status: 403 });

  const { data: owned } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", user.user.id).maybeSingle();
  const { data: membership } = owned ? { data: null } : await db.from("crm_workspace_members").select("workspace_owner_id, role").ilike("email", user.user.email).eq("role", "admin").maybeSingle();
  const ownerId = owned?.owner_id || membership?.workspace_owner_id;
  if (!ownerId) return Response.json({ error: "Administrator access is required." }, { status: 403 });

  // Never remove the retired records until a current Stock Master exists.
  const { count, error: masterError } = await db.from("crm_stock_inventory").select("record_id", { count: "exact", head: true }).eq("workspace_owner_id", ownerId);
  if (masterError) return Response.json({ error: masterError.message }, { status: 500 });
  if (!count) return Response.json({ error: "Current Product / SKU Stock Master is empty, so the old product data was retained." }, { status: 409 });

  const { error: deleteError } = await db.from("crm_products").delete().eq("workspace_owner_id", ownerId);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
  await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: user.user.email, action: "Retired old product catalogue", module: "Products", details: "crm_products cleared after Product / SKU Stock Master verification" });
  return Response.json({ ok: true });
}
