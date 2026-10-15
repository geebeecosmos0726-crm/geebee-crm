import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

export const runtime = "nodejs";

type ProductLine = { product: string; sku: string; quantity: number; unitPrice: number };
type ImportedOrder = { id: string; client: string; city: string; product: string; sku: string; quantity: number; unitPrice: number; products: ProductLine[]; eta: string; status: "Draft"; payment: "Partial"; avatar: string; remarks: string };
type ImportedClient = { id: number; customerId: string; name: string; city: string; contact: string; phone: string; credit: string; customerStatus: string; avatar: string; specialRates: [] };

const sheetId = process.env.GOOGLE_ORDER_IMPORT_SHEET_ID;
const key = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const number = (value: unknown) => Number(String(value ?? "").replace(/[,₹Rs.\s]/gi, "")) || 0;
const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CU";
const quoteRange = (title: string) => `'${title.replace(/'/g, "''")}'!A:Z`;

function tabDetails(title: string) {
  const parts = title.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 3) return null;
  const [id, client, city] = parts;
  if (!id || !client || !city) return null;
  return { id, client, city };
}

function findColumn(row: string[], names: string[]) {
  return row.findIndex((value) => names.includes(key(value)));
}

function readLines(values: unknown[][], products: Map<string, { name?: string }>) {
  const rows = values.map((row) => Array.isArray(row) ? row.map((value) => String(value ?? "")) : []);
  const headerIndex = rows.findIndex((row) => findColumn(row, ["item", "sku", "product", "productsku"]) >= 0 && findColumn(row, ["quantity", "qty"]) >= 0);
  if (headerIndex < 0) return [] as ProductLine[];
  const header = rows[headerIndex];
  const itemIndex = findColumn(header, ["item", "sku", "product", "productsku"]);
  const quantityIndex = findColumn(header, ["quantity", "qty"]);
  const priceIndex = findColumn(header, ["price", "rate", "unitprice"]);
  const lines: ProductLine[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const item = (row[itemIndex] || "").trim();
    const quantity = number(row[quantityIndex]);
    if (!item && !quantity) continue;
    if (key(item).includes("total") || key(item).includes("transporter")) break;
    if (!item || quantity <= 0) continue;
    const matched = products.get(key(item));
    lines.push({ sku: item.toUpperCase(), product: matched?.name?.trim() || item.toUpperCase(), quantity, unitPrice: priceIndex >= 0 ? number(row[priceIndex]) : 0 });
  }
  return lines;
}

async function administrator(request: Request, url: string, serviceKey: string) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in again before fetching orders.");
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error } = await db.auth.getUser(token);
  const email = userData.user?.email;
  if (error || !userData.user || !email) throw new Error("Sign in again before fetching orders.");
  const { data: owned } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", userData.user.id).maybeSingle();
  if (owned?.owner_id) return { db, ownerId: owned.owner_id, email };
  const { data: member } = await db.from("crm_workspace_members").select("workspace_owner_id, role").ilike("email", email).eq("role", "admin").maybeSingle();
  if (!member?.workspace_owner_id) throw new Error("Only GeeBee administrators can fetch connected sheet orders.");
  return { db, ownerId: member.workspace_owner_id, email };
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!url || !serviceKey || !keyJson || !sheetId) return Response.json({ error: "Google order-sheet connection is not configured yet." }, { status: 500 });
  try {
    const { db, ownerId, email } = await administrator(request, url, serviceKey);
    const credentials = JSON.parse(keyJson);
    if (typeof credentials.private_key === "string") credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
    const sheets = google.sheets({ version: "v4", auth });
    const [{ data: existingOrders, error: ordersError }, { data: existingClients, error: clientsError }, { data: catalogue, error: productsError }, metadata] = await Promise.all([
      db.from("crm_orders").select("record_id").eq("workspace_owner_id", ownerId).limit(100000),
      db.from("crm_clients").select("record_id, data").eq("workspace_owner_id", ownerId).limit(100000),
      db.from("crm_products").select("data").eq("workspace_owner_id", ownerId).limit(100000),
      sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties" }),
    ]);
    if (ordersError || clientsError || productsError) throw ordersError || clientsError || productsError;
    const knownOrderIds = new Set((existingOrders || []).map((row) => key(row.record_id)));
    const knownClients = new Set((existingClients || []).map((row: any) => key(row.data?.name)));
    const productMap = new Map((catalogue || []).map((row: any) => [key(row.data?.sku), row.data as { name?: string }]));
    const imported: ImportedOrder[] = [];
    const createdClients: ImportedClient[] = [];
    const skipped: string[] = [];
    for (const sheet of metadata.data.sheets || []) {
      const title = sheet.properties?.title || "";
      const details = tabDetails(title);
      if (!details) { skipped.push(`${title || "Untitled tab"}: use Order ID | Customer | City`); continue; }
      if (knownOrderIds.has(key(details.id))) { skipped.push(`${details.id}: already in CRM`); continue; }
      const result = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: quoteRange(title) });
      const lines = readLines((result.data.values || []) as unknown[][], productMap);
      if (!lines.length) { skipped.push(`${details.id}: no ITEM and QUANTITY rows found`); continue; }
      const first = lines[0];
      imported.push({ id: details.id, client: details.client, city: details.city, product: first.product, sku: first.sku, quantity: first.quantity, unitPrice: first.unitPrice, products: lines, eta: "", status: "Draft", payment: "Partial", avatar: initials(details.client), remarks: "Imported from connected Google Sheet" });
      knownOrderIds.add(key(details.id));
      if (!knownClients.has(key(details.client))) {
        const id = Date.now() + createdClients.length;
        createdClients.push({ id, customerId: `GB-C${String(id).slice(-7)}`, name: details.client, city: details.city, contact: "", phone: "", credit: "", customerStatus: "Incomplete profile", avatar: initials(details.client), specialRates: [] });
        knownClients.add(key(details.client));
      }
    }
    if (imported.length) {
      const now = new Date().toISOString();
      const { error } = await db.from("crm_orders").insert(imported.map((order) => ({ workspace_owner_id: ownerId, record_id: order.id, search_key: `${order.id} ${order.client} ${order.city} ${order.sku}`.toLowerCase(), data: order, created_at: now, updated_at: now })));
      if (error) throw error;
      if (createdClients.length) {
        const { error: clientInsertError } = await db.from("crm_clients").insert(createdClients.map((client) => ({ workspace_owner_id: ownerId, record_id: String(client.id), search_key: `${client.customerId} ${client.name} ${client.city}`.toLowerCase(), data: client, created_at: now, updated_at: now })));
        if (clientInsertError) throw clientInsertError;
      }
      await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: email, action: "Fetched connected Google Sheet orders", module: "Orders", details: `${imported.length} new order(s) imported; ${skipped.length} tab(s) skipped` });
    }
    return Response.json({ orders: imported, clients: createdClients, skipped, scanned: metadata.data.sheets?.length || 0 });
  } catch (error) {
    console.error("Google order import failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not fetch the connected Google Sheet." }, { status: 400 });
  }
}
