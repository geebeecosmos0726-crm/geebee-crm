import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

export const runtime = "nodejs";

const DEFAULT_PRODUCT_MASTER_SHEET_ID = "19aIVexyhcLZ1b_QYv7dIZuvwqLzbJkAeFonEKV7ZpmA";
const DEFAULT_PRODUCT_MASTER_TAB = "Product Stock Inventory";
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
const columnLetter = (index: number) => { let value = index + 1; let letters = ""; while (value) { const remainder = (value - 1) % 26; letters = String.fromCharCode(65 + remainder) + letters; value = Math.floor((value - 1) / 26); } return letters; };
const productNameOnly = (value: unknown) => {
  const text = display(value);
  const separator = text.indexOf("·");
  return separator >= 0 ? text.slice(separator + 1).trim() : text;
};

// A dispatch used to make an additional Google metadata request before every
// stock movement. The CRM's Stock Master tab has a stable name, so use it
// directly and cache a renamed tab for warm server instances. If the tab was
// renamed, resolve it once and continue safely rather than guessing.
const masterTabCache = new Map<string, { title: string; expiresAt: number }>();
async function getMasterTabTitle(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const selected = (metadata.data.sheets || []).find((sheet) => /^(product stock inventory|product master)$/i.test(sheet.properties?.title || "")) || metadata.data.sheets?.[0];
  const title = selected?.properties?.title;
  if (!title) throw new Error("The Google Stock Master has no worksheet.");
  masterTabCache.set(spreadsheetId, { title, expiresAt: Date.now() + 10 * 60_000 });
  return title;
}
const likelyMasterTabTitle = (spreadsheetId: string) => {
  const cached = masterTabCache.get(spreadsheetId);
  return cached && cached.expiresAt > Date.now()
    ? cached.title
    : process.env.GOOGLE_PRODUCT_MASTER_SHEET_NAME || DEFAULT_PRODUCT_MASTER_TAB;
};

async function administrator(request: Request, url: string, serviceKey: string, allowMember = false) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const internalOwnerId = request.headers.get("x-geebee-workspace-owner")?.trim();
  if (request.headers.get("x-geebee-internal-stock-sync") === serviceKey && internalOwnerId) return { db, ownerId: internalOwnerId, email: "system@geebee.local" };
  if (!token) throw new Error("Sign in again before syncing product stock.");
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
  if (!products.length) return { error: "No complete product rows were found. Each imported row needs SKU ID and Product Name.", products: [] as SheetProduct[], skippedRows, stockColumn: columns.availableStock };
  return { error: "", products, skippedRows, stockColumn: columns.availableStock };
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
    if (typeof parsed.stockColumn !== "number") throw new Error("Google Stock Master needs an Available Stock column before it can be synced safely.");
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
    // Once a SKU has entered the transaction ledger, its saved Available
    // Quantity is the opening balance plus ledger movements. A later Sheet
    // metadata sync must not overwrite that balance and replay old stock.
    const { data: openingRows, error: openingError } = await db.from("crm_inventory_opening_balances")
      .select("product_record_id").eq("workspace_owner_id", ownerId).limit(100000);
    // The ledger migration may not yet be installed in an older workspace.
    // In that case retain the pre-ledger sync behaviour until it is set up.
    const ledgerManagedRecordIds = openingError ? new Set<string>() : new Set((openingRows || []).map((row: any) => String(row.product_record_id)));
    // When a Sheet is updated while orders are already in Dispatch, the user
    // explicitly tells us whether the Sheet balance includes those dispatches.
    // If it does not, subtract each active dispatch exactly once and write the
    // corrected balance back to the Sheet. Cancelling happens in the UI before
    // this endpoint is called, so this route never changes data on cancel.
    const sheetIncludesActiveDispatch = body?.sheetIncludesActiveDispatch !== false;
    const rawActiveDispatchLines: unknown[] = Array.isArray(body?.activeDispatchLines) ? body.activeDispatchLines : [];
    const activeDispatchLines = rawActiveDispatchLines.map((line) => ({
      sku: display((line as Record<string, unknown>)?.sku),
      product: productNameOnly((line as Record<string, unknown>)?.product),
      quantity: Math.max(0, number((line as Record<string, unknown>)?.quantity)),
    })).filter((line) => line.sku && line.quantity > 0);
    const sourceCountBySku = new Map<string, number>();
    const sourceCountByIdentity = new Map<string, number>();
    parsed.products.forEach((source) => {
      const sku = compact(source.sku); const identity = inventoryKey(source);
      sourceCountBySku.set(sku, (sourceCountBySku.get(sku) || 0) + 1);
      sourceCountByIdentity.set(identity, (sourceCountByIdentity.get(identity) || 0) + 1);
    });
    const activeBySku = new Map<string, number>();
    const activeByIdentity = new Map<string, number>();
    activeDispatchLines.forEach((line) => {
      const sku = compact(line.sku); const identity = inventoryKey({ sku: line.sku, name: line.product });
      activeBySku.set(sku, (activeBySku.get(sku) || 0) + line.quantity);
      activeByIdentity.set(identity, (activeByIdentity.get(identity) || 0) + line.quantity);
    });
    const dispatchForSource = (source: SheetProduct) => {
      if (sheetIncludesActiveDispatch) return 0;
      const identity = inventoryKey(source);
      if ((sourceCountByIdentity.get(identity) || 0) === 1 && activeByIdentity.has(identity)) return activeByIdentity.get(identity) || 0;
      const sku = compact(source.sku);
      return (sourceCountBySku.get(sku) || 0) === 1 ? activeBySku.get(sku) || 0 : 0;
    };
    if (!sheetIncludesActiveDispatch) {
      const unresolvedDispatchLines = activeDispatchLines.filter((line) => {
        const identity = inventoryKey({ sku: line.sku, name: line.product });
        if ((sourceCountByIdentity.get(identity) || 0) === 1) return false;
        return (sourceCountBySku.get(compact(line.sku)) || 0) !== 1;
      });
      if (unresolvedDispatchLines.length) {
        throw new Error(`Sync stopped safely: ${unresolvedDispatchLines.map((line) => line.sku).filter((sku, index, list) => list.indexOf(sku) === index).join(", ")} cannot be matched uniquely in Stock Master. Choose YES if the Sheet already includes Dispatch, or make those SKU rows unique before choosing NO.`);
      }
    }
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
      const activeDispatchQuantity = dispatchForSource(source);
      const keepLedgerBalance = Boolean(currentRecord && ledgerManagedRecordIds.has(String(currentRecord.recordId)));
      const data: ProductData = {
        ...current, id, sourceRow: source.row, sku: source.sku.trim().toUpperCase(), name: source.name.trim(), category: source.category || String(current.category || "Uncategorised"), unit: source.unit || String(current.unit || "Piece"),
        innerQty: source.innerQty, outerQty: source.outerQty, cartonQty: source.outerQty, unitPrice: source.sellingPrice, availableQuantity: keepLedgerBalance ? number(current.availableQuantity) : source.availableStock - activeDispatchQuantity,
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
    const correctedSheetRows = !sheetIncludesActiveDispatch ? parsed.products.map((source) => ({ source, quantity: dispatchForSource(source) })).filter((entry) => entry.quantity > 0) : [];
    if (correctedSheetRows.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: correctedSheetRows.map(({ source, quantity }) => ({ range: `'${title.replace(/'/g, "''")}'!${columnLetter(parsed.stockColumn)}${source.row}`, values: [[source.availableStock - quantity]] })),
        },
      });
    }
    const crmOnly = existing.map((record) => record.product).filter((product) => product.sku && (!rowKey(product) || !sheetKeys.has(rowKey(product)))).map((product) => ({ sku: product.sku || "", name: product.name || "" }));
    await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: email, action: "Synced Product Stock Inventory", module: "Products", details: `${updated} updated · ${added} added · ${placeholderIds.length} incomplete placeholder(s) removed · ${crmOnly.length} CRM-only SKU(s)${correctedSheetRows.length ? ` · ${correctedSheetRows.length} active Dispatch balance(s) applied` : ""}` });
    return Response.json({ sheetTitle: title, products: records.map((record) => record.data), updated, added, cleanedPlaceholders: placeholderIds.length, crmOnly, skippedRows: parsed.skippedRows || [], scanned: parsed.products.length, activeDispatchBalancesApplied: correctedSheetRows.length });
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
      const internalSync = request.headers.get("x-geebee-internal-stock-sync") === serviceKey;
      const now = new Date().toISOString();
      const records = (existing || []).flatMap((row: any) => {
        const update = updateById.get(String(row.record_id));
        const current = row.data as ProductData & { sheetSyncToken?: string };
        // A newer movement may already be waiting for Sheet sync. An older
        // background worker must never overwrite that newer balance.
        if (internalSync && current.sheetSyncToken !== update.sheetSyncToken) return [];
        // A negative available quantity is intentional when Operations has
        // dispatched more than the Stock Master contained. Preserve and write
        // it so the shortfall stays visible instead of being silently hidden.
        const data: ProductData & Record<string, unknown> = { ...current, availableQuantity: number(update.availableQuantity), reservedStock: Math.max(0, number(update.reservedStock)) };
        if (internalSync) {
          delete data.sheetSyncPending;
          delete data.sheetSyncError;
          delete data.sheetSyncToken;
          delete data.sheetSyncUpdatedAt;
        }
        return [{ workspace_owner_id: ownerId, record_id: row.record_id, search_key: `${data.sku || ""} ${data.name || ""} ${data.category || ""}`.toLowerCase(), data, updated_at: now }];
      });
      const recordsForSheet = records.filter((record) => updateById.get(String(record.record_id))?.writeToSheet !== false);
      // The Google Stock Master is written only for an actual available-stock
      // movement. Confirming an order updates reserved stock in CRM, but must
      // not overwrite a newer manual Sheet balance from a stale browser copy.
      if (recordsForSheet.length) {
        const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
        const sheetId = process.env.GOOGLE_PRODUCT_MASTER_SHEET_ID || DEFAULT_PRODUCT_MASTER_SHEET_ID;
        if (!keyJson) throw new Error("Google Stock Master is not configured, so dispatch stock cannot be moved safely.");
        const credentials = JSON.parse(keyJson);
        if (typeof credentials.private_key === "string") credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
        const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
        const sheets = google.sheets({ version: "v4", auth });
        let title = likelyMasterTabTitle(sheetId);
        let values;
        try {
          // Normal path: one Sheet read. We do not spend a separate request
          // merely to prove the well-known tab name exists.
          values = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: quoteRange(title) });
          masterTabCache.set(sheetId, { title, expiresAt: Date.now() + 10 * 60_000 });
        } catch {
          // A renamed tab is rare. Resolve it only after the direct read has
          // failed, then retry using the verified title.
          title = await getMasterTabTitle(sheets, sheetId);
          values = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: quoteRange(title) });
        }
        const sheetRows = (values.data.values || []).map((row) => Array.isArray(row) ? row.map(display) : []);
        const headerRowIndex = sheetRows.findIndex((row) => headerIndex(row, ["skuid", "sku"]) >= 0 && headerIndex(row, ["availablestock", "availablequantity", "stock"]) >= 0);
        const headerRow = headerRowIndex >= 0 ? sheetRows[headerRowIndex] : undefined;
        const skuColumn = headerRow ? headerIndex(headerRow, ["skuid", "sku"]) : -1;
        const nameColumn = headerRow ? headerIndex(headerRow, ["productname", "product"]) : -1;
        const stockColumn = headerRow ? headerIndex(headerRow, ["availablestock", "availablequantity", "stock"]) : -1;
        if (skuColumn < 0 || stockColumn < 0) throw new Error("Google Stock Master needs SKU ID and Available Stock columns before dispatch can update it.");
        const column = (index: number) => { let value = index + 1; let letters = ""; while (value) { const remainder = (value - 1) % 26; letters = String.fromCharCode(65 + remainder) + letters; value = Math.floor((value - 1) / 26); } return letters; };
      // Never use a remembered Sheet row here. Users regularly insert rows in
      // Stock Master, which makes an old sourceRow unsafe. Resolve each stock
      // write against the Sheet's current SKU ID instead. compact() makes
      // AB-204-1, AB 204 1 and ab2041 the same SKU for this lookup.
        const liveSheetRows = sheetRows.slice(headerRowIndex + 1).map((row, index) => ({
        row: headerRowIndex + index + 2,
        sku: display(row[skuColumn]),
        name: nameColumn >= 0 ? display(row[nameColumn]) : "",
      })).filter((row) => row.sku);
        const sheetUpdates = recordsForSheet.map((record) => {
        const product = record.data as ProductData;
        const sku = compact(product.sku);
        const skuMatches = liveSheetRows.filter((row) => compact(row.sku) === sku);
        if (skuMatches.length === 1) return { row: skuMatches[0].row, value: Number(product.availableQuantity || 0) };
        // A repeated SKU can exist for variants. Use the matching name only to
        // disambiguate those rows; never guess a row and risk corrupting stock.
        const nameMatches = skuMatches.filter((row) => compact(row.name) === compact(product.name));
        if (nameMatches.length === 1) return { row: nameMatches[0].row, value: Number(product.availableQuantity || 0) };
        const productLabel = `${display(product.sku) || "(blank SKU)"} · ${display(product.name) || "(blank product name)"}`;
        if (!skuMatches.length) throw new Error(`${productLabel} was not found in the current Google Stock Master. Sync the Sheet before dispatching this order.`);
        const candidates = skuMatches.map((row) => `row ${row.row}${row.name ? ` (${row.name})` : ""}`).join(", ");
        throw new Error(`${productLabel} cannot be matched safely because this SKU appears on ${candidates}. Give those rows unique SKU IDs or ensure one Product Name matches exactly, then retry.`);
        });
        await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, requestBody: { valueInputOption: "USER_ENTERED", data: sheetUpdates.map((item) => ({ range: `'${title.replace(/'/g, "''")}'!${column(stockColumn)}${item.row}`, values: [[item.value]] })) } });
      }
      if (records.length) {
        const { error: updateError } = await db.from("crm_stock_inventory").upsert(records, { onConflict: "workspace_owner_id,record_id" });
        if (updateError) throw updateError;
      }
      await db.from("crm_audit_events").insert({ workspace_owner_id: ownerId, actor_email: email, action: "Updated dispatch inventory", module: "Products", details: `${records.length} CRM product record(s) updated · ${recordsForSheet.length} Available Stock line(s) written to Stock Master` });
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
