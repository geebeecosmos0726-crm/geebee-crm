import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

export const runtime = "nodejs";

const DEFAULT_SHEET_ID = "11kPbkX-IbW1n4h8SPkppVtwxYxNuag_BqXZ2XU2UQ-o";
const compact = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (value: unknown) => String(value ?? "").trim();
const quantity = (value: unknown) => Number.parseFloat(text(value).replace(/[\s,]/g, "")) || 0;
const quoteRange = (title: string) => `'${title.replace(/'/g, "''")}'!A:Z`;

type PurchaseLine = { sku: string; product: string; quantity: number; receivedQuantity: number };
type PurchaseOrder = { id: string; supplier: string; status: "Draft"; expectedDate: string; createdAt: string; notes: string; lines: PurchaseLine[]; importKey: string };
type Supplier = { id: number; name: string; contact: string; phone: string; email: string; city: string; country: string; gstin: string; paymentTerms: string; notes: string; status: "Active" };

const column = (headers: string[], aliases: string[]) => headers.findIndex((header) => aliases.includes(compact(header)));
const dateKey = (value: string) => {
  const clean = value.trim();
  const ddmmyyyy = clean.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[1].padStart(2, "0")}${ddmmyyyy[2].padStart(2, "0")}`;
  const yyyymmdd = clean.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/);
  if (yyyymmdd) return `${yyyymmdd[3].padStart(2, "0")}${yyyymmdd[2].padStart(2, "0")}`;
  return compact(clean).slice(0, 12) || "undated";
};
const nextId = (prefix: string, purchases: Array<{ id?: string }>) => {
  const sequence = purchases.reduce((max, purchase) => {
    const matched = String(purchase.id || "").match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0) + 1;
  return `${prefix}-${String(sequence).padStart(2, "0")}`;
};

async function administrator(request: Request, url: string, serviceKey: string) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in again before fetching Product POs.");
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error } = await db.auth.getUser(token);
  if (error || !userData.user?.email) throw new Error("Sign in again before fetching Product POs.");
  const { data: owned } = await db.from("crm_workspaces").select("owner_id, data").eq("owner_id", userData.user.id).maybeSingle();
  if (owned?.owner_id) return { db, ownerId: owned.owner_id, email: userData.user.email, workspace: owned };
  const { data: member } = await db.from("crm_workspace_members").select("workspace_owner_id, role").ilike("email", userData.user.email).eq("role", "admin").maybeSingle();
  if (!member?.workspace_owner_id) throw new Error("Only GeeBee administrators can fetch Product POs.");
  const { data: workspace, error: workspaceError } = await db.from("crm_workspaces").select("owner_id, data").eq("owner_id", member.workspace_owner_id).maybeSingle();
  if (workspaceError || !workspace) throw new Error("GeeBee workspace is not ready.");
  return { db, ownerId: member.workspace_owner_id, email: userData.user.email, workspace };
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.GOOGLE_PRODUCT_PO_SHEET_ID || DEFAULT_SHEET_ID;
  if (!url || !serviceKey || !keyJson) return Response.json({ error: "Google Product PO connection is not configured." }, { status: 500 });
  try {
    const { db, ownerId, email, workspace } = await administrator(request, url, serviceKey);
    const credentials = JSON.parse(keyJson);
    if (typeof credentials.private_key === "string") credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
    const sheets = google.sheets({ version: "v4", auth });
    const metadata = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties" });
    const tab = metadata.data.sheets?.[0]?.properties?.title;
    if (!tab) throw new Error("The Product PO sheet has no worksheet.");
    const result = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: quoteRange(tab) });
    const rows = (result.data.values || []).map((row) => Array.isArray(row) ? row.map(text) : []);
    const headerRow = rows.find((row) => column(row, ["date"]) >= 0 && column(row, ["skuid", "sku"]) >= 0 && column(row, ["qtyordered", "quantityordered", "qty", "quantity"]) >= 0);
    if (!headerRow) throw new Error("Use these Product PO headers: Date, Supplier, SKU ID, Product Name, Qty Ordered.");
    const dateIndex = column(headerRow, ["date"]);
    const skuIndex = column(headerRow, ["skuid", "sku"]);
    const nameIndex = column(headerRow, ["productname", "product"]);
    const supplierIndex = column(headerRow, ["supplier", "suppliername", "vendor", "vendorname"]);
    const quantityIndex = column(headerRow, ["qtyordered", "quantityordered", "qty", "quantity"]);
    const start = rows.indexOf(headerRow) + 1;
    const { data: inventory, error: inventoryError } = await db.from("crm_stock_inventory").select("data").eq("workspace_owner_id", ownerId).limit(100000);
    if (inventoryError) throw inventoryError;
    const products = new Map((inventory || []).map((row: any) => [compact(row.data?.sku), row.data]));
    const workspaceData = (workspace.data || {}) as { purchases?: PurchaseOrder[]; suppliers?: Supplier[] };
    const existing = Array.isArray(workspaceData.purchases) ? workspaceData.purchases : [];
    const groups = new Map<string, { date: string; supplier?: string; lines: PurchaseLine[] }>();
    const unmatched: string[] = [];
    rows.slice(start).forEach((row) => {
      const date = text(row[dateIndex]); const sku = text(row[skuIndex]); const supplier = supplierIndex >= 0 ? text(row[supplierIndex]) : ""; const ordered = quantity(row[quantityIndex]);
      if (!date && !sku && !ordered) return;
      if (!date || !sku || ordered <= 0) return;
      const product = products.get(compact(sku));
      if (!product) { unmatched.push(sku); return; }
      const key = `product-po:${dateKey(date)}`;
      const group = groups.get(key) || { date, supplier: supplier || undefined, lines: [] };
      if (!group.supplier && supplier) group.supplier = supplier;
      group.lines.push({ sku: String(product.sku || sku), product: String(product.name || text(row[nameIndex]) || sku), quantity: ordered, receivedQuantity: 0 });
      groups.set(key, group);
    });
    const imported: PurchaseOrder[] = [];
    const updatedImportKeys = new Set<string>();
    const lineSignature = (lines: PurchaseLine[]) => lines.map((line) => `${compact(line.sku)}:${line.quantity}:${compact(line.product)}`).join("|");
    const byImportKey = new Map(existing.map((purchase) => [purchase.importKey, purchase]));
    groups.forEach((group, importKey) => {
      const current = byImportKey.get(importKey);
      if (!current) {
        const prefix = dateKey(group.date);
        imported.push({ id: nextId(prefix, [...existing, ...imported]), supplier: group.supplier || "", status: "Draft", expectedDate: "", createdAt: new Date().toISOString().slice(0, 10), notes: `Imported from Product PO Sheet · ${group.date}`, lines: group.lines, importKey });
        return;
      }
      // The sheet remains the source for draft Product POs. This lets a user
      // append rows (or correct quantities) and fetch again without creating
      // a second PO for the same date. Received/cancelled POs are never changed.
      if (current.status === "Draft" && (lineSignature(current.lines) !== lineSignature(group.lines) || (supplierIndex >= 0 && compact(current.supplier) !== compact(group.supplier)))) updatedImportKeys.add(importKey);
    });
    const purchases = existing.map((purchase) => updatedImportKeys.has(purchase.importKey || "")
      ? { ...purchase, supplier: groups.get(purchase.importKey || "")?.supplier ?? purchase.supplier, lines: groups.get(purchase.importKey || "")?.lines || purchase.lines }
      : purchase,
    ).concat(imported);
    const existingSuppliers = Array.isArray(workspaceData.suppliers) ? workspaceData.suppliers : [];
    const supplierNames = new Set(existingSuppliers.map((supplier) => compact(supplier.name)));
    const newSuppliers: Supplier[] = [];
    purchases.forEach((purchase, index) => {
      const name = purchase.supplier.trim();
      if (!name || supplierNames.has(compact(name))) return;
      supplierNames.add(compact(name));
      newSuppliers.push({ id: Date.now() + index, name, contact: "", phone: "", email: "", city: "", country: "", gstin: "", paymentTerms: "", notes: "Added from Product PO Sheet", status: "Active" });
    });
    const suppliers = [...existingSuppliers, ...newSuppliers];
    if (imported.length || updatedImportKeys.size || newSuppliers.length) {
      const { error: updateError } = await db.from("crm_workspaces").update({ data: { ...workspaceData, purchases, suppliers }, updated_at: new Date().toISOString() }).eq("owner_id", ownerId);
      if (updateError) throw updateError;
      await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: email, action: "Fetched Product POs from Google Sheet", module: "Purchase Orders", details: `${imported.length} new PO(s) · ${updatedImportKeys.size} updated PO(s) · ${newSuppliers.length} supplier(s) added · ${unmatched.length} unmatched SKU row(s)` });
    }
    return Response.json({ purchases, imported: imported.length, updated: updatedImportKeys.size, suppliersAdded: newSuppliers.length, unmatched: [...new Set(unmatched)], skipped: groups.size - imported.length - updatedImportKeys.size, sheet: tab });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not fetch Product POs." }, { status: 400 });
  }
}
