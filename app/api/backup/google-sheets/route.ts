import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

export const runtime = "nodejs";

type Workspace = { owner_id: string; data: Record<string, unknown>; updated_at: string };

const headers = {
  Customers: ["Record ID", "Customer ID", "Business Name", "Contact Person", "Mobile", "WhatsApp", "Email", "GSTIN", "PAN", "Business Type", "Customer Category", "State", "City", "Address", "Pincode", "Credit Limit", "Payment Terms", "Assigned Salesperson", "Customer Status", "WhatsApp Group Link", "Special Rates JSON"],
  Products: ["Record ID", "SKU", "Product Name", "Category", "Sub-category", "Brand", "Description", "Carton Qty", "Inner Qty", "Outer Qty", "Unit", "Selling Price", "Available Quantity", "Low Stock Alert", "Reserved", "Image URL", "Supplier"],
  Orders: ["Order ID", "Customer", "City", "Product", "SKU", "Quantity", "Unit Price", "ETA", "Status", "Payment Status", "Transporter", "Remarks", "Client Approval", "Products JSON"],
  Backorders: ["Order ID", "Customer", "SKU", "Product", "Short Quantity", "Unit Price"],
  Quotes: ["Quote Number", "Customer", "Products JSON", "GST %", "Freight", "Validity", "Payment Terms", "Delivery Terms", "Status", "Created At"],
  Invoices: ["Invoice Number", "Customer", "Order", "Amount", "Due", "Status"],
  Leads: ["Lead ID", "Company", "Contact Person", "Mobile", "City", "Source", "Assigned Salesperson", "Requirement", "Expected Order Value", "Expected Order Date", "Status", "Lost Reason", "Created At"],
  Tasks: ["Task ID", "Title", "Description", "Time", "Due Date", "Assignee", "Type", "Status", "Related To"],
  Transporters: ["Record ID", "Transporter Name", "Contact Person", "Phone", "Email", "City", "Area", "GSTIN", "Service Type", "Notes"],
  Suppliers: ["Record ID", "Supplier Name", "Contact Person", "Phone", "Email", "City", "Country", "GSTIN", "Payment Terms", "Status", "Notes"],
  "Purchase Orders": ["PO Number", "Supplier", "Status", "Expected Date", "Created At", "Notes", "Lines JSON"],
  "Audit Log": ["Event ID", "Workspace Owner", "Actor", "Action", "Module", "Details", "Created At"],
};

const text = (value: unknown) => value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
const rows = (items: unknown, fields: string[]) => Array.isArray(items) ? items.map((item) => fields.map((field) => text((item as Record<string, unknown>)[field]))) : [];

async function ensureSheets(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string, titles: string[]) {
  const current = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = new Set(current.data.sheets?.map((sheet) => sheet.properties?.title).filter(Boolean) as string[]);
  const missing = titles.filter((title) => !existing.has(title));
  if (missing.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) } });
}

async function authorisedWorkspace(request: Request, url: string, serviceKey: string) {
  const expected = process.env.BACKUP_CRON_SECRET;
  if (expected && request.headers.get("authorization") === `Bearer ${expected}`) return null;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized backup request.");
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error } = await db.auth.getUser(token);
  if (error || !userData.user?.email) throw new Error("Unauthorized backup request.");
  const { data: owned } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", userData.user.id).maybeSingle();
  if (owned?.owner_id) return owned.owner_id as string;
  const { data: member } = await db.from("crm_workspace_members").select("workspace_owner_id").ilike("email", userData.user.email).maybeSingle();
  if (!member?.workspace_owner_id) throw new Error("Unauthorized backup request.");
  return member.workspace_owner_id as string;
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!url || !serviceKey || !spreadsheetId || !keyJson) return Response.json({ error: "Backup configuration is incomplete." }, { status: 500 });
  try {
    const liveMirror = new URL(request.url).searchParams.get("mode") === "live";
    const requestedOwnerId = await authorisedWorkspace(request, url, serviceKey);
    const credentials = JSON.parse(keyJson);
    if (typeof credentials.private_key === "string") credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const sheets = google.sheets({ version: "v4", auth });
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const owner = requestedOwnerId;
    const [{ data: workspaces, error: workspaceError }, { data: auditEvents, error: auditError }, { data: stockRows, error: stockError }, ...recordResults] = await Promise.all([
      owner ? supabase.from("crm_workspaces").select("owner_id, data, updated_at").eq("owner_id", owner) : supabase.from("crm_workspaces").select("owner_id, data, updated_at"),
      owner ? supabase.from("crm_audit_events").select("id, workspace_owner_id, actor_email, action, module, details, created_at").eq("workspace_owner_id", owner).order("created_at", { ascending: false }).limit(500) : supabase.from("crm_audit_events").select("id, workspace_owner_id, actor_email, action, module, details, created_at").order("created_at", { ascending: false }).limit(500),
      owner ? supabase.from("crm_stock_inventory").select("data").eq("workspace_owner_id", owner).limit(100000) : supabase.from("crm_stock_inventory").select("data").limit(100000),
      ...["crm_clients", "crm_orders", "crm_invoices", "crm_leads", "crm_quotes", "crm_tasks", "crm_transporters"].map((table) => owner ? supabase.from(table).select("data").eq("workspace_owner_id", owner).limit(100000) : supabase.from(table).select("data").limit(100000)),
    ]);
    if (workspaceError) throw workspaceError;
    // Audit history is useful, but a backup of core business data must still
    // succeed if an older database has not created the audit table yet.
    const safeAuditEvents = auditError ? [] : auditEvents || [];
    const workspace = ((workspaces || [])[0] as Workspace | undefined);
    if (!workspace) throw new Error("No GeeBee workspace was found.");
    const normalizedReady = !stockError && recordResults.every((result) => !result.error);
    const normalized = normalizedReady ? recordResults.map((result) => (result.data || []).map((row: any) => row.data)) : [];
    const data = normalizedReady ? { clients: normalized[0], catalogue: (stockRows || []).map((row: any) => row.data), orders: normalized[1], invoices: normalized[2], leads: normalized[3], quotes: normalized[4], tasks: normalized[5], transporters: normalized[6] } : workspace.data || {};
    const backupRows: Record<string, string[][]> = {
      Customers: rows(data.clients, ["id", "customerId", "name", "contact", "phone", "whatsapp", "email", "gstin", "pan", "businessType", "customerCategory", "state", "city", "address", "pincode", "credit", "paymentTerms", "assignedSalesperson", "customerStatus", "whatsappGroupLink", "specialRates"]),
      Products: rows(data.catalogue, ["id", "sku", "name", "category", "subCategory", "brand", "description", "cartonQty", "innerQty", "outerQty", "unit", "unitPrice", "availableQuantity", "reorderThreshold", "reservedStock", "image", "supplier"]),
      Orders: rows(data.orders, ["id", "client", "city", "product", "sku", "quantity", "unitPrice", "eta", "status", "payment", "transporter", "remarks", "clientApproval", "products"]),
      Backorders: Array.isArray(data.orders) ? data.orders.flatMap((order: any) => Array.isArray(order.backorders) ? order.backorders.map((line: any) => [text(order.id), text(order.client), text(line.sku), text(line.product), text(line.quantity), text(line.unitPrice)]) : []) : [],
      Quotes: rows(data.quotes, ["id", "customer", "products", "gst", "freight", "validity", "paymentTerms", "deliveryTerms", "status", "createdAt"]),
      Invoices: rows(data.invoices, ["id", "client", "order", "amount", "due", "status"]),
      Leads: rows(data.leads, ["id", "company", "contact", "mobile", "city", "source", "salesperson", "requirement", "expectedValue", "expectedDate", "status", "lostReason", "createdAt"]),
      Tasks: rows(data.tasks, ["id", "title", "description", "time", "dueDate", "assignee", "type", "status", "relatedTo"]),
      Transporters: rows(data.transporters, ["id", "name", "contact", "phone", "email", "city", "area", "gstin", "serviceType", "notes"]),
      Suppliers: rows((workspace.data || {}).suppliers, ["id", "name", "contact", "phone", "email", "city", "country", "gstin", "paymentTerms", "status", "notes"]),
      "Purchase Orders": rows((workspace.data || {}).purchases, ["id", "supplier", "status", "expectedDate", "createdAt", "notes", "lines"]),
      "Audit Log": safeAuditEvents.map((event: any) => [text(event.id), text(event.workspace_owner_id), text(event.actor_email), text(event.action), text(event.module), text(event.details), text(event.created_at)]),
    };
    const titles = ["README", "Backup Log", ...Object.keys(headers)];
    await ensureSheets(sheets, spreadsheetId, titles);
    // One mirror used to clear and rewrite each tab separately (roughly 28
    // write requests). Batch the whole workbook into three requests instead:
    // clear, write current data, then append the log entry.
    await sheets.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges: [...Object.keys(headers).map((title) => `'${title}'!A:ZZ`), "'README'!A:Z", "'Backup Log'!A:Z"] } });
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: {
      valueInputOption: "RAW",
      data: [
        ...Object.entries(headers).map(([title, header]) => ({ range: `'${title}'!A1`, values: [header, ...backupRows[title]] })),
        { range: "'README'!A1", values: [["GeeBee CRM Recovery Backup"], ["Do not rename column headers. Restore imports validate these tabs and columns."], ["Latest backup", new Date().toISOString()], ["Workspace updated at", workspace.updated_at]] },
        { range: "'Backup Log'!A1", values: [["Backup timestamp", "Status", "Workspace updated at", "Record counts"]] },
      ],
    } });
    const countSummary = Object.entries(backupRows).map(([title, value]) => `${title}: ${value.length}`).join(" | ");
    await sheets.spreadsheets.values.append({ spreadsheetId, range: "'Backup Log'!A:D", valueInputOption: "RAW", requestBody: { values: [[new Date().toISOString(), "Success", workspace.updated_at, countSummary]] } });
    // Live mirroring happens after every successful CRM save. It deliberately
    // avoids creating a Supabase recovery snapshot on every keystroke-sized
    // update; the scheduled backup retains that second rollback point.
    if (!liveMirror) {
      const snapshotData = {
        ...data,
        suppliers: Array.isArray((workspace.data || {}).suppliers) ? (workspace.data || {}).suppliers : [],
        purchases: Array.isArray((workspace.data || {}).purchases) ? (workspace.data || {}).purchases : [],
      };
      const { error: snapshotError } = await supabase.from("crm_recovery_snapshots").insert({
        workspace_owner_id: workspace.owner_id,
        restored_by: "Automated backup",
        source: "Google Sheets backup",
        data: snapshotData,
      });
      if (snapshotError) console.error("Server recovery snapshot was not saved:", snapshotError.message);
    }
    return Response.json({ ok: true, backupAt: new Date().toISOString(), records: countSummary, liveMirror });
  } catch (error) {
    console.error("Google Sheets backup failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: error instanceof Error ? error.message : "Google Sheets backup failed." }, { status: 500 });
  }
}
