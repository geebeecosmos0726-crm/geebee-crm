import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type InventoryLine = { sku: string; quantity: number };

const exactSku = (value: unknown) => String(value ?? "").trim().toUpperCase();
const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") return (error as { message: string }).message;
  return fallback;
};

async function administrator(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !serviceKey || !token) throw new Error("Sign in again before moving inventory.");
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error } = await db.auth.getUser(token);
  const email = userData.user?.email;
  if (error || !userData.user || !email) throw new Error("Sign in again before moving inventory.");
  const { data: owned } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", userData.user.id).maybeSingle();
  if (owned?.owner_id) return { db, ownerId: owned.owner_id, email };
  const { data: member } = await db.from("crm_workspace_members").select("workspace_owner_id").ilike("email", email).maybeSingle();
  if (!member?.workspace_owner_id) throw new Error("Your account does not have inventory access.");
  return { db, ownerId: member.workspace_owner_id, email };
}

export async function GET(request: Request) {
  try {
    const { db, ownerId } = await administrator(request);
    const url = new URL(request.url);
    const sku = exactSku(url.searchParams.get("sku"));
    let query = db.from("crm_inventory_ledger")
      .select("id, transaction_id, reference_transaction_id, order_id, sku_id, product_record_id, transaction_type, occurred_at, quantity, signed_quantity, previous_available, new_available, actor_email")
      .eq("workspace_owner_id", ownerId)
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(50000);
    if (sku) query = query.eq("sku_id", sku);
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ ledger: data || [] });
  } catch (error) {
    console.error("Inventory ledger load failed", error);
    return Response.json({ error: errorMessage(error, "Could not load the inventory ledger. Run the inventory-ledger SQL setup first.") }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const { db, ownerId, email } = await administrator(request);
    const body = await request.json();
    const transactionId = String(body?.transactionId || "").trim();
    const orderId = String(body?.orderId || "").trim();
    const transactionType = body?.transactionType === "Reversal" ? "Reversal" : body?.transactionType === "Dispatch" ? "Dispatch" : "";
    const referenceTransactionId = String(body?.referenceTransactionId || "").trim();
    const lines = (Array.isArray(body?.lines) ? body.lines : []).map((line: any) => ({ sku: exactSku(line?.sku), quantity: Number(line?.quantity) })).filter((line: InventoryLine) => line.sku && Number.isFinite(line.quantity) && line.quantity > 0);
    const grouped = new Map<string, number>();
    lines.forEach((line: InventoryLine) => grouped.set(line.sku, (grouped.get(line.sku) || 0) + line.quantity));
    const safeLines = [...grouped.entries()].map(([sku, quantity]) => ({ sku, quantity }));
    const allowNegativeSkus = [...new Set((Array.isArray(body?.allowNegativeSkus) ? body.allowNegativeSkus : []).map(exactSku).filter(Boolean))];
    if (!transactionId || !orderId || !transactionType || !safeLines.length) throw new Error("Inventory transaction needs an ID, order, type and at least one valid SKU line.");
    if (transactionType === "Reversal" && !referenceTransactionId) throw new Error("A reversal must reference its original dispatch.");
    const { data: movements, error } = await db.rpc("apply_crm_inventory_transaction", {
      p_workspace_owner_id: ownerId,
      p_transaction_id: transactionId,
      p_reference_transaction_id: referenceTransactionId,
      p_order_id: orderId,
      p_transaction_type: transactionType,
      p_lines: safeLines,
      p_allow_negative_skus: allowNegativeSkus,
      p_actor_email: email,
      p_occurred_at: body?.occurredAt || new Date().toISOString(),
    });
    if (error) throw error;
    const skuIds = safeLines.map((line) => line.sku);
    const { data: inventory, error: inventoryError } = await db.from("crm_stock_inventory").select("record_id, data").eq("workspace_owner_id", ownerId).in("record_id", (movements || []).map((movement: any) => String(movement.product_record_id)));
    if (inventoryError) throw inventoryError;
    return Response.json({ movements: movements || [], products: (inventory || []).map((row: any) => ({ id: row.record_id, ...row.data })), skuIds });
  } catch (error) {
    console.error("Inventory ledger transaction failed", error);
    return Response.json({ error: errorMessage(error, "Inventory movement could not be saved. Run the inventory-ledger SQL setup first.") }, { status: 400 });
  }
}
