import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

type CatalogueProduct = { sku: string; name: string; availableQuantity?: number };
type InventoryMatch = {
  sourceLabel: string;
  quantity: number;
  status: "matched" | "unmatched" | "ambiguous";
  sku?: string;
  name?: string;
  currentAvailable?: number;
  candidates?: string[];
};

const key = (value: unknown) => String(value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const stockQuantity = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
// Stock sheets frequently spell the same code differently: AB - 262, AB-262
// and AB 262 must all resolve to `ab262`.  We deliberately compare SKU codes
// only after punctuation and whitespace are removed; product names never decide
// a stock update when an exact SKU code is present.
const skuCandidates = (value: string) => {
  const compact = key(value);
  // Keep the base code separately. Without this, `AB - 262 - Balloon` can
  // incorrectly capture the first letters of Balloon as a SKU suffix.
  const baseTokens = value.match(/[A-Z]{1,6}\s*(?:[-–—]\s*)?\d{1,8}/gi) || [];
  const extendedTokens = value.match(/[A-Z]{1,6}\s*(?:[-–—]\s*)?\d{1,8}[A-Z](?:\s*[-–—]?\s*[A-Z0-9]{1,4})?/gi) || [];
  return [...new Set([compact, ...baseTokens.map(key), ...extendedTokens.map(key)].filter(Boolean))];
};

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !serviceKey || !token) return Response.json({ error: "Sign in again before reconciling inventory." }, { status: 401 });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: user, error: userError } = await db.auth.getUser(token);
  if (userError || !user.user) return Response.json({ error: "Sign in again before reconciling inventory." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const catalogueRaw = form.get("catalogue");
  if (!(file instanceof File) || !catalogueRaw) return Response.json({ error: "Choose an Excel or CSV stock file." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: "Stock files must be 10 MB or smaller." }, { status: 413 });
  let catalogue: CatalogueProduct[] = [];
  try { catalogue = JSON.parse(String(catalogueRaw)); } catch { return Response.json({ error: "The product catalogue could not be prepared for matching." }, { status: 400 }); }
  if (!Array.isArray(catalogue)) return Response.json({ error: "The product catalogue could not be prepared for matching." }, { status: 400 });

  let rows: unknown[][] = [];
  try {
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: false });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw new Error("No worksheet");
    rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], { header: 1, defval: "", raw: false });
  } catch { return Response.json({ error: "This file could not be read. Upload a normal Excel (.xlsx) or CSV stock sheet." }, { status: 400 }); }

  const bySku = new Map<string, CatalogueProduct[]>();
  const byName = new Map<string, CatalogueProduct[]>();
  catalogue.forEach((product) => {
    const sku = key(product.sku);
    const name = key(product.name);
    if (sku) bySku.set(sku, [...(bySku.get(sku) || []), product]);
    if (name) byName.set(name, [...(byName.get(name) || []), product]);
  });
  const matches: InventoryMatch[] = [];
  rows.forEach((row) => {
    const label = String(row?.[0] ?? "").trim();
    const quantity = stockQuantity(row?.[1]);
    if (!label || quantity === null || /^quantity$/i.test(label)) return;
    const labelKey = key(label);
    const exactSkuMatches = skuCandidates(label).flatMap((candidate) => bySku.get(candidate) || []);
    // Never use a loose prefix (AB-20 must not become AB-203). If a code is
    // present, only an exact normalised SKU match is safe enough to apply.
    const nameMatches = exactSkuMatches.length ? exactSkuMatches : (byName.get(labelKey) || []);
    const unique = Array.from(new Map(nameMatches.map((product) => [key(product.sku), product])).values());
    if (unique.length === 1) {
      const product = unique[0];
      matches.push({ sourceLabel: label, quantity, status: "matched", sku: product.sku, name: product.name, currentAvailable: Number(product.availableQuantity || 0) });
    } else if (unique.length > 1) {
      matches.push({ sourceLabel: label, quantity, status: "ambiguous", candidates: unique.slice(0, 6).map((product) => `${product.sku} · ${product.name}`) });
    } else matches.push({ sourceLabel: label, quantity, status: "unmatched" });
  });
  const matchedSku = new Set(matches.filter((item) => item.status === "matched").map((item) => key(item.sku)));
  const panelOnly = catalogue.filter((product) => product.sku && !matchedSku.has(key(product.sku))).map((product) => ({ sku: product.sku, name: product.name, currentAvailable: Number(product.availableQuantity || 0) }));
  return Response.json({ sheetName: "Stock Summary", matches, panelOnly });
}
