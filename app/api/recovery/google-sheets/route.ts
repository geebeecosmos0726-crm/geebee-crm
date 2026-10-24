import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

export const runtime = "nodejs";

const sheetTabs = ["Customers", "Products", "Orders", "Backorders", "Quotes", "Invoices", "Leads", "Tasks", "Transporters", "Suppliers", "Purchase Orders"] as const;
type Tab = typeof sheetTabs[number];
type Row = Record<string, string>;

const number = (value: string | undefined) => Number(String(value || "").replaceAll(",", "")) || 0;
const json = <T>(value: string | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const initials = (value: string) => value.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

function credentials() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!key) throw new Error("Google Sheets backup is not configured.");
  const parsed = JSON.parse(key);
  if (typeof parsed.private_key === "string") parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

async function context(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !serviceKey || !token) throw new Error("Sign in again before starting a recovery.");
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user?.email) throw new Error("Your session could not be verified.");
  const user = userData.user;
  const email = user.email;
  if (!email) throw new Error("Your session could not be verified.");
  const { data: owned } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", user.id).maybeSingle();
  if (owned) return { db, ownerId: user.id, email };
  const { data: member } = await db.from("crm_workspace_members").select("workspace_owner_id, role").ilike("email", email).eq("role", "admin").maybeSingle();
  if (!member) throw new Error("Only a GeeBee administrator can restore data.");
  return { db, ownerId: member.workspace_owner_id as string, email };
}

async function readBackup() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("Google Sheet ID is not configured.");
  const auth = new google.auth.GoogleAuth({ credentials: credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const result = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: sheetTabs.map((tab) => `'${tab}'!A:ZZ`) });
  const values = result.data.valueRanges || [];
  const rows = {} as Record<Tab, Row[]>;
  const counts = {} as Record<Tab, number>;
  const headers = {} as Record<Tab, string[]>;
  sheetTabs.forEach((tab, index) => {
    const data = values[index]?.values || [];
    const header = (data[0] || []).map(String);
    if (!header.length && tab === "Transporters") { headers[tab] = []; rows[tab] = []; counts[tab] = 0; return; }
    if (!header.length) throw new Error(`The ${tab} tab is missing or empty. Use a GeeBee backup sheet.`);
    headers[tab] = header;
    rows[tab] = data.slice(1).filter((line) => line.some((value: unknown) => String(value).trim())).map((line) => Object.fromEntries(header.map((name, column) => [name, String(line[column] ?? "")]))) as Row[];
    counts[tab] = rows[tab].length;
  });
  if (!headers.Customers.includes("Business Name") || !headers.Products.includes("SKU") || !headers.Orders.includes("Order ID")) throw new Error("This is not a valid GeeBee recovery backup. Do not rename backup headers.");
  return { rows, counts };
}

function restoreData(rows: Record<Tab, Row[]>) {
  const clients = rows.Customers.map((row, index) => ({ id: number(row["Record ID"]) || Date.now() + index, customerId: row["Customer ID"], name: row["Business Name"], contact: row["Contact Person"], phone: row.Mobile, whatsapp: row.WhatsApp, email: row.Email, gstin: row.GSTIN, pan: row.PAN, businessType: row["Business Type"], customerCategory: row["Customer Category"], state: row.State, city: row.City, address: row.Address, pincode: row.Pincode, credit: row["Credit Limit"], paymentTerms: row["Payment Terms"], assignedSalesperson: row["Assigned Salesperson"], customerStatus: row["Customer Status"], whatsappGroupLink: row["WhatsApp Group Link"], specialRates: json(row["Special Rates JSON"], []), avatar: initials(row["Business Name"] || "Customer") }));
  const catalogue = rows.Products.map((row, index) => ({ id: number(row["Record ID"]) || Date.now() + 1000 + index, sku: row.SKU, name: row["Product Name"], category: row.Category, subCategory: row["Sub-category"], brand: row.Brand, description: row.Description, cartonQty: row["Carton Qty"] || row["Outer Qty"] || "", innerQty: row["Inner Qty"] || "", outerQty: row["Outer Qty"] || row["Carton Qty"] || "", image: row["Image URL"] || "", unit: row.Unit, unitPrice: number(row["Selling Price"]), availableQuantity: number(row["Available Quantity"]), reorderThreshold: number(row["Low Stock Alert"]), reservedStock: number(row.Reserved), supplier: row.Supplier }));
  const backorders = new Map<string, unknown[]>();
  rows.Backorders.forEach((row) => { const orderId = row["Order ID"]; if (!orderId) return; backorders.set(orderId, [...(backorders.get(orderId) || []), { sku: row.SKU, product: row.Product, quantity: number(row["Short Quantity"]), unitPrice: number(row["Unit Price"]) }]); });
  const orders = rows.Orders.map((row) => { const products = json(row["Products JSON"], [] as unknown[]); const client = row.Customer || "Customer"; return { id: row["Order ID"], client: row.Customer, city: row.City, product: row.Product, sku: row.SKU, quantity: number(row.Quantity), unitPrice: number(row["Unit Price"]), eta: row.ETA, status: row.Status, payment: row["Payment Status"], transporter: row.Transporter, remarks: row.Remarks, clientApproval: row["Client Approval"], products, backorders: backorders.get(row["Order ID"]), avatar: initials(client) }; });
  const quotes = rows.Quotes.map((row) => ({ id: row["Quote Number"], customer: row.Customer, products: json(row["Products JSON"], []), gst: number(row["GST %"]), freight: number(row.Freight), validity: row.Validity, paymentTerms: row["Payment Terms"], deliveryTerms: row["Delivery Terms"], status: row.Status || "Draft", createdAt: row["Created At"] }));
  const invoices = rows.Invoices.map((row) => ({ id: row["Invoice Number"], client: row.Customer, order: row.Order, amount: row.Amount, due: row.Due, status: row.Status }));
  const leads = rows.Leads.map((row) => ({ id: row["Lead ID"], company: row.Company, contact: row["Contact Person"], mobile: row.Mobile, city: row.City, source: row.Source, salesperson: row["Assigned Salesperson"], requirement: row.Requirement, expectedValue: row["Expected Order Value"], expectedDate: row["Expected Order Date"], status: row.Status || "New", lostReason: row["Lost Reason"], createdAt: row["Created At"] }));
  const tasks = rows.Tasks.map((row) => ({ id: row["Task ID"], title: row.Title, description: row.Description, time: row.Time, dueDate: row["Due Date"], assignee: row.Assignee, type: row.Type || "Other", status: row.Status || "Open", relatedTo: row["Related To"] }));
  const transporters = rows.Transporters.map((row, index) => ({ id: number(row["Record ID"]) || Date.now() + 2000 + index, name: row["Transporter Name"], contact: row["Contact Person"], phone: row.Phone, email: row.Email, city: row.City, area: row.Area, gstin: row.GSTIN, serviceType: row["Service Type"], notes: row.Notes }));
  const suppliers = rows.Suppliers.map((row, index) => ({ id: number(row["Record ID"]) || Date.now() + 3000 + index, name: row["Supplier Name"], contact: row["Contact Person"], phone: row.Phone, email: row.Email, city: row.City, country: row.Country, gstin: row.GSTIN, paymentTerms: row["Payment Terms"], status: row.Status, notes: row.Notes }));
  const purchases = rows["Purchase Orders"].map((row) => ({ id: row["PO Number"], supplier: row.Supplier, status: row.Status, expectedDate: row["Expected Date"], createdAt: row["Created At"], notes: row.Notes, lines: json(row["Lines JSON"], []) }));
  return { clients, catalogue, orders, quotes, invoices, leads, tasks, transporters, suppliers, purchases };
}

const scalableTables = [
  ["clients", "crm_clients"], ["catalogue", "crm_stock_inventory"], ["orders", "crm_orders"], ["invoices", "crm_invoices"], ["leads", "crm_leads"], ["quotes", "crm_quotes"], ["tasks", "crm_tasks"], ["transporters", "crm_transporters"],
] as const;

async function readLiveData(db: any, ownerId: string) {
  const [results, workspaceResult] = await Promise.all([
    Promise.all(scalableTables.map(([, table]) => db.from(table).select("data").eq("workspace_owner_id", ownerId).limit(100000))),
    db.from("crm_workspaces").select("data").eq("owner_id", ownerId).single(),
  ]);
  if (results.every((result: any) => !result.error)) {
    const data = { ...Object.fromEntries(scalableTables.map(([key], index) => [key, (results[index].data || []).map((row: any) => row.data)])), suppliers: workspaceResult.data?.data?.suppliers || [], purchases: workspaceResult.data?.data?.purchases || [] };
    return { data, normalized: true };
  }
  const { data, error } = await db.from("crm_workspaces").select("data").eq("owner_id", ownerId).single();
  if (error || !data) throw new Error("The live workspace could not be protected before recovery.");
  return { data: data.data, normalized: false };
}

async function writeLiveData(db: any, ownerId: string, data: Record<string, any>) {
  const probes = await Promise.all(scalableTables.map(([, table]) => db.from(table).select("record_id").eq("workspace_owner_id", ownerId).limit(1)));
  if (!probes.every((result: any) => !result.error)) {
    const { error } = await db.from("crm_workspaces").update({ data, updated_at: new Date().toISOString() }).eq("owner_id", ownerId);
    if (error) throw error;
    return;
  }
  for (const [key, table] of scalableTables) {
    const { error: deleteError } = await db.from(table).delete().eq("workspace_owner_id", ownerId);
    if (deleteError) throw deleteError;
    const items = Array.isArray(data[key]) ? data[key] : [];
    if (!items.length) continue;
    const { error: insertError } = await db.from(table).upsert(items.map((item: any) => ({ workspace_owner_id: ownerId, record_id: String(item.id), search_key: JSON.stringify(item).toLowerCase(), data: item, updated_at: new Date().toISOString() })), { onConflict: "workspace_owner_id,record_id" });
    if (insertError) throw insertError;
  }
  const { error: anchorError } = await db.from("crm_workspaces").update({ data: { normalizedRecords: true, suppliers: Array.isArray(data.suppliers) ? data.suppliers : [], purchases: Array.isArray(data.purchases) ? data.purchases : [] }, updated_at: new Date().toISOString() }).eq("owner_id", ownerId);
  if (anchorError) throw anchorError;
}

export async function GET(request: Request) {
  try {
    const { db, ownerId } = await context(request);
    const backup = await readBackup();
    const { data: snapshots } = await db.from("crm_recovery_snapshots").select("id, source, created_at").eq("workspace_owner_id", ownerId).order("created_at", { ascending: false }).limit(5);
    return Response.json({ ok: true, counts: backup.counts, snapshots: snapshots || [] });
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not read the recovery backup." }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const { confirm, snapshotId } = await request.json();
    if (confirm !== "RESTORE GEEBEE") return Response.json({ error: "Type RESTORE GEEBEE exactly to approve this recovery." }, { status: 400 });
    const { db, ownerId, email } = await context(request);
    const current = await readLiveData(db, ownerId);
    const { error: snapshotError } = await db.from("crm_recovery_snapshots").insert({ workspace_owner_id: ownerId, restored_by: email, data: current.data });
    if (snapshotError) throw new Error("Recovery snapshot storage is not ready. Run the latest Supabase schema before restoring.");
    if (snapshotId) {
      const { data: snapshot, error: snapshotReadError } = await db.from("crm_recovery_snapshots").select("data").eq("workspace_owner_id", ownerId).eq("id", snapshotId).single();
      if (snapshotReadError || !snapshot) throw new Error("That recovery snapshot is no longer available.");
      await writeLiveData(db, ownerId, snapshot.data);
      await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: email, action: "Restored pre-recovery snapshot", module: "Data recovery", details: `Snapshot ${snapshotId}` });
      return Response.json({ ok: true, data: snapshot.data });
    }
    const backup = await readBackup();
    const restored = restoreData(backup.rows);
    await writeLiveData(db, ownerId, restored);
    await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: email, action: "Restored Google Sheets backup", module: "Data recovery", details: Object.entries(backup.counts).map(([tab, count]) => `${tab}: ${count}`).join(" | ") });
    return Response.json({ ok: true, data: restored, counts: backup.counts });
  } catch (error) { console.error("Google Sheets recovery failed:", error instanceof Error ? error.message : error); return Response.json({ error: error instanceof Error ? error.message : "Could not restore the CRM." }, { status: 400 }); }
}
