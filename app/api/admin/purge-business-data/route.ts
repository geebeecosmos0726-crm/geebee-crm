import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

export const runtime = "nodejs";

const sheetHeaders: Record<string, string[]> = {
  Customers: ["Record ID", "Customer ID", "Business Name", "Contact Person", "Mobile", "WhatsApp", "Email", "GSTIN", "PAN", "Business Type", "Customer Category", "State", "City", "Address", "Pincode", "Credit Limit", "Payment Terms", "Assigned Salesperson", "Customer Status", "Special Rates JSON"],
  Orders: ["Order ID", "Customer", "City", "Product", "SKU", "Quantity", "Unit Price", "ETA", "Status", "Payment Status", "Products JSON"],
  Backorders: ["Order ID", "Customer", "SKU", "Product", "Short Quantity", "Unit Price"],
  Quotes: ["Quote Number", "Customer", "Products JSON", "GST %", "Freight", "Validity", "Payment Terms", "Delivery Terms", "Status", "Created At"],
  Invoices: ["Invoice Number", "Customer", "Order", "Amount", "Due", "Status"],
  Leads: ["Lead ID", "Company", "Contact Person", "Mobile", "City", "Source", "Assigned Salesperson", "Requirement", "Expected Order Value", "Expected Order Date", "Status", "Lost Reason", "Created At"],
  Tasks: ["Task ID", "Title", "Time", "Due Date", "Assignee", "Type", "Status", "Related To"],
  Transporters: ["Record ID", "Transporter Name", "Contact Person", "Phone", "Email", "City", "GSTIN", "Service Type", "Notes"],
  "Audit Log": ["Event ID", "Workspace Owner", "Actor", "Action", "Module", "Details", "Created At"],
};

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const body = await request.json().catch(() => ({}));
  if (body.confirm !== "DELETE ALL BUSINESS DATA") return Response.json({ error: "Confirmation is required." }, { status: 400 });
  if (!url || !serviceKey || !token) return Response.json({ error: "Reset service is not configured." }, { status: 500 });

  const auth = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await auth.auth.getUser(token);
  if (userError || !userData.user?.email) return Response.json({ error: "Sign in again before clearing data." }, { status: 401 });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const user = userData.user;
  const userEmail = user.email!;
  const { data: owned } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", user.id).maybeSingle();
  const { data: membership } = owned ? { data: null } : await db.from("crm_workspace_members").select("workspace_owner_id, role").ilike("email", userEmail).eq("role", "admin").maybeSingle();
  const ownerId = owned?.owner_id || membership?.workspace_owner_id;
  if (!ownerId) return Response.json({ error: "Only a GeeBee administrator can clear business data." }, { status: 403 });

  try {
    const tables = ["crm_clients", "crm_orders", "crm_invoices", "crm_leads", "crm_quotes", "crm_tasks", "crm_transporters", "crm_audit_events", "crm_recovery_snapshots"];
    const counts = await Promise.all(tables.map(async (table) => {
      const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("workspace_owner_id", ownerId);
      if (error) throw error;
      return [table, count || 0] as const;
    }));
    for (const table of tables) {
      const { error } = await db.from(table).delete().eq("workspace_owner_id", ownerId);
      if (error) throw error;
    }
    const { error: workspaceError } = await db.from("crm_workspaces").update({ data: { normalizedRecords: true, purchases: [], resetAt: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq("owner_id", ownerId);
    if (workspaceError) throw workspaceError;

    if (spreadsheetId && keyJson) {
      const credentials = JSON.parse(keyJson);
      if (typeof credentials.private_key === "string") credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
      const sheets = google.sheets({ version: "v4", auth: new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
      for (const [title, header] of Object.entries(sheetHeaders)) {
        await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${title}'!A:ZZ` });
        await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${title}'!A1`, valueInputOption: "RAW", requestBody: { values: [header] } });
      }
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: "'README'!A:Z" });
      await sheets.spreadsheets.values.update({ spreadsheetId, range: "'README'!A1", valueInputOption: "RAW", requestBody: { values: [["GeeBee CRM Recovery Backup"], ["Business data was permanently cleared by an administrator. The Products tab has been preserved."], ["Cleared at", new Date().toISOString()]] } });
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: "'Backup Log'!A:Z" });
      await sheets.spreadsheets.values.update({ spreadsheetId, range: "'Backup Log'!A1", valueInputOption: "RAW", requestBody: { values: [["Backup timestamp", "Status", "Workspace updated at", "Record counts"], [new Date().toISOString(), "Business data permanently cleared", "", "Products preserved"]] } });
    }
    return Response.json({ ok: true, cleared: Object.fromEntries(counts), productsPreserved: true });
  } catch (error) {
    console.error("Business data purge failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not clear business data." }, { status: 500 });
  }
}
