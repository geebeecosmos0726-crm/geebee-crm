import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !serviceKey || !token) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const requestedQuantity = Number(body?.quantity);
  const quantity = Number.isInteger(requestedQuantity) && requestedQuantity >= 0 && requestedQuantity <= 1_000_000 ? requestedQuantity : 10000;
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userResult, error: userError } = await db.auth.getUser(token);
  if (userError || !userResult.user?.email) return Response.json({ error: "Administrator access is required." }, { status: 403 });

  const { data: ownedWorkspace } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", userResult.user.id).maybeSingle();
  const { data: adminMembership } = ownedWorkspace ? { data: null } : await db.from("crm_workspace_members").select("workspace_owner_id, role").ilike("email", userResult.user.email).eq("role", "admin").maybeSingle();
  const ownerId = ownedWorkspace?.owner_id || adminMembership?.workspace_owner_id;
  if (!ownerId) return Response.json({ error: "Administrator access is required." }, { status: 403 });
  const { data: products, error: readError } = await db.from("crm_stock_inventory").select("record_id, data").eq("workspace_owner_id", ownerId).limit(100000);
  if (readError) return Response.json({ error: readError.message }, { status: 500 });
  const updates = (products || []).map((row: { record_id: string; data: Record<string, unknown> }) => ({
    workspace_owner_id: ownerId,
    record_id: row.record_id,
    data: { ...row.data, availableQuantity: quantity, openingStock: 0, purchasedStock: 0, orderedStock: 0, damagedStock: 0, reservedStock: 0 },
    search_key: `${row.data.sku || ""} ${row.data.name || ""} ${row.data.category || ""}`.toLowerCase(),
    updated_at: new Date().toISOString(),
  }));
  if (updates.length) {
    const { error: writeError } = await db.from("crm_stock_inventory").upsert(updates, { onConflict: "workspace_owner_id,record_id" });
    if (writeError) return Response.json({ error: writeError.message }, { status: 500 });
  }
  await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: userResult.user.email, action: "Reset demo inventory", module: "Products", details: `${updates.length} Product / SKU records set to ${quantity.toLocaleString("en-IN")} available units with test allocations cleared` });
  return Response.json({ ok: true, updated: updates.length, quantity });
}
