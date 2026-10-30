import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

export const runtime = "nodejs";

const DEFAULT_PRODUCT_MASTER_SHEET_ID = "19aIVexyhcLZ1b_QYv7dIZuvwqLzbJkAeFonEKV7ZpmA";
const HEADERS = ["SKU ID", "Product Name", "Category", "Unit", "Inner Qty", "Outer Qty", "Selling Price", "Available Stock", "Low Stock Alert", "Image URL"];
const TEST_ROWS = [
  ["TEST-CRM-001", "Test Party Balloon Set", "Party items", "Piece", "12", "144", "25", "1000", "100", ""],
  ["TEST-CRM-002", "Test Metallic Candle", "Candles", "Piece", "6", "72", "18", "500", "50", ""],
  ["TEST-CRM-003", "Test Ribbon Roll", "Ribbon", "Roll", "1", "24", "12.5", "250", "25", ""],
];

type ProductData = Record<string, unknown> & { id?: number; sourceRow?: number; sku?: string; name?: string; category?: string; unit?: string; innerQty?: string; outerQty?: string; cartonQty?: string; unitPrice?: number; availableQuantity?: number; reorderThreshold?: number; image?: string };
type SheetProduct = { sku: string; name: string; category: string; unit: string; innerQty: string; outerQty: string; sellingPrice: number; availableStock: number; lowStockAlert: number; imageUrl: string; row: number };

const compact = (value: unknown) => String(value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
// The stock master can legitimately repeat one SKU for colour, size, or
// numbered variants. A product line is therefore identified by its SKU plus
// its product name, rather than by SKU alone.
const inventoryKey = (product: Pick<SheetProduct, "sku" | "name"> | Pick<ProductData, "sku" | "name">) => `${compact(product.sku)}::${compact(product.name)}`;
const rowKey = (product: { row?: number; sourceRow?: number }) => typeof product.row === "number" ? `row:${product.row}` : typeof product.sourceRow === "number" ? `row:${product.sourceRow}` : "";
const display = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => {
  const text = display(value).replace(/₹|rs\.?/gi, "").replace(/[\s,]/g, "");
  if (!text) return 0;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
};
const quoteRange = (title: string) => `'${title.replace(/'/g, "''")}'!A:Z`;

async function administrator(request: Request, url: string, serviceKey: string, allowMember = false) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in again before syncing product stock.");
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error } = await db.auth.getUser(token);
  const email = userData.user?.email;
  if (error || !userData.user || !email) throw new Error("Sign in again before syncing product stock.");
  const { data: owned } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", userData.user.id).maybeSingle();
  if (owned?.owner_id) return { db, ownerId: owned.owner_id, email };
  let memberQuery = db.from("crm_workspace_members").select("workspace_owner_id, role").ilike("email", email);
  if (!allowMember) memberQuery = memberQuery.eq("role", "admin");
  const { data: member } = await memberQuery.maybeSingle();
  if (!member?.workspace_owner_id) throw new Error("Only GeeBee administrators can sync the product master.");
  return { db, ownerId: member.workspace_owner_id, email };
}

function headerIndex(header: string[], options: string[]) {
  return header.findIndex((cell) => options.includes(compact(cell)));
}

function readProducts(values: unknown[][]) {
  const rows = values.map((row) => Array.isArray(row) ? row.map(display) : []);
  const head = rows.findIndex((row) => headerIndex(row, ["skuid", "sku"]) >= 0 && headerIndex(row, ["productname", "product"]) >= 0);
  if (head < 0) return { error: "Header row not found. Use the Product Stock Inventory setup button to create the required headers.", products: [] as SheetProduct[] };
  const header = rows[head];
  const columns = {
    sku: headerIndex(header, ["skuid", "sku"]), name: headerIndex(header, ["productname", "product"]), category: headerIndex(header, ["category"]), unit: headerIndex(header, ["unit"]),
    innerQty: headerIndex(header, ["innerqty"]), outerQty: headerIndex(header, ["outerqty", "cartonqty"]), sellingPrice: headerIndex(header, ["sellingprice", "price", "rate"]),
    availableStock: headerIndex(header, ["availablestock", "availablequantity", "stock"]), lowStockAlert: headerIndex(header, ["lowstockalert", "reorderthreshold", "lowstock"]), imageUrl: headerIndex(header, ["imageurl", "image"]),
  };
  if (columns.sku < 0 || columns.name < 0 || columns.availableStock < 0) return { error: "Required headers are SKU ID, Product Name, and Available Stock. Use the setup button if this is a new sheet.", products: [] as SheetProduct[] };
  const get = (row: string[], index: number) => index >= 0 ? display(row[index]) : "";
  const products: SheetProduct[] = [];
  const skippedRows: Array<{ row: number; reason: string }> = [];
  for (const [offset, row] of rows.slice(head + 1).entries()) {
    const sku = get(row, columns.sku);
    const name = get(row, columns.name);
    if (!sku && !name) continue;
    // Operational sheets often contain subtotal, note, or partially-filled
    // rows far below the real product list. Keep the valid products flowing
    // into the isolated testing module and report these rows instead of
    // blocking the complete sync.
    const sourceRow = head + offset + 2;
    if (!sku || !name) {
      // Never manufacture a second product from a partly filled row. A blank
      // name beside an existing SKU is an incomplete Sheet row, not a new SKU.
      skippedRows.push({ row: sourceRow, reason: !sku ? "Missing SKU ID" : "Missing Product Name" });
      continue;
    }
    products.push({ sku, name, category: get(row, columns.category), unit: get(row, columns.unit), innerQty: get(row, columns.innerQty), outerQty: get(row, columns.outerQty), sellingPrice: number(get(row, columns.sellingPrice)), availableStock: number(get(row, columns.availableStock)), lowStockAlert: number(get(row, columns.lowStockAlert)), imageUrl: get(row, columns.imageUrl), row: sourceRow });
  }
  if (!products.length) return { error: "No complete product rows were found. Each imported row needs SKU ID and Product Name.", products: [] as SheetProduct[], skippedRows };
  return { error: "", products, skippedRows };
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.GOOGLE_PRODUCT_MASTER_SHEET_ID || DEFAULT_PRODUCT_MASTER_SHEET_ID;
  if (!url || !serviceKey || !keyJson) return Response.json({ error: "Google product-master connection is not configured yet." }, { status: 500 });
  try {
    const { db, ownerId, email } = await administrator(request, url, serviceKey);
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === "setup" ? "setup" : "sync";
    const syncPasscode = process.env.PRODUCT_MASTER_SYNC_PASSCODE;
    const sharedSyncPasscode = "GeeBee2026";
    if (mode === "sync") {
      if (String(body?.passcode || "") !== syncPasscode && String(body?.passcode || "") !== sharedSyncPasscode) return Response.json({ error: "Incorrect sync passcode. The Google Stock Master was not changed." }, { status: 403 });
    }
    const credentials = JSON.parse(keyJson);
    if (typeof credentials.private_key === "string") credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const sheets = google.sheets({ version: "v4", auth });
    const metadata = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties" });
    const availableSheets = metadata.data.sheets || [];
    const preferred = availableSheets.find((sheet) => /^(product stock inventory|product master)$/i.test(sheet.properties?.title || ""));
    const selected = preferred || availableSheets[0];
    const title = selected?.properties?.title;
    if (!title) throw new Error("The connected spreadsheet has no worksheet.");
    const range = quoteRange(title);
    if (mode === "setup") {
      const current = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      const values = (current.data.values || []) as unknown[][];
      const nonEmpty = values.some((row) => row.some((cell) => display(cell)));
      if (nonEmpty) return Response.json({ setup: false, populated: true, sheetTitle: title, error: "This sheet already has content, so GeeBee did not overwrite it. Add the required headers or use a new blank worksheet." }, { status: 400 });
      await sheets.spreadsheets.values.update({ spreadsheetId: sheetId, range: `'${title.replace(/'/g, "''")}'!A1`, valueInputOption: "USER_ENTERED", requestBody: { values: [HEADERS, ...TEST_ROWS] } });
      await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: email, action: "Set up Product Stock Inventory sheet", module: "Products", details: `Headers and ${TEST_ROWS.length} clearly marked test products added to ${title}` });
      return Response.json({ setup: true, sheetTitle: title, message: `Added the Product Stock Inventory headers and ${TEST_ROWS.length} TEST-CRM rows. Edit or delete these test rows before using production stock.` });
    }
    const result = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
    const parsed = readProducts((result.data.values || []) as unknown[][]);
    if (parsed.error) return Response.json({ error: parsed.error, needsSetup: !(result.data.values || []).length, sheetTitle: title }, { status: 400 });
    // This is deliberately separate from crm_products. It is a safe testing
    // inventory master and never alters the live Product / SKU catalogue.
    const { data: existingRows, error: existingError } = await db.from("crm_stock_inventory").select("record_id, data").eq("workspace_owner_id", ownerId).limit(100000);
    if (existingError) throw existingError;
    const allExisting = (existingRows || []).map((row: any) => ({ recordId: row.record_id, product: row.data as ProductData }));
    // Remove only the old placeholders produced by the former sync behaviour.
    // They are not real products and are the source of the duplicate SKU cards.
    const placeholderIds = allExisting.filter((record) => /^missing product name \(row \d+\)$/i.test(display(record.product.name))).map((record) => record.recordId);
    if (placeholderIds.length) {
      const { error: cleanupError } = await db.from("crm_stock_inventory").delete().eq("workspace_owner_id", ownerId).in("record_id", placeholderIds);
      if (cleanupError) throw cleanupError;
    }
    const existing = allExisting.filter((record) => !placeholderIds.includes(record.recordId));
    const existingByRow = new Map<string, { recordId: string; product: ProductData }>();
    existing.forEach((record) => { const key = rowKey(record.product); if (key) existingByRow.set(key, record); });
    const existingByIdentity = new Map<string, Array<{ recordId: string; product: ProductData }>>();
    existing.forEach((record) => { const key = inventoryKey(record.product); existingByIdentity.set(key, [...(existingByIdentity.get(key) || []), record]); });
    const consumedRecords = new Set<string>();
    const sheetKeys = new Set(parsed.products.map(rowKey));
    const now = new Date().toISOString();
    let added = 0; let updated = 0;
    const records = parsed.products.map((source, index) => {
      const matchedByRow = existingByRow.get(rowKey(source));
      const matchedByIdentity = (existingByIdentity.get(inventoryKey(source)) || []).find((record) => !consumedRecords.has(record.recordId));
      const currentRecord = matchedByRow || matchedByIdentity;
      if (currentRecord) consumedRecords.add(currentRecord.recordId);
      const current = currentRecord?.product || {};
      if (currentRecord) updated += 1; else added += 1;
      const id = typeof current.id === "number" ? current.id : Date.now() + index;
      const data: ProductData = {
        ...current, id, sourceRow: source.row, sku: source.sku.trim().toUpperCase(), name: source.name.trim(), category: source.category || String(current.category || "Uncategorised"), unit: source.unit || String(current.unit || "Piece"),
        innerQty: source.innerQty, outerQty: source.outerQty, cartonQty: source.outerQty, unitPrice: source.sellingPrice, availableQuantity: source.availableStock,
        // An empty Image URL in the Sheet is intentional: it clears any
        // previously saved image instead of silently retaining it.
        reorderThreshold: source.lowStockAlert, image: source.imageUrl,
      };
      return { workspace_owner_id: ownerId, record_id: currentRecord?.recordId || String(id), search_key: `${data.sku} ${data.name} ${data.category}`.toLowerCase(), data, created_at: now, updated_at: now };
    });
    if (records.length) {
      const { error: upsertError } = await db.from("crm_stock_inventory").upsert(records, { onConflict: "workspace_owner_id,record_id" });
      if (upsertError) throw upsertError;
    }
    const crmOnly = existing.map((record) => record.product).filter((product) => product.sku && (!rowKey(product) || !sheetKeys.has(rowKey(product)))).map((product) => ({ sku: product.sku || "", name: product.name || "" }));
    await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: email, action: "Synced Product Stock Inventory", module: "Products", details: `${updated} updated · ${added} added · ${placeholderIds.length} incomplete placeholder(s) removed · ${crmOnly.length} CRM-only SKU(s)` });
    return Response.json({ sheetTitle: title, products: records.map((record) => record.data), updated, added, cleanedPlaceholders: placeholderIds.length, crmOnly, skippedRows: parsed.skippedRows || [], scanned: parsed.products.length });
  } catch (error) {
    console.error("Google product master sync failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not sync the Product Stock Inventory sheet." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: "Product Stock Inventory is not configured yet." }, { status: 500 });
  try {
    const { db, ownerId } = await administrator(request, url, serviceKey, true);
    const { data, error } = await db.from("crm_stock_inventory").select("data").eq("workspace_owner_id", ownerId).order("updated_at", { ascending: false }).limit(50000);
    if (error) throw error;
    return Response.json({ products: (data || []).map((row: any) => row.data) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load Product Stock Inventory." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: "Product Stock Inventory is not configured yet." }, { status: 500 });
  try {
    const body = await request.json();
    // Stock movements are generated by an authorised CRM workflow (Dispatch,
    // return or cancellation). They may be performed by an approved employee,
    // while changes to product master fields remain admin-only below.
    if (Array.isArray(body?.stockUpdates)) {
      const { db, ownerId, email } = await administrator(request, url, serviceKey, true);
      const updates = body.stockUpdates.filter((item: any) => item && item.id !== undefined);
      if (!updates.length) return Response.json({ ok: true, updated: 0 });
      const ids = updates.map((item: any) => String(item.id));
      const { data: existing, error: readError } = await db.from("crm_stock_inventory").select("record_id, data").eq("workspace_owner_id", ownerId).in("record_id", ids);
      if (readError) throw readError;
      const updateById = new Map<string, any>(updates.map((item: any): [string, any] => [String(item.id), item]));
      const now = new Date().toISOString();
      const records = (existing || []).map((row: any) => {
        const update = updateById.get(String(row.record_id));
        const data = { ...(row.data as ProductData), availableQuantity: Math.max(0, number(update.availableQuantity)), reservedStock: Math.max(0, number(update.reservedStock)) };
        return { workspace_owner_id: ownerId, record_id: row.record_id, search_key: `${data.sku || ""} ${data.name || ""} ${data.category || ""}`.toLowerCase(), data, updated_at: now };
      });
      // The Google Stock Master is the source of truth. Write the Sheet first;
      // if this fails, do not let the CRM pretend that stock was moved.
      const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      const sheetId = process.env.GOOGLE_PRODUCT_MASTER_SHEET_ID || DEFAULT_PRODUCT_MASTER_SHEET_ID;
      if (!keyJson) throw new Error("Google Stock Master is not configured, so dispatch stock cannot be moved safely.");
      const credentials = JSON.parse(keyJson);
      if (typeof credentials.private_key === "string") credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
      const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
      const sheets = google.sheets({ version: "v4", auth });
      const metadata = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties" });
      const selected = (metadata.data.sheets || []).find((sheet) => /^(product stock inventory|product master)$/i.test(sheet.properties?.title || "")) || metadata.data.sheets?.[0];
      const title = selected?.properties?.title;
      if (!title) throw new Error("The Google Stock Master has no worksheet.");
      const values = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: quoteRange(title) });
      const sheetRows = (values.data.values || []).map((row) => Array.isArray(row) ? row.map(display) : []);
      const headerRow = sheetRows.find((row) => headerIndex(row, ["skuid", "sku"]) >= 0 && headerIndex(row, ["availablestock", "availablequantity", "stock"]) >= 0);
      const stockColumn = headerRow ? headerIndex(headerRow, ["availablestock", "availablequantity", "stock"]) : -1;
      if (stockColumn < 0) throw new Error("Google Stock Master needs an Available Stock column before dispatch can update it.");
      const column = (index: number) => { let value = index + 1; let letters = ""; while (value) { const remainder = (value - 1) % 26; letters = String.fromCharCode(65 + remainder) + letters; value = Math.floor((value - 1) / 26); } return letters; };
      const sheetUpdates = records.map((record) => ({ row: Number((record.data as ProductData).sourceRow), value: Number((record.data as ProductData).availableQuantity || 0) })).filter((item) => item.row > 0);
      if (sheetUpdates.length !== records.length) throw new Error("Some Product / SKU rows are not linked to the Google Stock Master. Sync the Sheet before dispatching this order.");
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, requestBody: { valueInputOption: "USER_ENTERED", data: sheetUpdates.map((item) => ({ range: `'${title.replace(/'/g, "''")}'!${column(stockColumn)}${item.row}`, values: [[item.value]] })) } });
      if (records.length) {
        const { error: updateError } = await db.from("crm_stock_inventory").upsert(records, { onConflict: "workspace_owner_id,record_id" });
        if (updateError) throw updateError;
      }
      await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: email, action: "Updated dispatch inventory", module: "Products", details: `${records.length} Product / SKU stock line(s)` });
      return Response.json({ ok: true, updated: records.length });
    }
    const { db, ownerId, email } = await administrator(request, url, serviceKey);
    const item = body?.item as ProductData | undefined;
    if (!item?.id) throw new Error("Choose a saved testing product to edit.");
    const { data: existing, error: readError } = await db.from("crm_stock_inventory").select("record_id, data").eq("workspace_owner_id", ownerId).eq("record_id", String(item.id)).maybeSingle();
    if (readError || !existing) throw new Error("This testing product could not be found.");
    const prior = existing.data as ProductData;
    // Available Stock belongs only to the Sheet import and cannot be edited
    // in this CRM testing card.
    const data: ProductData = { ...prior, sku: display(item.sku).toUpperCase(), name: display(item.name), category: display(item.category) || "Uncategorised", unit: display(item.unit) || "Piece", innerQty: display(item.innerQty), outerQty: display(item.outerQty), cartonQty: display(item.outerQty), unitPrice: number(item.unitPrice), reorderThreshold: number(item.reorderThreshold), image: display(item.image) };
    if (!data.sku || !data.name) throw new Error("SKU ID and Product Name are required.");
    const { error: updateError } = await db.from("crm_stock_inventory").update({ data, search_key: `${data.sku} ${data.name} ${data.category}`.toLowerCase(), updated_at: new Date().toISOString() }).eq("workspace_owner_id", ownerId).eq("record_id", String(item.id));
    if (updateError) throw updateError;
    await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: email, action: "Edited test Product Stock Inventory item", module: "Products", details: `${data.sku} · ${data.name}` });
    return Response.json({ item: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update this testing product." }, { status: 400 });
  }
}
