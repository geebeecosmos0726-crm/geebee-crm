import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type AuditRow = { id: number; details: string | null };

const escapesForRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const detailsReferenceOrder = (details: string | null, orderIds: Set<string>) => {
  if (!details) return false;
  try {
    const parsed = JSON.parse(details) as { orderId?: unknown };
    if (typeof parsed.orderId === "string" && orderIds.has(parsed.orderId)) return true;
  } catch {
    // Most activity entries are readable text rather than JSON.
  }
  return [...orderIds].some((orderId) => new RegExp(`(^|[^A-Za-z0-9-])${escapesForRegex(orderId)}(?=$|[^A-Za-z0-9-])`, "i").test(details));
};

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const body = await request.json().catch(() => ({})) as { orderIds?: unknown };
  const rawOrderIds: unknown[] = Array.isArray(body.orderIds) ? body.orderIds : [];
  const orderIds: string[] = [...new Set(rawOrderIds.map((id: unknown) => String(id || "").trim()).filter(Boolean))];
  if (!url || !serviceKey || !token) return Response.json({ error: "Sign in again before deleting order history." }, { status: 401 });
  if (!orderIds.length) return Response.json({ ok: true, deletedAuditIds: [], deletedLedgerIds: [] });

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user?.email) return Response.json({ error: "Sign in again before deleting order history." }, { status: 401 });

  const user = userData.user;
  const userEmail = user.email!;
  const { data: owned } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", user.id).maybeSingle();
  const { data: membership } = owned ? { data: null } : await db.from("crm_workspace_members").select("workspace_owner_id, role").ilike("email", userEmail).eq("role", "admin").maybeSingle();
  const workspaceOwnerId = owned?.owner_id || membership?.workspace_owner_id;
  if (!workspaceOwnerId) return Response.json({ error: "Only a GeeBee administrator can permanently delete an order and its history." }, { status: 403 });

  const { data, error: readError } = await db
    .from("crm_audit_events")
    .select("id, details")
    .eq("workspace_owner_id", workspaceOwnerId)
    .limit(50000);
  if (readError) return Response.json({ error: readError.message }, { status: 500 });

  const targetOrderIds = new Set<string>(orderIds);
  const idsToDelete = ((data || []) as AuditRow[])
    .filter((event) => detailsReferenceOrder(event.details, targetOrderIds))
    .map((event) => event.id);
  if (idsToDelete.length) {
    const { error: deleteError } = await db.from("crm_audit_events").delete().eq("workspace_owner_id", workspaceOwnerId).in("id", idsToDelete);
    if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
  }
  // Stock-movement history is the inventory ledger, not only the activity
  // feed. A hard-deleted order must disappear from both views. The delete
  // caller has already restored its exact dispatched stock before arriving
  // here, so removing these net-zero historical rows is safe.
  const { data: ledgerRows, error: ledgerReadError } = await db
    .from("crm_inventory_ledger")
    .select("id")
    .eq("workspace_owner_id", workspaceOwnerId)
    .in("order_id", orderIds)
    .limit(50000);
  if (ledgerReadError && !/does not exist|relation/i.test(ledgerReadError.message)) return Response.json({ error: ledgerReadError.message }, { status: 500 });
  const deletedLedgerIds = (ledgerRows || []).map((row: { id: number }) => row.id);
  if (deletedLedgerIds.length) {
    const { error: ledgerDeleteError } = await db.from("crm_inventory_ledger").delete().eq("workspace_owner_id", workspaceOwnerId).in("id", deletedLedgerIds);
    if (ledgerDeleteError) return Response.json({ error: ledgerDeleteError.message }, { status: 500 });
  }
  return Response.json({ ok: true, deletedAuditIds: idsToDelete, deletedLedgerIds });
}
