"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import "./product-lines.css";
import "./catalogue.css";
import "./catalogue-image-fit.css";
import "./catalogue-v2.css";
import "./catalogue-card-fix.css";
import "./catalogue-delete.css";
import "./auth.css";
import "./crm-layout.css";
import "./customer-management.css";
import "./leads.css";
import "./quotes.css";
import "./products.css";
import "./automation.css";
import "./tasks.css";
import "./reports.css";
import "./recovery.css";
import "./transporters.css";
import "./image-studio.css";
import "./image-studio-fit.css";
import "./dispatch-plan.css";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import {
  Bell,
  Bot,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  FileText,
  ImagePlus,
  Download,
  Crop,
  LayoutDashboard,
  PackageCheck,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  ScanText,
  Settings,
  ShipWheel,
  Target,
  Truck,
  Trash2,
  Users,
  Warehouse,
  X,
} from "lucide-react";
type ProductLine = { product: string; sku: string; quantity: number; unitPrice: number };
type QuoteProduct = ProductLine & { discount: number };
type CatalogueItem = { id: number; name: string; sku: string; unitPrice: number; category: string; image: string; description: string; cartonQty: string; innerQty?: string; outerQty?: string; subCategory?: string; brand?: string; unit?: string; packSize?: string; moq?: number; purchasePrice?: number; wholesalePrice?: number; distributorPrice?: number; gst?: number; barcode?: string; weight?: string; dimensions?: string; supplier?: string; countryOfOrigin?: string; availableQuantity?: number; openingStock?: number; purchasedStock?: number; orderedStock?: number; damagedStock?: number; reservedStock?: number };
type ClientSpecialRate = { sku: string; rate: number };
const crmModules = ["Overview", "Clients", "Leads", "Orders", "Catalogue", "Invoices", "Payments", "Shipments"] as const;
type CrmModule = typeof crmModules[number];
type WorkspaceMember = { id: number; workspace_owner_id: string; email: string; role: "admin" | "employee"; modules: CrmModule[] };
type AuditEvent = { id: number; actor_email: string; action: string; module: string; details: string; created_at: string };
type Order = {
  id: string;
  client: string;
  city: string;
  product: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  eta: string;
  status: string;
  payment: string;
  transporter?: string;
  avatar: string;
  products?: ProductLine[];
  backorders?: ProductLine[];
};
type Client = {
  id: number;
  customerId?: string;
  name: string;
  city: string;
  state?: string;
  address?: string;
  pincode?: string;
  contact: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  gstin?: string;
  pan?: string;
  businessType?: string;
  customerCategory?: string;
  credit: string;
  paymentTerms?: string;
  assignedSalesperson?: string;
  customerStatus?: string;
  avatar: string;
  specialRates?: ClientSpecialRate[];
};
const isClientProfileIncomplete = (client: Client) => !client.contact?.trim() || !client.phone?.trim() || !client.city?.trim() || !client.address?.trim() || !client.credit?.trim();
type Invoice = {
  id: string;
  client: string;
  order: string;
  amount: string;
  due: string;
  status: string;
};
type LeadStage = "New" | "Contacted" | "Requirement Received" | "Quotation Sent" | "Negotiation" | "Confirmed" | "Order Created" | "Lost";
type Lead = { id: string; company: string; contact: string; mobile: string; city: string; source: string; salesperson: string; requirement: string; expectedValue: string; expectedDate: string; status: LeadStage; lostReason?: string; createdAt: string };
type Quote = { id: string; customer: string; products: QuoteProduct[]; gst: number; freight: number; validity: string; paymentTerms: string; deliveryTerms: string; status: "Draft" | "Sent" | "Accepted" | "Converted"; createdAt: string };
type SalesTask = { id: string; title: string; time: string; dueDate: string; assignee: string; type: "Call" | "Follow-up" | "Payment" | "Quotation" | "Enquiry" | "Other"; status: "Open" | "Done"; relatedTo?: string };
type Transporter = { id: number; name: string; contact: string; phone: string; email?: string; city?: string; gstin?: string; serviceType?: string; notes?: string };
type ScalableRecord = { record_id: string; data: unknown };
const scalableTables = [
  { key: "clients", table: "crm_clients", search: (item: Client) => `${item.customerId || ""} ${item.name} ${item.contact} ${item.phone} ${item.city}` },
  { key: "catalogue", table: "crm_products", search: (item: CatalogueItem) => `${item.sku} ${item.name} ${item.category} ${item.brand || ""}` },
  { key: "orders", table: "crm_orders", search: (item: Order) => `${item.id} ${item.client} ${item.product} ${item.sku} ${item.city}` },
  { key: "invoices", table: "crm_invoices", search: (item: Invoice) => `${item.id} ${item.client} ${item.order} ${item.status}` },
  { key: "leads", table: "crm_leads", search: (item: Lead) => `${item.id} ${item.company} ${item.contact} ${item.mobile} ${item.city}` },
  { key: "quotes", table: "crm_quotes", search: (item: Quote) => `${item.id} ${item.customer} ${item.status}` },
  { key: "tasks", table: "crm_tasks", search: (item: SalesTask) => `${item.id} ${item.title} ${item.assignee} ${item.relatedTo || ""}` },
  { key: "transporters", table: "crm_transporters", search: (item: Transporter) => `${item.name} ${item.contact} ${item.phone} ${item.city || ""} ${item.serviceType || ""}` },
] as const;
const seedOrders: Order[] = [
  {
    id: "GB-24091",
    client: "Celebration Corner",
    city: "Mumbai",
    product: "Party Goggles",
    sku: "AB-981",
    quantity: 1200,
    unitPrice: 12,
    eta: "2026-09-18",
    status: "In transit",
    payment: "Partial",
    avatar: "CC",
  },
  {
    id: "GB-24090",
    client: "Happy Times Retail",
    city: "Pune",
    product: "Balloon Pump",
    sku: "AB-971",
    quantity: 450,
    unitPrice: 17,
    eta: "2026-09-22",
    status: "Confirmed",
    payment: "Paid",
    avatar: "HT",
  },
  {
    id: "GB-24089",
    client: "The Party Store",
    city: "Bengaluru",
    product: "Cake Crown",
    sku: "AB-821",
    quantity: 1100,
    unitPrice: 42,
    eta: "2026-09-12",
    status: "Customs clearance",
    payment: "Overdue",
    avatar: "PS",
  },
  {
    id: "GB-24088",
    client: "Choco & Co.",
    city: "Ahmedabad",
    product: "LED Light 10cm",
    sku: "AB-871",
    quantity: 600,
    unitPrice: 94,
    eta: "2026-09-09",
    status: "Delivered",
    payment: "Paid",
    avatar: "CO",
  },
];
const seedClients: Client[] = [
  {
    id: 1,
    name: "Celebration Corner",
    city: "Mumbai",
    contact: "Aman Shah",
    phone: "+91 98201 44120",
    credit: "₹2,00,000",
    avatar: "CC",
  },
  {
    id: 2,
    name: "Happy Times Retail",
    city: "Pune",
    contact: "Pooja Mehta",
    phone: "+91 98901 33440",
    credit: "₹1,25,000",
    avatar: "HT",
  },
  {
    id: 3,
    name: "The Party Store",
    city: "Bengaluru",
    contact: "Kiran Rao",
    phone: "+91 98450 12190",
    credit: "₹2,50,000",
    avatar: "PS",
  },
  {
    id: 4,
    name: "Choco & Co.",
    city: "Ahmedabad",
    contact: "Nisha Patel",
    phone: "+91 98983 22177",
    credit: "₹75,000",
    avatar: "CO",
  },
];
const seedInvoices: Invoice[] = [
  {
    id: "INV-1020",
    client: "Celebration Corner",
    order: "GB-24091",
    amount: "₹1,84,600",
    due: "20 Sep 2026",
    status: "Partial",
  },
  {
    id: "INV-1019",
    client: "The Party Store",
    order: "GB-24089",
    amount: "₹2,63,200",
    due: "14 Sep 2026",
    status: "Overdue",
  },
  {
    id: "INV-1018",
    client: "Happy Times Retail",
    order: "GB-24090",
    amount: "₹96,450",
    due: "25 Sep 2026",
    status: "Paid",
  },
];
const seedCatalogue: CatalogueItem[] = [
  { id: 1, name: "Party Goggles", sku: "AB-981", unitPrice: 12, category: "Party Props", image: "", description: "Party Goggles", cartonQty: "" },
  { id: 2, name: "Balloon Pump", sku: "AB-971", unitPrice: 17, category: "Balloons", image: "", description: "Balloon Pump", cartonQty: "" },
  { id: 3, name: "Cake Crown", sku: "AB-821", unitPrice: 42, category: "Cake Accessories", image: "", description: "Cake Crown", cartonQty: "" },
  { id: 4, name: "LED Light 10cm", sku: "AB-871", unitPrice: 94, category: "Decorations", image: "", description: "LED Light 10cm", cartonQty: "" },
];
const seedLeads: Lead[] = [
  { id: "LEAD-1001", company: "Sunshine Events", contact: "Rhea Kapoor", mobile: "+91 98765 10203", city: "Delhi", source: "Instagram", salesperson: "Rahul", requirement: "Festival decorations and party props", expectedValue: "₹85,000", expectedDate: "2026-10-05", status: "Requirement Received", createdAt: "2026-09-17" },
  { id: "LEAD-1002", company: "Celebration Hub", contact: "Nitin Verma", mobile: "+91 98110 44921", city: "Jaipur", source: "WhatsApp", salesperson: "Rahul", requirement: "Bulk balloon accessories", expectedValue: "₹1,20,000", expectedDate: "2026-09-28", status: "Quotation Sent", createdAt: "2026-09-16" },
  { id: "LEAD-1003", company: "Urban Party Store", contact: "Sejal Shah", mobile: "+91 99876 55124", city: "Surat", source: "Referral", salesperson: "Rahul", requirement: "New store opening assortment", expectedValue: "₹2,40,000", expectedDate: "2026-10-12", status: "New", createdAt: "2026-09-17" },
];
const seedQuotes: Quote[] = [
  { id: "QT-1001", customer: "Celebration Corner", products: [{ product: "Party Goggles", sku: "AB-981", quantity: 500, unitPrice: 12, discount: 5 }], gst: 18, freight: 1200, validity: "2026-09-30", paymentTerms: "30 days", deliveryTerms: "Ex-warehouse, Mumbai", status: "Sent", createdAt: "2026-09-17" },
];
const seedTasks: SalesTask[] = [
  { id: "TASK-1001", title: "Call Sharma Traders", time: "10:00", dueDate: "2026-09-17", assignee: "Rahul", type: "Call", status: "Open" },
  { id: "TASK-1002", title: "Follow-up ABC Party Store", time: "11:30", dueDate: "2026-09-17", assignee: "Rahul", type: "Follow-up", status: "Open" },
  { id: "TASK-1003", title: "Payment follow-up", time: "13:00", dueDate: "2026-09-17", assignee: "Rahul", type: "Payment", status: "Open", relatedTo: "INV-1019" },
  { id: "TASK-1004", title: "Send quotation", time: "15:00", dueDate: "2026-09-17", assignee: "Rahul", type: "Quotation", status: "Open", relatedTo: "QT-1001" },
  { id: "TASK-1005", title: "Follow-up pending enquiry", time: "17:00", dueDate: "2026-09-17", assignee: "Rahul", type: "Enquiry", status: "Open" },
];
const seedTransporters: Transporter[] = [];
const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const openWhatsApp = (phone: string, message: string) => window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
const availableStock = (product: CatalogueItem) => product.availableQuantity ?? ((product.openingStock || 0) + (product.purchasedStock || 0) - (product.orderedStock || 0) - (product.damagedStock || 0));
const freeStock = (product: CatalogueItem) => product.availableQuantity ?? (availableStock(product) - (product.reservedStock || 0));
const linesFor = (order: Order): ProductLine[] => order.products || [{ product: order.product, sku: order.sku, quantity: order.quantity, unitPrice: order.unitPrice }];
const orderTotal = (order: Order) => linesFor(order).reduce((total, line) => total + line.quantity * line.unitPrice, 0);
const orderQuantity = (order: Order) => linesFor(order).reduce((total, line) => total + line.quantity, 0);
const initials = (n: string) =>
  n
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const readDocumentText = async (file: File) => {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    if (file.size > 25 * 1024 * 1024) throw new Error("This PDF is over the 25 MB catalogue limit. Please split it into smaller files.");
    let response: Response;
    if (file.size > 3 * 1024 * 1024) {
      if (!supabase) throw new Error("Cloud upload is not configured yet.");
      const path = `pdf-imports/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9._-]/gi, "-")}`;
      const { error: uploadError } = await supabase.storage.from("catalogue-imports").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw new Error("Large PDF upload is not ready yet. Please run the latest Supabase setup script, then try again.");
      const { data, error: linkError } = await supabase.storage.from("catalogue-imports").createSignedUrl(path, 600);
      if (linkError || !data?.signedUrl) throw new Error("A secure link for this PDF could not be created.");
      response = await fetch("/api/pdf-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceUrl: data.signedUrl }) });
    } else {
      const form = new FormData();
      form.append("file", file);
      response = await fetch("/api/pdf-text", { method: "POST", body: form });
    }
    const raw = await response.text();
    let result: { text?: string; error?: string } = {};
    try { result = JSON.parse(raw); } catch { throw new Error(response.status === 413 ? "This PDF is over the online upload limit. Please use the large-file import after running the Supabase setup script." : "The PDF service returned an unexpected response. Please try again."); }
    if (!response.ok) throw new Error(result.error || "The PDF could not be read.");
    return result.text as string;
  }
  const { recognize } = await import("tesseract.js");
  return (await recognize(file, "eng")).data.text;
};
type InternalOrderSheet = { client: string; eta: string; products: ProductLine[]; note: string; transporter?: string };
const skuKey = (value: string) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();
const isBackorderRecord = (order: Order) => /^ADV-/i.test(order.id) || /advance|back\s*order/i.test(order.status || "");
const isVisibleBackorder = (order: Order) => isBackorderRecord(order) && (/^ADV-/i.test(order.id) || linesFor(order).some((line) => line.quantity > 0));
const catalogueSku = (item: CatalogueItem) => item.sku?.trim() || "SKU pending";
const catalogueName = (item: CatalogueItem) => item.name?.trim() || item.description?.trim() || (item.sku?.trim() ? `Product ${item.sku.trim()}` : "Product name pending");
const nextOrderNumber = () => `GB-${Date.now().toString().slice(-8)}`;
const parseInternalOrderSheet = (raw: string): InternalOrderSheet | null => {
  const lines = raw.replace(/\r/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const headerAt = lines.findIndex((line) => /\bitem\b/i.test(line) && /\b(?:quantity|qty)\b/i.test(line) && /\bprice\b/i.test(line));
  // A continuation image often begins straight with product rows, without the
  // blue/yellow header. It is still a valid page of the same internal order.
  const rowsStart = headerAt < 0 ? 0 : headerAt + 1;
  const dateText = lines.slice(0, headerAt).join(" ").match(/date\s*[-: ]*([0-3]?\d[.\/-][01]?\d[.\/-](?:20)?\d{2})/i)?.[1];
  let eta = "";
  if (dateText) { const [day, month, year] = dateText.split(/[.\/-]/); eta = `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`; }
  const client = headerAt < 0 ? "" : lines.slice(0, headerAt).filter((line) => !/\bdate\b/i.test(line)).filter((line) => !/^[A-Z]$/.test(line)).at(-1) || "";
  const products: ProductLine[] = [];
  const trailing: string[] = [];
  for (const line of lines.slice(rowsStart)) {
    if (/\btotal\b/i.test(line)) { const beforeTotal = line.replace(/\btotal\b.*$/i, "").trim(); if (beforeTotal && !/^\d[\d,.]*$/.test(beforeTotal)) trailing.push(beforeTotal); break; }
    const match = line.match(/^([A-Z]{1,6}(?:\s*[- ]?\s*\d{2,8}))\s+([\d,]+)\s+([\d,.]+)(?:\s+[\d,.]+)?(?:\s+(.*))?$/i);
    if (!match) continue;
    products.push({ product: "", sku: match[1].replace(/\s+/g, "-").replace(/-+/g, "-"), quantity: Number(match[2].replaceAll(",", "")) || 0, unitPrice: Number(match[3].replaceAll(",", "")) || 0 });
    if (match[4]) trailing.push(match[4]);
  }
  const transporter = lines.find((line) => /\btransport\b/i.test(line))?.replace(/\btotal\b.*$/i, "").replace(/[^a-z0-9 &.-]/gi, "").replace(/\s+/g, " ").trim();
  return products.length ? { client, eta, products, note: trailing.join(" · "), transporter: transporter || undefined } : null;
};
const readInternalOrderSheetImage = async (file: File): Promise<InternalOrderSheet | null> => {
  if (!file.type.startsWith("image/")) return null;
  const source = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("The order image could not be opened.")); image.src = URL.createObjectURL(file); });
  // The saved GeeBee internal-order format is a phone screenshot: the useful
  // grid begins at these relative positions. Reading each cell avoids gridlines
  // confusing general OCR and preserves every product row.
  const { createWorker, PSM } = await import("tesseract.js"); const worker = await createWorker("eng");
  const readCell = async (x: number, y: number, width: number, height: number, numeric = false) => {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: numeric ? "0123456789.," : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .:-" });
    const canvas = document.createElement("canvas"); const zoom = 5; canvas.width = width * zoom; canvas.height = height * zoom;
    const context = canvas.getContext("2d"); if (!context) return ""; context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, x, y, width, height, 0, 0, canvas.width, canvas.height);
    const { data } = await worker.recognize(canvas); return data.text.replace(/\s+/g, " ").trim();
  };
  try {
    const x = source.width / 591; let y = source.height / 1253;
    // Do not rely on the screenshot being exported at exactly the same height.
    // The yellow ITEM / QUANTITY / PRICE header is the stable marker in every
    // GeeBee sheet, so find it first and then read the rows beneath it.
    const marker = document.createElement("canvas"); marker.width = source.width; marker.height = source.height;
    const markerContext = marker.getContext("2d"); markerContext?.drawImage(source, 0, 0);
    let headerBottom = 0; let strongestYellow = 0; let gridLeft = 44 * x; let gridRight = 529 * x;
    const pixels = markerContext?.getImageData(0, 0, marker.width, marker.height).data;
    if (pixels) {
      const scanFrom = Math.floor(source.height * 0.12); const scanTo = Math.floor(source.height * 0.42);
      for (let row = scanFrom; row < scanTo; row += 1) {
        let yellowPixels = 0; let left = source.width; let right = 0;
        const step = Math.max(2, Math.floor(source.width / 130));
        for (let column = Math.floor(source.width * 0.02); column < source.width * 0.98; column += step) {
          const at = (row * source.width + column) * 4; const red = pixels[at]; const green = pixels[at + 1]; const blue = pixels[at + 2];
          if (red > 145 && green > 130 && blue < 105 && red + green > blue * 3) { yellowPixels += 1; left = Math.min(left, column); right = Math.max(right, column); }
        }
        if (yellowPixels >= 16) headerBottom = row;
        if (yellowPixels > strongestYellow && right > left) { strongestYellow = yellowPixels; gridLeft = Math.max(0, left - step); gridRight = Math.min(source.width, right + step); }
      }
    }
    // Find the actual horizontal grid lines. This is the reliable anchor for
    // GeeBee's spreadsheet screenshots: it works regardless of image height,
    // zoom, or how many products appear on a page.
    const tableLeft = strongestYellow >= 16 ? gridLeft : 0;
    const tableRight = strongestYellow >= 16 ? gridRight : source.width;
    const darkLineRows: number[] = [];
    for (let row = 0; row < source.height; row += 1) {
      let dark = 0; let samples = 0;
      for (let column = Math.max(0, Math.floor(tableLeft)); column < Math.min(source.width, Math.ceil(tableRight)); column += 2) {
        const at = (row * source.width + column) * 4; const red = pixels?.[at] || 255; const green = pixels?.[at + 1] || 255; const blue = pixels?.[at + 2] || 255;
        if (red < 85 && green < 85 && blue < 85) dark += 1;
        samples += 1;
      }
      if (samples && dark / samples > .52) darkLineRows.push(row);
    }
    const gridLines = darkLineRows.reduce<number[]>((centers, row) => {
      const last = centers.at(-1); if (last === undefined || row - last > 2) centers.push(row); else centers[centers.length - 1] = Math.round((last + row) / 2);
      return centers;
    }, []);
    const gridStart = strongestYellow >= 16 ? Math.max(0, gridLines.findIndex((line) => line >= headerBottom - 3)) : 0;
    let gridClient = ""; let gridEta = "";
    if (strongestYellow >= 16) {
      const headerScale = (tableRight - tableLeft) / 485;
      const headerTop = headerBottom - Math.round(20 * headerScale);
      const dateRead = await readCell(tableLeft + (tableRight - tableLeft) * .2, Math.max(0, headerTop - 43 * headerScale), (tableRight - tableLeft) * .8, 28 * headerScale);
      gridClient = await readCell(tableLeft + (tableRight - tableLeft) * .085, Math.max(0, headerTop - 22 * headerScale), (tableRight - tableLeft) * .8, 27 * headerScale);
      const dateText = dateRead.match(/([0-3]?\d[.\/-][01]?\d[.\/-](?:20)?\d{2})/)?.[1];
      if (dateText) { const [day, month, year] = dateText.split(/[.\/-]/); gridEta = `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`; }
    }
    if (gridLines.length >= gridStart + 3) {
      const cellWidth = (tableRight - tableLeft) / 5;
      const gridProducts: ProductLine[] = []; let transporter = ""; let blanks = 0;
      for (let row = gridStart; row < gridLines.length - 1; row += 1) {
        const top = gridLines[row] + 1; const height = gridLines[row + 1] - gridLines[row] - 2;
        if (height < 12) continue;
        const skuText = await readCell(tableLeft, top, cellWidth, height);
        const quantityText = await readCell(tableLeft + cellWidth, top, cellWidth, height, true);
        const priceText = await readCell(tableLeft + cellWidth * 2, top, cellWidth, height, true);
        const valueText = await readCell(tableLeft + cellWidth * 3, top, cellWidth, height, true);
        const skuMatch = skuText.match(/[A-Z]{1,6}(?:\s*[- ]?\s*\d{2,8})/i); const quantity = Number(quantityText.replace(/[^\d]/g, ""));
        if (skuMatch && quantity) {
          blanks = 0; const value = Number(valueText.replace(/[^\d.]/g, "")); const printedPrice = Number(priceText.replace(/[^\d.]/g, ""));
          gridProducts.push({ product: "", sku: skuMatch[0].replace(/\s+/g, "-").replace(/-+/g, "-"), quantity, unitPrice: value && quantity ? value / quantity : printedPrice });
          continue;
        }
        const rowText = await readCell(tableLeft, top, cellWidth * 3, height);
        if (/\btransport\b/i.test(rowText)) transporter = rowText.replace(/\btotal\b.*$/i, "").replace(/[^a-z0-9 &.-]/gi, "").replace(/\s+/g, " ").trim();
        if (gridProducts.length) { blanks += 1; if (blanks >= 2) break; }
      }
      if (gridProducts.length) return { client: gridClient.replace(/^['’]/, "").trim(), eta: gridEta, products: gridProducts, note: "GeeBee grid order sheet", transporter: transporter || undefined };
    }
    // A continuation screenshot has no yellow ITEM header, but it still has
    // the same five equal-width columns. Read those cells directly rather
    // than using first-page offsets or loose full-page OCR.
    if (strongestYellow < 16 || !headerBottom) {
      const continuationWidth = source.width / 5;
      const continuationRow = source.height / 9.05; // 8 product rows + total row
      const continuationProducts: ProductLine[] = []; let blanks = 0;
      for (let row = 0; row < 30; row += 1) {
        const top = row * continuationRow;
        const skuText = await readCell(0, top + 1, continuationWidth, continuationRow - 2);
        const quantityText = await readCell(continuationWidth, top + 1, continuationWidth, continuationRow - 2, true);
        const priceText = await readCell(continuationWidth * 2, top + 1, continuationWidth, continuationRow - 2, true);
        const valueText = await readCell(continuationWidth * 3, top + 1, continuationWidth, continuationRow - 2, true);
        const match = skuText.match(/[A-Z]{1,6}(?:\s*[- ]?\s*\d{2,8})/i); const quantity = Number(quantityText.replace(/[^\d]/g, ""));
        if (!match || !quantity) { blanks += 1; if (blanks >= 3) break; continue; }
        blanks = 0; const value = Number(valueText.replace(/[^\d.]/g, "")); const printedPrice = Number(priceText.replace(/[^\d.]/g, ""));
        continuationProducts.push({ product: "", sku: match[0].replace(/\s+/g, "-").replace(/-+/g, "-"), quantity, unitPrice: value && quantity ? value / quantity : printedPrice });
      }
      const transportTop = continuationProducts.length * continuationRow;
      const transportRead = continuationProducts.length ? await readCell(0, transportTop, continuationWidth * 3, continuationRow - 1) : "";
      const transporter = /\btransport\b/i.test(transportRead) ? transportRead.replace(/\btotal\b.*$/i, "").replace(/[^a-z0-9 &.-]/gi, "").replace(/\s+/g, " ").trim() : "";
      return continuationProducts.length ? { client: "", eta: "", products: continuationProducts, note: "GeeBee internal order continuation", transporter: transporter || undefined } : null;
    }
    const gridWidth = gridRight - gridLeft;
    const columnWidth = gridWidth / 5;
    // Screen captures often include a different amount of empty spreadsheet
    // below the order. Scale from the five-column table itself, never from
    // the full image height, so that empty rows cannot shift OCR cell crops.
    if (strongestYellow >= 16) y = gridWidth / 485;
    const rowStart = headerBottom ? headerBottom + Math.max(1, Math.round(1.5 * y)) : 245 * y;
    const headerTop = headerBottom ? headerBottom - Math.round(20 * y) : 225 * y;
    const dateRead = await readCell(gridLeft + columnWidth, Math.max(0, headerTop - 43 * y), gridWidth * .8, 28 * y);
    const client = await readCell(gridLeft + gridWidth * .085, Math.max(0, headerTop - 22 * y), gridWidth * .8, 27 * y);
    const dateText = dateRead.match(/([0-3]?\d[.\/-][01]?\d[.\/-](?:20)?\d{2})/)?.[1];
    let eta = ""; if (dateText) { const [day, month, year] = dateText.split(/[.\/-]/); eta = `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`; }
    const products: ProductLine[] = []; let blankRows = 0;
    for (let row = 0; row < 100; row += 1) {
      const top = rowStart + row * 21 * y;
      // A little vertical overlap makes this resilient to WhatsApp/iPhone
      // screenshots whose grid line is one or two pixels higher or lower.
      let sku = await readCell(gridLeft, top - 2 * y, columnWidth, 24 * y);
      let quantityText = await readCell(gridLeft + columnWidth, top - 2 * y, columnWidth, 24 * y, true);
      const priceText = await readCell(gridLeft + columnWidth * 2, top - 2 * y, columnWidth, 24 * y, true);
      const valueText = await readCell(gridLeft + columnWidth * 3, top - 2 * y, columnWidth, 24 * y, true);
      let skuMatch = sku.match(/[A-Z]{1,6}(?:\s*[- ]?\s*\d{2,8})/i); let quantity = Number(quantityText.replace(/[^\d]/g, ""));
      // The final handwritten/phone-screenshot row commonly sits closest to a
      // gridline. Retry only an unreadable row with two nearby crops rather
      // than silently dropping it.
      // Always take a few nearby reads and retain the SKU with the most
      // characters. This prevents AB-203 being shortened to AB-20 when a
      // gridline sits across the final digit.
      const skuCandidates = skuMatch ? [skuMatch[0]] : [];
      for (const shift of [-7, -3, 4, 7]) {
        const retrySku = await readCell(gridLeft, top + shift * y, columnWidth, 21 * y);
        const candidateSku = retrySku.match(/[A-Z]{1,6}(?:\s*[- ]?\s*\d{2,8})/i);
        if (candidateSku) skuCandidates.push(candidateSku[0]);
      }
      if (skuCandidates.length) { const bestSku = skuCandidates.sort((a, b) => skuKey(b).length - skuKey(a).length)[0]; skuMatch = bestSku.match(/[A-Z]{1,6}(?:\s*[- ]?\s*\d{2,8})/i); }
      if (!skuMatch || !quantity) {
        for (const shift of [-6, 4]) {
          const retrySku = await readCell(gridLeft, top + shift * y, columnWidth, 21 * y);
          const retryQuantity = await readCell(gridLeft + columnWidth, top + shift * y, columnWidth, 21 * y, true);
          const candidateSku = retrySku.match(/[A-Z]{1,6}(?:\s*[- ]?\s*\d{2,8})/i); const candidateQuantity = Number(retryQuantity.replace(/[^\d]/g, ""));
          if (candidateSku && candidateQuantity) { sku = retrySku; quantityText = retryQuantity; skuMatch = candidateSku; quantity = candidateQuantity; break; }
        }
      }
      const value = Number(valueText.replace(/[^\d.]/g, "")); const scannedPrice = Number(priceText.replace(/[^\d.]/g, ""));
      if (!skuMatch || !quantity) { blankRows += 1; if (blankRows >= 4) break; continue; }
      blankRows = 0; const calculatedPrice = value && quantity ? value / quantity : 0; const unitPrice = calculatedPrice || scannedPrice;
      products.push({ product: "", sku: skuMatch[0].replace(/\s+/g, "-").replace(/-+/g, "-"), quantity, unitPrice });
    }
    // The row immediately after the product lines has the transporter merged
    // across the left-hand cells, followed by TOTAL on the right.
    const transporterRead = products.length ? await readCell(gridLeft, rowStart + products.length * 21 * y - 2 * y, columnWidth * 3, 24 * y) : "";
    const transporter = /\btransport\b/i.test(transporterRead) ? transporterRead.replace(/\b(?:total|remarks?)\b.*$/i, "").replace(/[^a-z0-9 &.-]/gi, "").replace(/\s+/g, " ").trim() : "";
    return products.length ? { client: client.replace(/^['’]/, "").trim(), eta, products, note: "GeeBee internal order sheet", transporter: transporter || undefined } : null;
  } finally { await worker.terminate(); URL.revokeObjectURL(source.src); }
};
const storageKey = "geebee-crm-data-v1";
const approvedWorkspaceEmails = ["vishu108818@gmail.com"];
type SavedCrmData = { orders: Order[]; clients: Client[]; invoices: Invoice[]; catalogue: CatalogueItem[]; leads: Lead[]; quotes: Quote[]; tasks: SalesTask[]; transporters: Transporter[] };
const loadCrmData = (): SavedCrmData => {
  const fallback = { orders: seedOrders, clients: seedClients, invoices: seedInvoices, catalogue: seedCatalogue, leads: seedLeads, quotes: seedQuotes, tasks: seedTasks, transporters: seedTransporters };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as Partial<SavedCrmData>;
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders : fallback.orders,
      clients: Array.isArray(parsed.clients) ? parsed.clients : fallback.clients,
      invoices: Array.isArray(parsed.invoices) ? parsed.invoices : fallback.invoices,
      catalogue: Array.isArray(parsed.catalogue) ? parsed.catalogue : fallback.catalogue,
      leads: Array.isArray(parsed.leads) ? parsed.leads : fallback.leads,
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : fallback.quotes,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : fallback.tasks,
      transporters: Array.isArray(parsed.transporters) ? parsed.transporters : fallback.transporters,
    };
  } catch { return fallback; }
};
const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("The image could not be saved."));
  reader.readAsDataURL(file);
});
function Pill({ value }: { value: string }) {
  return (
    <span className={`pill ${value.toLowerCase().replaceAll(" ", "-")}`}>
      {value}
    </span>
  );
}
function SignInScreen({ notice = "" }: { notice?: string }) {
  const [email, setEmail] = useState("vishu108818@gmail.com");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(notice);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);
  const sendMagicLink = async () => {
    if (!supabase || !email.trim()) return;
    if (cooldown) { setMessage(`Please wait ${cooldown} seconds before requesting another sign-in email.`); return; }
    if (mode === "signup" && (!fullName.trim() || !phone.trim())) { setMessage("Please enter your full name and phone number."); return; }
    setSending(true); setMessage("");
    if (mode === "signup") window.localStorage.setItem("geebee-signup-profile", JSON.stringify({ email: email.trim().toLowerCase(), fullName: fullName.trim(), phone: phone.trim() }));
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin, data: mode === "signup" ? { full_name: fullName.trim(), phone: phone.trim() } : undefined } });
    setSending(false);
    if (error) {
      setMessage(error.message.toLowerCase().includes("rate limit") ? "Email sending limit reached. Please wait before trying again. If this continues, the administrator needs to set up custom email delivery." : error.message);
      return;
    }
    setCooldown(60);
    setMessage("Secure link sent. Open it from your email to continue. You can request another link after 60 seconds.");
  };
  return <main className="auth-screen"><section className="auth-card"><div className="auth-logo">G</div><span className="overline">GEEBEE IMPORTS</span><h1>Private operations workspace</h1><div className="auth-tabs"><button className={mode === "signin" ? "active" : ""} type="button" onClick={() => { setMode("signin"); setMessage(""); }}>Sign in</button><button className={mode === "signup" ? "active" : ""} type="button" onClick={() => { setMode("signup"); setMessage(""); }}>Sign up</button></div><p>{mode === "signin" ? "Enter your work email and we’ll send a secure, password-free sign-in link." : "Create your secure account details. Your administrator must still grant workspace access."}</p>{mode === "signup" && <><label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" autoComplete="name"/></label><label>Phone number<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" autoComplete="tel"/></label></>}<label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendMagicLink()} placeholder="you@company.com" autoComplete="email"/></label><button className="primary auth-submit" type="button" disabled={sending} onClick={sendMagicLink}>{sending ? "Sending secure link…" : mode === "signup" ? "Create account and send link" : "Send secure sign-in link"}</button>{message && <div className={message.toLowerCase().includes("sent") ? "auth-message" : "auth-message warning"}>{message}</div>}<small>Only users granted access by a GeeBee administrator can open the CRM.</small></section></main>;
}
function SharedAccessScreen({ notice = "" }: { notice?: string }) {
  const [passcode, setPasscode] = useState("");
  const [message, setMessage] = useState(notice);
  const [loading, setLoading] = useState(false);
  const enter = async () => {
    if (!passcode.trim() || loading) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/auth/shared-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode }) });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Shared access could not be opened.");
      window.location.assign(result.url);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Shared access could not be opened."); setLoading(false); }
  };
  return <main className="auth-screen"><section className="auth-card"><div className="auth-logo">G</div><span className="overline">GEEBEE IMPORTS</span><h1>Internal CRM access</h1><p>Enter the shared internal passcode to open the GeeBee workspace.</p><label>Shared passcode<input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && enter()} placeholder="Enter passcode" autoFocus/></label><button className="primary auth-submit" type="button" disabled={loading || !passcode.trim()} onClick={enter}>{loading ? "Opening workspace…" : "Open CRM"}</button>{message && <div className="auth-message warning">{message}</div>}<small>Temporary internal access. Do not share the passcode outside GeeBee.</small></section></main>;
}
export default function Home() {
  const [section, setSection] = useState("Overview"),
    [search, setSearch] = useState(""),
    [orders, setOrders] = useState(seedOrders),
    [clients, setClients] = useState(seedClients),
    [invoices, setInvoices] = useState(seedInvoices),
    [catalogue, setCatalogue] = useState(seedCatalogue),
    [leads, setLeads] = useState(seedLeads),
    [quotes, setQuotes] = useState(seedQuotes),
    [tasks, setTasks] = useState(seedTasks),
    [transporters, setTransporters] = useState(seedTransporters),
    [storageReady, setStorageReady] = useState(false),
    [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(false),
    [cloudReady, setCloudReady] = useState(false),
    [cloudError, setCloudError] = useState(""),
    [accessNotice, setAccessNotice] = useState(""),
    [workspaceOwnerId, setWorkspaceOwnerId] = useState<string | null>(null),
    [allowedModules, setAllowedModules] = useState<CrmModule[]>([...crmModules]),
    [isAdmin, setIsAdmin] = useState(false),
    [members, setMembers] = useState<WorkspaceMember[]>([]),
    [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]),
    [clientProfile, setClientProfile] = useState<Client | null>(null),
    [notificationsOpen, setNotificationsOpen] = useState(false),
    [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ Customers: true, "Leads & Enquiries": true, Sales: true, Products: true, Inventory: true, Operations: true, Billing: true, Imports: true, Reports: true, Automation: true, Settings: true }),
    [modal, setModal] = useState<"order" | "client" | "invoice" | "catalogue" | "lead" | "quote" | "task" | "transporter" | null>(null),
    [editing, setEditing] = useState<any>(null),
    [toast, setToast] = useState("");
  const recordSnapshots = useRef<Record<string, Map<string, string>>>({});
  const flash = (m: string) => {
      setToast(m);
      setTimeout(() => setToast(""), 2600);
    },
    show = (k: "order" | "client" | "invoice" | "catalogue" | "lead" | "quote" | "task" | "transporter", d?: any) => {
      setEditing(d || null);
      setModal(k);
    };
  const logActivity = (action: string, module: string, details: string) => {
    const cloud = supabase;
    if (!cloud || !workspaceOwnerId || !session?.user.email) return;
    const event = { id: Date.now(), workspace_owner_id: workspaceOwnerId, actor_email: session.user.email, action, module, details, created_at: new Date().toISOString() };
    setAuditEvents((current) => [event, ...current].slice(0, 100));
    cloud.from("crm_audit_events").insert({ workspace_owner_id: event.workspace_owner_id, actor_email: event.actor_email, action, module, details }).then(({ error }) => { if (error) console.warn("Could not record activity", error.message); });
  };
  useEffect(() => {
    const saved = loadCrmData();
    setOrders(saved.orders); setClients(saved.clients); setInvoices(saved.invoices); setCatalogue(saved.catalogue); setLeads(saved.leads); setQuotes(saved.quotes); setTasks(saved.tasks); setTransporters(saved.transporters);
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ orders, clients, invoices, catalogue, leads, quotes, tasks, transporters }));
  }, [orders, clients, invoices, catalogue, leads, quotes, tasks, transporters, storageReady]);
  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const cloud = supabase;
    if (!cloud || !session?.user.email) return;
    const email = session.user.email.toLowerCase();
    const draft = typeof window !== "undefined" ? window.localStorage.getItem("geebee-signup-profile") : null;
    let profile: { fullName?: string; phone?: string } = {};
    try { profile = draft ? JSON.parse(draft) : {}; } catch { /* ignore an invalid local profile */ }
    cloud.from("crm_profiles").upsert({ user_id: session.user.id, email: session.user.email, full_name: profile.fullName || session.user.user_metadata?.full_name || "", phone: profile.phone || session.user.user_metadata?.phone || "" }, { onConflict: "user_id" }).then(() => { if (draft) window.localStorage.removeItem("geebee-signup-profile"); });
    if (approvedWorkspaceEmails.includes(email)) { setWorkspaceOwnerId(session.user.id); setAllowedModules([...crmModules]); setIsAdmin(true); return; }
    cloud.from("crm_workspace_members").select("id, workspace_owner_id, email, role, modules").ilike("email", email).maybeSingle().then(({ data }) => {
      if (!data) { setAccessNotice("Your account is awaiting access approval from a GeeBee administrator."); cloud.auth.signOut(); return; }
      const member = data as WorkspaceMember; setWorkspaceOwnerId(member.workspace_owner_id); setAllowedModules(member.modules || ["Overview"]); setIsAdmin(member.role === "admin");
    });
  }, [session]);
  useEffect(() => {
    const cloud = supabase;
    if (!cloud || !authReady || !session || !storageReady || !workspaceOwnerId) return;
    let cancelled = false;
    const loadScalableRecords = async () => {
      // The workspace row remains only as the access-control anchor. Business
      // records now live in their own tables and can grow independently.
      const { data: existingWorkspace, error: workspaceReadError } = await cloud.from("crm_workspaces").select("owner_id").eq("owner_id", workspaceOwnerId).maybeSingle();
      if (workspaceReadError || cancelled) { if (!cancelled) setCloudError("Cloud workspace is not ready yet. Please run the latest Supabase setup script."); return; }
      if (!existingWorkspace && isAdmin) {
        const { error: workspaceCreateError } = await cloud.from("crm_workspaces").upsert({ owner_id: workspaceOwnerId, data: { normalizedRecords: true }, updated_at: new Date().toISOString() });
        if (workspaceCreateError || cancelled) { if (!cancelled) setCloudError("Cloud workspace is not ready yet. Please run the latest Supabase setup script."); return; }
      }
      if (!existingWorkspace && !isAdmin) { setCloudError("Shared access could not locate the GeeBee workspace."); return; }
      const results = await Promise.all(scalableTables.map(({ table }) => cloud.from(table).select("record_id, data").eq("workspace_owner_id", workspaceOwnerId).order("updated_at", { ascending: false }).limit(50000)));
      if (cancelled) return;
      const failed = results.find((result) => result.error);
      if (failed?.error) { setCloudError("Database upgrade required: run the latest scalable CRM SQL script in Supabase, then refresh this page."); return; }
      const records = Object.fromEntries(scalableTables.map((config, index) => [config.key, (results[index].data || []) as ScalableRecord[]])) as Record<string, ScalableRecord[]>;
      const toItems = <T,>(key: string) => records[key].map((row) => row.data as T);
      if (records.clients.length || records.catalogue.length || records.orders.length || records.invoices.length || records.leads.length || records.quotes.length || records.tasks.length || records.transporters.length) {
        const loadedCatalogue = toItems<CatalogueItem>("catalogue").map((item) => ({ ...item, name: catalogueName(item) }));
        const loadedOrders = toItems<Order>("orders");
        const currentOrderIds = new Set(loadedOrders.map((order) => order.id));
        const loadedInvoices = toItems<Invoice>("invoices").filter((invoice) => !invoice.order || currentOrderIds.has(invoice.order));
        setClients(toItems<Client>("clients")); setCatalogue(loadedCatalogue); setOrders(loadedOrders); setInvoices(loadedInvoices); setLeads(toItems<Lead>("leads")); setQuotes(toItems<Quote>("quotes")); setTasks(toItems<SalesTask>("tasks")); setTransporters(toItems<Transporter>("transporters"));
        recordSnapshots.current = Object.fromEntries(scalableTables.map((config) => [config.table, new Map(records[config.key].map((row) => [row.record_id, JSON.stringify(row.data)]))]));
      } else recordSnapshots.current = {};
      setCloudError(""); setCloudReady(true);
    };
    loadScalableRecords();
    return () => { cancelled = true; };
  }, [authReady, session, storageReady, workspaceOwnerId, isAdmin]);
  useEffect(() => {
    const cloud = supabase;
    if (!cloud || !session || !cloudReady || !workspaceOwnerId) return;
    const collections: Array<{ table: string; items: any[]; search: (item: any) => string }> = [
      { table: "crm_clients", items: clients, search: scalableTables[0].search }, { table: "crm_products", items: catalogue, search: scalableTables[1].search }, { table: "crm_orders", items: orders, search: scalableTables[2].search }, { table: "crm_invoices", items: invoices, search: scalableTables[3].search }, { table: "crm_leads", items: leads, search: scalableTables[4].search }, { table: "crm_quotes", items: quotes, search: scalableTables[5].search }, { table: "crm_tasks", items: tasks, search: scalableTables[6].search }, { table: "crm_transporters", items: transporters, search: scalableTables[7].search },
    ];
    const syncTimer = window.setTimeout(async () => {
      for (const { table, items, search } of collections) {
        const previous = recordSnapshots.current[table] || new Map<string, string>();
        const next = new Map(items.map((item) => [String(item.id), JSON.stringify(item)]));
        const changed = items.filter((item) => previous.get(String(item.id)) !== JSON.stringify(item)).map((item) => ({ workspace_owner_id: workspaceOwnerId, record_id: String(item.id), search_key: search(item).toLowerCase(), data: item, updated_at: new Date().toISOString() }));
        const removed = [...previous.keys()].filter((id) => !next.has(id));
        if (changed.length) { const { error } = await cloud.from(table).upsert(changed, { onConflict: "workspace_owner_id,record_id" }); if (error) { setCloudError("A change could not be saved to the cloud. Your local copy is still safe."); return; } }
        if (removed.length) { const { error } = await cloud.from(table).delete().eq("workspace_owner_id", workspaceOwnerId).in("record_id", removed); if (error) { setCloudError("A deleted record could not be synced to the cloud."); return; } }
        recordSnapshots.current[table] = next;
      }
    }, 650);
    return () => window.clearTimeout(syncTimer);
  }, [orders, clients, invoices, catalogue, leads, quotes, tasks, transporters, session, cloudReady, workspaceOwnerId]);
  useEffect(() => {
    const cloud = supabase;
    if (!cloud || !isAdmin || !workspaceOwnerId) return;
    cloud.from("crm_workspace_members").select("id, workspace_owner_id, email, role, modules").eq("workspace_owner_id", workspaceOwnerId).then(({ data }) => setMembers((data || []) as WorkspaceMember[]));
  }, [isAdmin, workspaceOwnerId]);
  useEffect(() => {
    const cloud = supabase;
    if (!cloud || !isAdmin || !workspaceOwnerId) return;
    cloud.from("crm_audit_events").select("id, actor_email, action, module, details, created_at").eq("workspace_owner_id", workspaceOwnerId).order("created_at", { ascending: false }).limit(100).then(({ data }) => setAuditEvents((data || []) as AuditEvent[]));
  }, [isAdmin, workspaceOwnerId]);
  const shown = useMemo(
    () =>
      orders.filter((o) =>
        `${o.id} ${o.client} ${o.product} ${o.sku}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [orders, search],
  );
  const cancelOrder = (order: Order) => {
    if (!window.confirm(`Cancel ${order.id}? Its allocated stock will be released back to available inventory.`)) return;
    const isAdvance = order.status === "Advance order";
    const primaryId = isAdvance ? order.id.replace(/^ADV-/, "") : order.id;
    const advanceId = `ADV-${primaryId}`;
    const primaryOrder = orders.find((item) => item.id === primaryId);
    const advanceOrder = orders.find((item) => item.id === advanceId);
    const dispatchedLines = isAdvance || primaryOrder?.status !== "Dispatch plan" ? [] : linesFor(primaryOrder || order);
    const reservedLines = isAdvance ? linesFor(order) : advanceOrder ? linesFor(advanceOrder) : [];
    setCatalogue((current) => current.map((product) => {
      const dispatched = dispatchedLines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((sum, line) => sum + line.quantity, 0);
      const reserved = reservedLines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((sum, line) => sum + line.quantity, 0);
      if (!dispatched && !reserved) return product;
      return { ...product, availableQuantity: availableStock(product) + dispatched, reservedStock: Math.max(0, (product.reservedStock || 0) - reserved) };
    }));
    const cancelledIds = isAdvance ? [order.id] : [primaryId, advanceId];
    setOrders((current) => current.map((item) => cancelledIds.includes(item.id) ? { ...item, status: "Cancelled" } : item));
    setInvoices((current) => current.map((invoice) => cancelledIds.includes(invoice.order) ? { ...invoice, status: "Cancelled" } : invoice));
    logActivity("Cancelled order and released stock", "Orders", cancelledIds.join(", "));
    flash(`Cancelled ${order.id}; stock allocation released.`);
  };
  const removeOrders = (ids: string[]) => {
    const selectedIds = new Set(ids);
    const primaryIds = new Set<string>();
    const advanceIds = new Set<string>();
    ids.forEach((id) => {
      const order = orders.find((item) => item.id === id);
      if (!order) return;
      if (order.status === "Advance order") {
        const primaryId = id.replace(/^ADV-/, "");
        if (!selectedIds.has(primaryId)) advanceIds.add(id);
        return;
      }
      primaryIds.add(id);
      const advanceId = `ADV-${id}`;
      if (orders.some((item) => item.id === advanceId)) advanceIds.add(advanceId);
    });
    const removedIds = new Set([...primaryIds, ...advanceIds]);
    const dispatchedLines = [...primaryIds].flatMap((id) => {
      const order = orders.find((item) => item.id === id);
      return order?.status === "Dispatch plan" ? linesFor(order) : [];
    });
    const reservedLines = [...advanceIds].flatMap((id) => linesFor(orders.find((item) => item.id === id) || {} as Order));
    setCatalogue((current) => current.map((product) => {
      const dispatched = dispatchedLines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((sum, line) => sum + line.quantity, 0);
      const reserved = reservedLines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((sum, line) => sum + line.quantity, 0);
      if (!dispatched && !reserved) return product;
      return { ...product, availableQuantity: availableStock(product) + dispatched, reservedStock: Math.max(0, (product.reservedStock || 0) - reserved) };
    }));
    setOrders((current) => current.filter((item) => !removedIds.has(item.id)));
    setInvoices((current) => current.filter((invoice) => !removedIds.has(invoice.order)));
    setTasks((current) => current.filter((task) => !task.relatedTo || !removedIds.has(task.relatedTo)));
    logActivity("Removed order and released stock", "Orders", [...removedIds].join(", "));
    flash(`${ids.length} order${ids.length === 1 ? "" : "s"} removed; allocated stock returned to available inventory.`);
  };
  const initialiseOpeningStock = async () => {
    if (!supabase || !session) return;
    const response = await fetch("/api/admin/initialize-opening-stock", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
    const result = await response.json() as { ok?: boolean; updated?: number; error?: string };
    if (!response.ok || !result.ok) { flash(result.error || "Opening stock could not be updated."); return; }
    setCatalogue((current) => current.map((item) => ({ ...item, availableQuantity: 10000, openingStock: 0, purchasedStock: 0, orderedStock: 0, damagedStock: 0, reservedStock: 0 })));
    window.localStorage.setItem("geebee-available-stock-10000-v3", "true");
    logActivity("Reset demo inventory", "Catalogue", `${result.updated || 0} products set to 10,000 available units`);
    flash(`Demo inventory reset: ${result.updated || 0} products now have 10,000 available units.`);
  };
  const pushToDispatchPlan = (order: Order) => {
    if (order.status === "Dispatch plan" || order.status === "Cancelled" || isBackorderRecord(order)) return;
    const requestedLines = linesFor(order);
    if (!requestedLines.length) { flash("This order has no product lines to dispatch."); return; }
    if (!window.confirm(`Move ${order.id} to Dispatch Plan? Available quantities will be allocated now; any shortage will be created as a backorder.`)) return;
    const shortages: ProductLine[] = [];
    const dispatchLines: ProductLine[] = [];
    const remainingStock = new Map(catalogue.map((product) => [skuKey(product.sku), availableStock(product)]));
    requestedLines.forEach((line) => {
      const key = skuKey(line.sku); const available = remainingStock.get(key) || 0;
      const dispatchNow = Math.max(0, Math.min(line.quantity, available)); const short = Math.max(0, line.quantity - dispatchNow);
      remainingStock.set(key, Math.max(0, available - dispatchNow));
      if (dispatchNow) dispatchLines.push({ ...line, quantity: dispatchNow });
      if (short) shortages.push({ ...line, quantity: short });
    });
    setCatalogue((current) => current.map((product) => {
      const dispatched = dispatchLines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((sum, line) => sum + line.quantity, 0);
      const short = shortages.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((sum, line) => sum + line.quantity, 0);
      return !dispatched && !short ? product : { ...product, availableQuantity: Math.max(0, availableStock(product) - dispatched), reservedStock: (product.reservedStock || 0) + short };
    }));
    const firstDispatch = dispatchLines[0] || requestedLines[0];
    const dispatchOrder: Order = { ...order, product: firstDispatch.product, sku: firstDispatch.sku, quantity: firstDispatch.quantity, unitPrice: firstDispatch.unitPrice, products: dispatchLines, status: "Dispatch plan", backorders: shortages };
    const advanceOrder = shortages.length ? { ...order, id: `ADV-${order.id}`, product: shortages[0].product, sku: shortages[0].sku, quantity: shortages[0].quantity, unitPrice: shortages[0].unitPrice, products: shortages, status: "Advance order", payment: "Partial" } : null;
    setOrders((current) => [...current.filter((item) => item.id !== order.id && item.id !== `ADV-${order.id}`), dispatchOrder, ...(advanceOrder ? [advanceOrder] : [])]);
    if (advanceOrder) {
      const advanceAmount = shortages.reduce((total, line) => total + line.quantity * line.unitPrice, 0);
      setInvoices((current) => [...current.filter((invoice) => invoice.order !== advanceOrder.id), { id: advanceOrder.id, client: order.client, order: advanceOrder.id, amount: money(advanceAmount), due: "Advance payment", status: "Partial" }]);
      setTasks((current) => [...current, { id: `TASK-${Date.now()}`, title: `Arrange future dispatch for advance order ${advanceOrder.id}`, time: "10:00", dueDate: new Date().toISOString().slice(0, 10), assignee: "Rahul", type: "Follow-up", status: "Open", relatedTo: advanceOrder.id }]);
    }
    logActivity("Moved order to Dispatch Plan", "Dispatch Plan", shortages.length ? `${order.id} · ${shortages.length} shortage line(s) moved to backorder` : order.id);
    flash(shortages.length ? `${order.id} added to Dispatch Plan; shortage created as advance backorder.` : `${order.id} added to Dispatch Plan and inventory allocated.`);
  };
  useEffect(() => {
    if (!cloudReady || !session || session.user.email?.toLowerCase() !== "vishu108818@gmail.com") return;
    if (window.localStorage.getItem("geebee-available-stock-10000-v3")) return;
    initialiseOpeningStock();
  // This is an authorised one-time data migration for the workspace owner.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady, session]);
  const navigationGroups = [
    { label: "Dashboard", icon: LayoutDashboard, items: [{ label: "Dashboard", section: "Overview", module: "Overview" as CrmModule }] },
    { label: "Customers", icon: Users, items: [{ label: "All Customers", section: "Clients", module: "Clients" as CrmModule, count: String(clients.length) }, { label: "New Customers", section: "New Customers", module: "Clients" as CrmModule }, { label: "Customer Groups", section: "Customer Groups", module: "Clients" as CrmModule }, { label: "Customer Activity", section: "Customer Activity", module: "Clients" as CrmModule }] },
    { label: "Leads & Enquiries", icon: Target, items: [{ label: "Leads", section: "Leads", module: "Leads" as CrmModule, count: String(leads.filter((lead) => lead.status !== "Lost" && lead.status !== "Order Created").length) }, { label: "Enquiries", section: "Enquiries", module: "Leads" as CrmModule }, { label: "Follow-ups", section: "Follow-ups", module: "Leads" as CrmModule }, { label: "Lost Leads", section: "Lost Leads", module: "Leads" as CrmModule }] },
    { label: "Sales", icon: BriefcaseBusiness, items: [{ label: "Orders", section: "Orders", module: "Orders" as CrmModule, count: String(orders.filter((order) => !isBackorderRecord(order) && !["Dispatch plan", "Cancelled"].includes(order.status)).length) }, { label: "Backorders", section: "Backorders", module: "Orders" as CrmModule, count: String(orders.filter(isVisibleBackorder).length) }, { label: "Returns", section: "Returns", module: "Orders" as CrmModule }] },
    { label: "Products", icon: Boxes, items: [{ label: "Products / SKUs", section: "Catalogue", module: "Catalogue" as CrmModule, count: String(catalogue.length) }, { label: "Categories", section: "Categories", module: "Catalogue" as CrmModule }, { label: "Price Lists", section: "Price Lists", module: "Catalogue" as CrmModule }, { label: "Stock", section: "Stock", module: "Catalogue" as CrmModule }] },
    { label: "Inventory", icon: Warehouse, items: [{ label: "Stock Overview", section: "Stock Overview" }, { label: "Stock Movements", section: "Stock Movements" }, { label: "Low Stock", section: "Low Stock" }, { label: "Reserved Stock", section: "Reserved Stock" }, { label: "Warehouses", section: "Warehouses" }] },
    { label: "Operations", icon: Truck, items: [{ label: "Dispatch Plan", section: "Dispatch Plan", module: "Orders" as CrmModule, count: String(orders.filter((order) => order.status === "Dispatch plan").length) }, { label: "Transporters", section: "Transporters", module: "Shipments" as CrmModule, count: String(transporters.length) }, { label: "Picking", section: "Picking" }, { label: "Packing", section: "Packing" }, { label: "Delivery", section: "Delivery" }] },
    { label: "Billing", icon: ReceiptText, items: [{ label: "Invoices", section: "Invoices", module: "Invoices" as CrmModule, count: String(invoices.filter((i) => i.status !== "Paid").length) }, { label: "Payments", section: "Payments", module: "Payments" as CrmModule, count: "2" }, { label: "Outstanding", section: "Outstanding", module: "Payments" as CrmModule }, { label: "Ageing", section: "Ageing", module: "Payments" as CrmModule }] },
    { label: "Imports", icon: ShipWheel, items: [{ label: "Suppliers", section: "Suppliers" }, { label: "Purchase Orders", section: "Purchase Orders" }, { label: "Shipments", section: "Shipments", module: "Shipments" as CrmModule }, { label: "Containers", section: "Containers", module: "Shipments" as CrmModule }, { label: "Landed Cost", section: "Landed Cost", module: "Shipments" as CrmModule }] },
    { label: "Reports", icon: ChartNoAxesCombined, items: [{ label: "Sales", section: "Sales Report" }, { label: "Customers", section: "Customer Report" }, { label: "Products", section: "Product Report" }, { label: "Inventory", section: "Inventory Report" }, { label: "Payments", section: "Payment Report" }, { label: "Sales Team", section: "Sales Team Report" }] },
    { label: "Content Studio", icon: ImagePlus, items: [{ label: "Social image studio", section: "Image Studio", module: "Catalogue" as CrmModule }] },
    { label: "Automation", icon: Bot, items: [{ label: "Rules", section: "Rules" }, { label: "Notifications", section: "Notifications" }, { label: "Templates", section: "Templates" }] },
    { label: "Settings", icon: Settings, items: [{ label: "Users", section: "Settings" }, { label: "Roles", section: "Settings" }, { label: "Data recovery", section: "Recovery" }, { label: "GST", section: "GST" }, { label: "Warehouses", section: "Warehouses" }, { label: "WhatsApp", section: "WhatsApp" }, { label: "Integrations", section: "Integrations" }] },
  ];
  const notifications = [
    ...auditEvents.slice(0, 4).map((event) => ({ title: event.action, detail: `${event.actor_email} · ${event.module}`, time: new Date(event.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) })),
    ...invoices.filter((invoice) => invoice.status !== "Paid").slice(0, 2).map((invoice) => ({ title: `${invoice.status} invoice ${invoice.id}`, detail: `${invoice.client} · ${invoice.amount} due ${invoice.due}`, time: "Needs attention" })),
  ].slice(0, 6);
  const liveSections = new Set(["Overview", "Clients", "Leads", "Enquiries", "Follow-ups", "Lost Leads", "Quotations", "Orders", "Dispatch Plan", "Backorders", "Invoices", "Catalogue", "Transporters", "Notifications", "Sales Team Report", "Sales Report", "Customer Report", "Product Report", "Inventory Report", "Payment Report", "Image Studio", "Settings", "Recovery"]);
  if (!authReady) return <div className="auth-screen"><div className="auth-card"><b>Opening secure workspace…</b></div></div>;
  if (!supabase) return <div className="auth-screen"><div className="auth-card"><span className="overline">GEEBEE CRM</span><h1>Cloud connection needed</h1><p>Add the Supabase environment settings to open this private workspace.</p></div></div>;
  if (!session) return <SharedAccessScreen notice={accessNotice} />;
  return (
    <main>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/brand/geebee-logo-transparent.png" alt="GeeBee — The Party Factory" />
        </div>
        <div className="workspace">
          <div className="workspace-icon">G</div>
          <div>
            <b>GeeBee Imports</b>
            <span>Operations workspace</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav>
          {navigationGroups.map((group) => {
            const permitted = group.items.filter((item) => liveSections.has(item.section) && (!item.module || isAdmin || allowedModules.includes(item.module)));
            if (!permitted.length) return null;
            const Icon = group.icon;
            const active = permitted.some((item) => section === item.section);
            return <div className={`nav-group ${active ? "has-active" : ""}`} key={group.label}><button className="nav-group-title" type="button" onClick={() => setExpandedGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}><Icon size={16}/><span>{group.label}</span><ChevronDown size={14} className={expandedGroups[group.label] ? "open" : ""}/></button>{expandedGroups[group.label] && <div className="nav-children">{permitted.map((item) => { const count = (item as { count?: string }).count; return <button key={`${group.label}-${item.label}`} className={section === item.section ? "active" : ""} type="button" onClick={() => setSection(item.section)}><span>{item.label}</span>{count && <em>{count}</em>}</button>; })}</div>}</div>;
          })}
        </nav>
        <div className="side-bottom">
          <div className="profile">
            <div className="avatar">RM</div>
            <div>
              <b>{session.user.email}</b>
              <span>{cloudReady ? "Cloud workspace synced" : "Connecting to cloud…"}</span>
            </div>
            <button className="sign-out" type="button" onClick={() => supabase?.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </aside>
      <section className="content">
        <header>
          <div className="mobile-brand">GeeBee</div>
          <div className="search">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, product, client, order..."
            />
          </div>
          <button className="icon-btn" type="button" aria-label="Open notifications" onClick={() => setNotificationsOpen((current) => !current)}>
            <Bell size={19} />
            {notifications.length > 0 && <i />}
          </button>
          {notificationsOpen && <section className="notification-popover"><div className="notification-head"><div><b>Notifications</b><span>Latest workspace updates</span></div><button type="button" onClick={() => setNotificationsOpen(false)}>Close</button></div>{notifications.length ? notifications.map((notification, index) => <article className="notification-item" key={`${notification.title}-${index}`}><span className="notification-dot"/><div><b>{notification.title}</b><p>{notification.detail}</p><small>{notification.time}</small></div></article>) : <p className="notification-empty">You are all caught up.</p>}</section>}
          <div className="header-avatar">RM</div>
        </header>
        {cloudError && <div className="cloud-warning">{cloudError}</div>}
        <div className="page-head">
          <div>
            <div className="eyebrow">MONDAY, 15 SEPTEMBER 2026</div>
            <h1>{section === "Overview" ? "Good morning, Rahul" : section}</h1>
            <p>
              {section === "Overview"
                ? "Here’s what’s happening with your import business."
                : `Create, update and review your ${section.toLowerCase()} records.`}
            </p>
          </div>
          {["Orders", "Clients", "Invoices", "Catalogue"].includes(section) && (
            <button
              className="primary"
              onClick={() =>
                show(
                  (section === "Catalogue" ? "catalogue" : section.slice(0, -1).toLowerCase()) as
                    "order" | "client" | "invoice" | "catalogue",
                )
              }
            >
              <Plus size={18} /> New {section === "Catalogue" ? "product" : section.slice(0, -1)}
            </button>
          )}
          {section === "Overview" && (
            <button className="primary" onClick={() => show("order")}>
              <Plus size={18} /> New order
            </button>
          )}
          {["Leads", "Enquiries", "Lost Leads"].includes(section) && <button className="primary" onClick={() => show("lead")}><Plus size={18}/> New lead</button>}
          {section === "Follow-ups" && <button className="primary" onClick={() => show("task")}><Plus size={18}/> New task</button>}
          {section === "Quotations" && <button className="primary" onClick={() => show("quote")}><Plus size={18}/> New quotation</button>}
        </div>
        {section === "Overview" && (
          <Overview
            orders={orders}
            clients={clients}
            invoices={invoices}
            edit={(o) => show("order", o)}
            all={() => setSection("Orders")}
            flash={flash}
          />
        )}{" "}
        {section === "Image Studio" && <ImageStudio />}{" "}
        {section === "Orders" && (
          <Orders orders={shown.filter((order) => !isBackorderRecord(order) && order.status !== "Dispatch plan")} clients={clients} edit={(o) => show("order", o)} cancel={cancelOrder} remove={removeOrders} pushToDispatch={pushToDispatchPlan} />
        )}{" "}
        {section === "Dispatch Plan" && <DispatchPlanPanel orders={orders.filter((order) => order.status === "Dispatch plan")} clients={clients} edit={(o) => show("order", o)} cancel={cancelOrder} remove={removeOrders} />}{" "}
        {section === "Clients" && (
          <Clients
            clients={clients.filter((c) =>
              `${c.name} ${c.city} ${c.contact}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )}
            edit={(c) => show("client", c)}
            view={(c) => setClientProfile(c)}
            remove={(ids) => { setClients((current) => current.filter((item) => !ids.includes(item.id))); logActivity("Removed client", "Clients", ids.join(", ")); flash(`${ids.length} client${ids.length === 1 ? "" : "s"} removed`); }}
          />
        )}{" "}
        {["Leads", "Enquiries", "Lost Leads"].includes(section) && <LeadsPanel leads={leads.filter((lead) => { if (section === "Enquiries") return ["Requirement Received", "Quotation Sent", "Negotiation", "Confirmed"].includes(lead.status); if (section === "Lost Leads") return lead.status === "Lost"; return true; }).filter((lead) => `${lead.id} ${lead.company} ${lead.contact} ${lead.city}`.toLowerCase().includes(search.toLowerCase()))} edit={(lead) => show("lead", lead)} updateStage={(id, status) => { setLeads((current) => current.map((lead) => lead.id === id ? { ...lead, status } : lead)); logActivity("Updated lead stage", "Leads", `${id} → ${status}`); flash(`Lead moved to ${status}`); }} remove={(id) => { setLeads((current) => current.filter((lead) => lead.id !== id)); logActivity("Removed lead", "Leads", id); flash("Lead removed"); }} />}{" "}
        {section === "Follow-ups" && <TasksDashboard tasks={tasks} leads={leads} quotes={quotes} invoices={invoices} orders={orders} toggle={(id) => { setTasks((current) => current.map((task) => task.id === id ? { ...task, status: task.status === "Done" ? "Open" : "Done" } : task)); logActivity("Updated task", "Follow-ups", id); }} edit={(task) => show("task", task)} />}{" "}
        {section === "Sales Team Report" && <SalesTeamDashboard leads={leads} quotes={quotes} orders={orders} invoices={invoices} />}{" "}
        {["Sales Report", "Customer Report", "Product Report", "Inventory Report", "Payment Report"].includes(section) && <ReportsDashboard report={section} orders={orders} clients={clients} catalogue={catalogue} leads={leads} quotes={quotes} invoices={invoices} />}{" "}
        {section === "Quotations" && <QuotesPanel quotes={quotes.filter((quote) => `${quote.id} ${quote.customer}`.toLowerCase().includes(search.toLowerCase()))} edit={(quote) => show("quote", quote)} remove={(id) => { setQuotes((current) => current.filter((quote) => quote.id !== id)); logActivity("Removed quotation", "Quotations", id); flash("Quotation removed"); }} convert={(quote) => { const customer = clients.find((client) => client.name === quote.customer); const first = quote.products[0] || { product: "", sku: "", quantity: 0, unitPrice: 0, discount: 0 }; const products = quote.products.map(({ discount: _discount, ...product }) => product); const order: Order = { id: `GB-${String(Date.now()).slice(-5)}`, client: quote.customer, city: customer?.city || "", product: first.product, sku: first.sku, quantity: first.quantity, unitPrice: first.unitPrice * (1 - first.discount / 100), products, eta: "", status: "Confirmed", payment: "Partial", avatar: customer?.avatar || initials(quote.customer) }; setOrders((current) => [...current, order]); setQuotes((current) => current.map((item) => item.id === quote.id ? { ...item, status: "Converted" } : item)); logActivity("Converted quotation to order", "Quotations", `${quote.id} → ${order.id}`); flash(`Order ${order.id} created from ${quote.id}`); }} />}{" "}
        {section === "Backorders" && <BackordersPanel orders={orders.filter(isVisibleBackorder)} clients={clients} edit={(order) => show("order", order)} cancel={cancelOrder} remove={removeOrders} />}{" "}
        {section === "Invoices" && (
          <Invoices
            invoices={invoices.filter((i) =>
              `${i.id} ${i.client} ${i.order}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )}
            clients={clients}
            edit={(i) => show("invoice", i)}
            remove={(ids) => { setInvoices((current) => current.filter((item) => !ids.includes(item.id))); logActivity("Removed invoice", "Invoices", ids.join(", ")); flash(`${ids.length} invoice${ids.length === 1 ? "" : "s"} removed`); }}
          />
        )}{" "}
        {section === "Catalogue" && (
          <CataloguePanel
            items={catalogue.filter((item) => `${catalogueName(item)} ${item.sku} ${item.category}`.toLowerCase().includes(search.toLowerCase()) || skuKey(item.sku).includes(skuKey(search)))}
            edit={(item) => show("catalogue", item)}
            addDrafts={(drafts) => { setCatalogue((current) => [...current, ...drafts]); logActivity("Imported catalogue products", "Catalogue", `${drafts.length} SKU draft(s)`); flash(`${drafts.length} SKU draft${drafts.length === 1 ? "" : "s"} added from catalogue image`); }}
            setAllOpeningStock={() => { if (window.confirm(`Reset demo inventory for all ${catalogue.length} products to 10,000 available units? Existing stock allocations will be cleared.`)) initialiseOpeningStock(); }}
            remove={(ids) => { setCatalogue((current) => current.filter((item) => !ids.includes(item.id))); logActivity("Removed catalogue product", "Catalogue", ids.join(", ")); flash(`${ids.length} product${ids.length === 1 ? "" : "s"} removed from catalogue`); }}
          />
        )}{" "}
        {section === "Transporters" && <TransportersPanel transporters={transporters.filter((item) => `${item.name} ${item.contact} ${item.phone} ${item.city || ""}`.toLowerCase().includes(search.toLowerCase()))} edit={(item) => show("transporter", item)} add={() => show("transporter")} remove={(ids) => { setTransporters((current) => current.filter((item) => !ids.includes(item.id))); logActivity("Removed transporter", "Transporters", ids.join(", ")); flash(`${ids.length} transporter${ids.length === 1 ? "" : "s"} removed`); }} />}{" "}
        {section === "Settings" && <TeamAccess members={members} workspaceOwnerId={workspaceOwnerId} canManage={isAdmin} onChange={setMembers} onAudit={logActivity} auditEvents={auditEvents} />}{" "}
        {section === "Recovery" && <RecoveryPanel canManage={isAdmin} session={session} applyRestore={(data) => { setOrders(data.orders); setClients(data.clients); setInvoices(data.invoices); setCatalogue(data.catalogue); setLeads(data.leads); setQuotes(data.quotes); setTasks(data.tasks); setTransporters(data.transporters || []); logActivity("Applied Google Sheets recovery", "Data recovery", "Recovery snapshot created before restore"); flash("Backup restored. Your previous CRM state is saved as a recovery snapshot."); }} />}{" "}
        {section === "Notifications" && <AutomationPanel />}{" "}
        {!(["Overview", "Orders", "Dispatch Plan", "Clients", "Leads", "Enquiries", "Follow-ups", "Lost Leads", "Quotations", "Backorders", "Invoices", "Catalogue", "Transporters", "Settings", "Recovery", "Notifications", "Sales Team Report", "Sales Report", "Customer Report", "Product Report", "Inventory Report", "Payment Report"].includes(section)) && (
          <section className="panel coming">
            <div className="modal-mark">
              <ClipboardList size={22} />
            </div>
            <h2>{section} workspace</h2>
            <p>
              This workspace is laid out and ready for its dedicated business workflow. Orders, customers, products, invoices and team access are live now.
            </p>
          </section>
        )}
      </section>
      {modal === "order" && (
        <OrderModal
          order={editing}
          clients={clients}
          catalogue={catalogue}
          transporters={transporters}
          createClient={(client) => {
            setClients((current) => current.some((item) => item.name.trim().toLowerCase() === client.name.trim().toLowerCase()) ? current : [...current, client]);
            logActivity("Created incomplete client from order sheet", "Clients", client.name);
            flash(`${client.name} was added as an incomplete client profile.`);
          }}
          close={() => setModal(null)}
          save={(o) => {
            // Creating an order only records the customer's request. Inventory
            // is intentionally untouched until the user moves it to Dispatch Plan.
            const savedOrder = editing ? { ...o, status: editing.status } : { ...o, status: o.status === "Cancelled" ? "Confirmed" : o.status, backorders: [] };
            setOrders((current) => editing ? current.map((item) => item.id === editing.id ? savedOrder : item) : [...current, savedOrder]);
            setModal(null);
            logActivity(editing ? "Updated order" : "Created order", "Orders", o.id);
            flash(editing ? "Order updated successfully" : "New order created. Inventory will be allocated only after it is pushed to Dispatch Plan.");
          }}
        />
      )}
      {modal === "client" && (
        <ClientModal
          client={editing}
          catalogue={catalogue}
          close={() => setModal(null)}
          save={(c) => {
            setClients((x) =>
              editing ? x.map((y) => (y.id === editing.id ? c : y)) : [...x, c],
            );
            setModal(null);
            logActivity(editing ? "Updated client" : "Created client", "Clients", c.name);
            flash(
              editing
                ? "Client updated successfully"
                : "New client created successfully",
            );
          }}
        />
      )}
      {clientProfile && <ClientProfile client={clientProfile} orders={orders} invoices={invoices} catalogue={catalogue} auditEvents={auditEvents} close={() => setClientProfile(null)} edit={() => { setClientProfile(null); show("client", clientProfile); }} />}
      {modal === "invoice" && (
        <InvoiceModal
          invoice={editing}
          clients={clients}
          orders={orders}
          close={() => setModal(null)}
          save={(i) => {
            setInvoices((x) =>
              editing ? x.map((y) => (y.id === editing.id ? i : y)) : [...x, i],
            );
            setModal(null);
            logActivity(editing ? "Updated invoice" : "Created invoice", "Invoices", i.id);
            flash(
              editing
                ? "Invoice updated successfully"
                : "New invoice created successfully",
            );
          }}
        />
      )}
      {modal === "catalogue" && (
        <CatalogueModal
          item={editing}
          close={() => setModal(null)}
          save={(item) => {
            setCatalogue((current) => editing ? current.map((existing) => existing.id === editing.id ? item : existing) : [...current, item]);
            setModal(null);
            logActivity(editing ? "Updated catalogue product" : "Created catalogue product", "Catalogue", item.sku || item.name);
            flash(editing ? "Catalogue product updated" : "Catalogue product added");
          }}
        />
      )}
      {modal === "lead" && <LeadModal lead={editing} close={() => setModal(null)} save={(lead) => { setLeads((current) => editing ? current.map((item) => item.id === editing.id ? lead : item) : [...current, lead]); setModal(null); logActivity(editing ? "Updated lead" : "Created lead", "Leads", `${lead.id} · ${lead.company}`); flash(editing ? "Lead updated" : "New lead created"); }} />}
      {modal === "quote" && <QuoteModal quote={editing} clients={clients} catalogue={catalogue} close={() => setModal(null)} save={(quote) => { setQuotes((current) => editing ? current.map((item) => item.id === editing.id ? quote : item) : [...current, quote]); setModal(null); logActivity(editing ? "Updated quotation" : "Created quotation", "Quotations", `${quote.id} · ${quote.customer}`); flash(editing ? "Quotation updated" : "Quotation created"); }} />}
      {modal === "task" && <TaskModal task={editing} close={() => setModal(null)} save={(task) => { setTasks((current) => editing ? current.map((item) => item.id === editing.id ? task : item) : [...current, task]); setModal(null); logActivity(editing ? "Updated task" : "Created task", "Follow-ups", task.title); flash(editing ? "Task updated" : "Task created"); }} />}
      {modal === "transporter" && <TransporterModal transporter={editing} close={() => setModal(null)} save={(transporter) => { setTransporters((current) => editing ? current.map((item) => item.id === editing.id ? transporter : item) : [...current, transporter]); setModal(null); logActivity(editing ? "Updated transporter" : "Added transporter", "Transporters", transporter.name); flash(editing ? "Transporter updated" : "Transporter added"); }} />}
      {toast && (
        <div className="toast">
          <PackageCheck size={18} />
          {toast}
        </div>
      )}
    </main>
  );
}
function Overview({
  orders,
  clients,
  invoices,
  edit,
  all,
  flash,
}: {
  orders: Order[];
  clients: Client[];
  invoices: Invoice[];
  edit: (o: Order) => void;
  all: () => void;
  flash: (s: string) => void;
}) {
  const amount = (value: string) => Number(value.replace(/[^\d.-]/g, "")) || 0;
  const normalOrders = orders.filter((order) => !isBackorderRecord(order) && order.status !== "Cancelled");
  const totalValue = normalOrders.reduce((total, order) => total + orderTotal(order), 0);
  const paid = invoices.filter((invoice) => invoice.status === "Paid").reduce((total, invoice) => total + amount(invoice.amount), 0);
  const overdue = invoices.filter((invoice) => invoice.status === "Overdue").reduce((total, invoice) => total + amount(invoice.amount), 0);
  const pending = invoices.filter((invoice) => invoice.status !== "Paid").reduce((total, invoice) => total + amount(invoice.amount), 0);
  const collectedPercent = paid + pending ? Math.round((paid / (paid + pending)) * 100) : 0;
  const activeOrders = normalOrders.filter((order) => order.status !== "Delivered").length;
  const inTransit = normalOrders.filter((order) => order.status === "In transit").length;
  return (
    <>
      <div className="metrics">
        <Metric
          label="Orders in progress"
          value={String(activeOrders)}
          change={`${normalOrders.length} total orders`}
          icon={<PackageCheck />}
          kind="burgundy"
        />
        <Metric
          label="Order value"
          value={money(totalValue)}
          change={`${money(pending)} pending`}
          icon={<CircleDollarSign />}
          kind="coral"
        />
        <Metric
          label="Shipments in transit"
          value={String(inTransit)}
          change={inTransit ? "Currently in transit" : "No active transit orders"}
          icon={<ShipWheel />}
          kind="gold"
        />
        <Metric
          label="Active clients"
          value={String(clients.length)}
          change={clients.length ? "CRM customers" : "Add your first customer"}
          icon={<Users />}
          kind="violet"
        />
      </div>
      <div className="grid-main">
        <section className="panel orders-panel">
          <div className="panel-head">
            <div>
              <h2>Recent orders</h2>
              <p>Products, quantities and delivery progress.</p>
            </div>
            <button className="text-btn" onClick={all}>
              View all <span>→</span>
            </button>
          </div>
          <OrderTable orders={orders.filter((order) => !isBackorderRecord(order))} edit={edit} compact />
        </section>
        <aside className="side-column">
          <section className="panel collection">
            <div className="panel-head">
              <div>
                <h2>Collection health</h2>
              <p>Live invoice status</p>
              </div>
            </div>
            <div className="ring-row">
              <div className="ring" style={{ background: `conic-gradient(#8b2038 0 ${collectedPercent}%, #e4eff0 ${collectedPercent}% 100%)` }}>
                <div>
                  <b>{collectedPercent}%</b>
                  <small>Collected</small>
                </div>
              </div>
              <div className="collection-data">
                <div>
                  <span className="dot paid" />
                  <p>
                    Collected <b>{money(paid)}</b>
                  </p>
                </div>
                <div>
                  <span className="dot pending" />
                  <p>
                    Pending <b>{money(pending)}</b>
                  </p>
                </div>
                <div>
                  <span className="dot late" />
                  <p>
                    Overdue <b>{money(overdue)}</b>
                  </p>
                </div>
              </div>
            </div>
            <button
              className="outline"
              onClick={() => flash("Opening payment follow-ups")}
            >
              Review payment follow-ups <span>→</span>
            </button>
          </section>
          <section className="panel activity">
            <div className="panel-head">
              <h2>Activity</h2>
            </div>
            {orders.slice(0, 3).map((order) => (
              <div className="activity-item" key={order.id}>
                <div className="activity-icon money">
                  <CircleDollarSign size={16} />
                </div>
                <div>
                  <b>Order {order.id} · {order.status}</b>
                  <p>{order.client} · {money(orderTotal(order))}</p>
                  <small>{order.payment} payment status</small>
                </div>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
function TransportersPanel({ transporters, edit, add, remove }: { transporters: Transporter[]; edit: (item: Transporter) => void; add: () => void; remove: (ids: number[]) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const removeSelected = () => { if (!selected.length || !window.confirm(`Remove ${selected.length} transporter${selected.length === 1 ? "" : "s"}?`)) return; remove(selected); setSelected([]); };
  return <section className="panel transporter-panel"><div className="panel-head"><div><span className="overline">OPERATIONS DIRECTORY</span><h2>Transport vendors</h2><p>Add approved transporters once, then assign the right vendor to every order.</p></div><button className="primary" type="button" onClick={add}><Plus size={16}/> Add transporter</button></div>{transporters.length ? <><div className="record-bulk-bar"><span>Select vendors to manage them together.</span>{selected.length > 0 && <button type="button" className="bulk-delete" onClick={removeSelected}><Trash2 size={14}/> Remove {selected.length}</button>}</div><div className="table-wrap"><table className="records"><thead><tr><th><input className="record-check" type="checkbox" checked={transporters.length > 0 && selected.length === transporters.length} onChange={() => setSelected(selected.length === transporters.length ? [] : transporters.map((item) => item.id))} aria-label="Select all transporters"/></th><th>TRANSPORTER</th><th>CONTACT</th><th>PHONE</th><th>CITY</th><th>SERVICE</th><th/></tr></thead><tbody>{transporters.map((item) => <tr key={item.id}><td><input className="record-check" type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} aria-label={`Select ${item.name}`}/></td><td><b>{item.name}</b>{item.gstin && <small className="transporter-gstin">GSTIN: {item.gstin}</small>}</td><td>{item.contact || "—"}</td><td>{item.phone || "—"}</td><td>{item.city || "—"}</td><td><span className="transporter-service">{item.serviceType || "General"}</span></td><td><button className="edit-btn" type="button" onClick={() => edit(item)}><Pencil size={14}/> Edit</button></td></tr>)}</tbody></table></div></> : <div className="transporter-empty"><Truck size={25}/><h3>No transporters added</h3><p>Add your transport vendors to select them while creating an order.</p><button className="primary" type="button" onClick={add}>Add first transporter</button></div>}</section>;
}
function TransporterModal({ transporter, close, save }: { transporter: Transporter | null; close: () => void; save: (item: Transporter) => void }) {
  const [form, setForm] = useState<Transporter>(transporter || { id: Date.now(), name: "", contact: "", phone: "", email: "", city: "", gstin: "", serviceType: "Road transport", notes: "" });
  const update = (key: keyof Transporter, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <Shell close={close}><div className="order-modal-head"><div className="modal-mark"><Truck size={22}/></div><div><span className="overline">TRANSPORT VENDOR</span><h2>{transporter ? "Edit transporter" : "Add transporter"}</h2><p>Save vendor information for quick assignment on orders.</p></div></div><div className="form-row"><label>Transporter name<input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Vendor / transport company" required/></label><label>Contact person<input value={form.contact} onChange={(event) => update("contact", event.target.value)} placeholder="Contact person"/></label></div><div className="form-row"><label>Phone<input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+91 98765 43210" required/></label><label>Email<input type="email" value={form.email || ""} onChange={(event) => update("email", event.target.value)} placeholder="operations@vendor.com"/></label></div><div className="form-row"><label>City<input value={form.city || ""} onChange={(event) => update("city", event.target.value)} placeholder="Mumbai"/></label><label>Service type<select value={form.serviceType || "Road transport"} onChange={(event) => update("serviceType", event.target.value)}>{["Road transport", "Courier", "Air cargo", "Rail freight", "Local delivery", "Other"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label>GSTIN<input value={form.gstin || ""} onChange={(event) => update("gstin", event.target.value.toUpperCase())} placeholder="GSTIN, if applicable"/></label><label>Notes<textarea value={form.notes || ""} onChange={(event) => update("notes", event.target.value)} placeholder="Service areas, payment terms, or other notes"/></label><button className="primary modal-submit" type="button" disabled={!form.name.trim() || !form.phone.trim()} onClick={() => save({ ...form, name: form.name.trim(), contact: form.contact.trim(), phone: form.phone.trim() })}>Save transporter</button></Shell>;
}
function Orders({
  orders,
  clients,
  edit,
  cancel,
  remove,
  pushToDispatch,
}: {
  orders: Order[];
  clients: Client[];
  edit: (o: Order) => void;
  cancel: (order: Order) => void;
  remove: (ids: string[]) => void;
  pushToDispatch: (order: Order) => void;
}) {
  return (
    <section className="panel record-panel">
      <div className="panel-head">
        <div>
          <h2>Order register</h2>
          <p>Orders do not affect inventory until they are pushed to Dispatch Plan.</p>
        </div>
      </div>
      <OrderTable orders={orders} edit={edit} cancel={cancel} remove={remove} pushToDispatch={pushToDispatch} sendWhatsApp={(order) => { const client = clients.find((item) => item.name === order.client); openWhatsApp(client?.whatsapp || client?.phone || "", `Dear ${order.client}, your GeeBee order #${order.id} is confirmed. Order value: ${money(orderTotal(order))}. We will keep you updated.`); }} />
    </section>
  );
}
function OrderTable({
  orders,
  edit,
  cancel,
  remove,
  sendWhatsApp,
  pushToDispatch,
  compact = false,
}: {
  orders: Order[];
  edit: (o: Order) => void;
  cancel?: (order: Order) => void;
  remove?: (ids: string[]) => void;
  sendWhatsApp?: (order: Order) => void;
  pushToDispatch?: (order: Order) => void;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const selectable = Boolean(remove) && !compact;
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const removeSelected = () => {
    if (!remove || !selected.length || !window.confirm(`Remove ${selected.length} selected order${selected.length === 1 ? "" : "s"}?`)) return;
    remove(selected); setSelected([]);
  };
  const removeOne = (order: Order) => {
    if (!remove || !window.confirm(`Remove order ${order.id}?`)) return;
    remove([order.id]); setSelected((current) => current.filter((id) => id !== order.id));
  };
  return (
    <><div className="record-bulk-bar">{selectable ? <><span>Select orders to manage them together.</span>{selected.length > 0 && <button type="button" className="bulk-delete" onClick={removeSelected}><Trash2 size={14}/> Remove {selected.length} selected</button>}</> : null}</div><div className="table-wrap">
      <table className="records">
        <thead>
          <tr>
            {selectable && <th><input className="record-check" type="checkbox" checked={orders.length > 0 && orders.every((order) => selected.includes(order.id))} onChange={() => setSelected(selected.length === orders.length ? [] : orders.map((order) => order.id))} aria-label="Select all orders" /></th>}
            <th>ORDER</th>
            <th>CLIENT</th>
            {!compact && (
              <>
                <th>PRODUCT</th>
                <th>QTY</th>
                <th>UNIT PRICE</th>
              </>
            )}
            <th>VALUE</th>
            <th>ETA</th>
            <th>STATUS</th>
            <th>PAYMENT</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              {selectable && <td><input className="record-check" type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} aria-label={`Select order ${o.id}`} /></td>}
              <td>
                <b>{o.id}</b>
              </td>
              <td>
                <div className="client">
                  <span className="mini-avatar">{o.avatar}</span>
                  <div>
                    <b>{o.client}</b>
                    <small>{o.city}{o.transporter ? ` · ${o.transporter}` : ""}</small>
                  </div>
                </div>
              </td>
              {!compact && (
                <>
                  <td>
                    <b>{o.product}{o.products && o.products.length > 1 ? ` +${o.products.length - 1}` : ""}</b>
                  </td>
                  <td>{orderQuantity(o).toLocaleString("en-IN")}</td>
                  <td>{money(o.unitPrice)}</td>
                </>
              )}
              <td>
                <b>{money(orderTotal(o))}</b>
              </td>
              <td>
                {new Date(o.eta).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                })}
              </td>
              <td>
                <Pill value={o.status} />
              </td>
              <td>
                <Pill value={o.payment} />
              </td>
              <td>
                <div className="record-actions">{pushToDispatch && o.status !== "Cancelled" && <button className="dispatch-action" type="button" onClick={() => pushToDispatch(o)}>Dispatch plan</button>}{sendWhatsApp && <button className="whatsapp-action" type="button" onClick={() => sendWhatsApp(o)} aria-label={`Send WhatsApp confirmation for ${o.id}`}>WA</button>}<button className="whatsapp-action" type="button" onClick={() => downloadOrderPdf(o)} aria-label={`Download ${o.status === "Advance order" ? "advance order" : "purchase order"} ${o.id}`}>{o.status === "Advance order" ? "AO" : "PO"}</button><button className="edit-btn" onClick={() => edit(o)} aria-label={`Edit ${o.id}`}><Pencil size={14} /></button>{cancel && o.status !== "Cancelled" && <button className="row-delete" type="button" onClick={() => cancel(o)} aria-label={`Cancel ${o.id}`}>Cancel</button>}{selectable && <button className="row-delete" type="button" onClick={() => removeOne(o)} aria-label={`Remove ${o.id}`}><Trash2 size={14}/></button>}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!orders.length && <div className="empty">No matching orders found.</div>}
    </div></>
  );
}
function Clients({
  clients,
  edit,
  view,
  remove,
}: {
  clients: Client[];
  edit: (c: Client) => void;
  view: (c: Client) => void;
  remove: (ids: number[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const removeSelected = () => { if (selected.length && window.confirm(`Remove ${selected.length} selected client${selected.length === 1 ? "" : "s"}?`)) { remove(selected); setSelected([]); } };
  const removeOne = (client: Client) => { if (window.confirm(`Remove ${client.name} from the client directory?`)) { remove([client.id]); setSelected((current) => current.filter((id) => id !== client.id)); } };
  return (
    <section className="panel record-panel">
      <div className="panel-head">
        <div>
          <h2>Client directory</h2>
          <p>Edit contacts, cities and payment thresholds.</p>
        </div>
      </div>
      <div className="record-bulk-bar"><span>Select clients to manage them together.</span>{selected.length > 0 && <button type="button" className="bulk-delete" onClick={removeSelected}><Trash2 size={14}/> Remove {selected.length} selected</button>}</div><div className="table-wrap">
        <table className="records">
          <thead>
            <tr>
              <th><input className="record-check" type="checkbox" checked={clients.length > 0 && clients.every((client) => selected.includes(client.id))} onChange={() => setSelected(selected.length === clients.length ? [] : clients.map((client) => client.id))} aria-label="Select all clients" /></th>
              <th>CLIENT</th>
              <th>PROFILE</th>
              <th>LOCATION</th>
              <th>PRIMARY CONTACT</th>
              <th>PHONE</th>
              <th>TYPE</th>
              <th>STATUS</th>
              <th>PAYMENT THRESHOLD</th>
              <th>SPECIAL SKU RATES</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td><input className="record-check" type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} /></td>
                <td>
                  <div className="client">
                    <span className="mini-avatar">{c.avatar}</span>
                    <button className="client-name-link" type="button" onClick={() => view(c)}>{c.name}</button>
                  </div>
                </td>
                <td>{isClientProfileIncomplete(c) ? <span className="profile-incomplete">Incomplete</span> : <span className="profile-complete">Complete</span>}</td>
                <td>{c.city}</td>
                <td>{c.contact}</td>
                <td>{c.phone}</td>
                <td>{c.customerCategory || c.businessType || <span className="muted-cell">Not set</span>}</td>
                <td><Pill value={c.customerStatus || "Active"}/></td>
                <td>
                  <b>{c.credit}</b>
                </td>
                <td>{c.specialRates?.length ? `${c.specialRates.length} SKU rate${c.specialRates.length === 1 ? "" : "s"}` : <span className="muted-cell">Standard</span>}</td>
                <td>
                  <div className="record-actions"><button className="edit-btn" onClick={() => edit(c)} aria-label={`Edit ${c.name}`}><Pencil size={14} /></button><button className="row-delete" type="button" onClick={() => removeOne(c)} aria-label={`Remove ${c.name}`}><Trash2 size={14}/></button></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
const leadStages: LeadStage[] = ["New", "Contacted", "Requirement Received", "Quotation Sent", "Negotiation", "Confirmed", "Order Created", "Lost"];
const leadSources = ["WhatsApp", "Phone", "IndiaMART", "TradeIndia", "JD Mart", "Instagram", "Website", "Referral", "Existing customer", "Exhibition", "Salesperson", "Other"];
const lostReasons = ["Price", "Out of stock", "Competitor", "Customer cancelled", "No response", "Payment issue", "Other"];
const quoteSubtotal = (quote: Quote) => quote.products.reduce((total, product) => total + product.quantity * product.unitPrice * (1 - product.discount / 100), 0);
const quoteTotal = (quote: Quote) => { const subtotal = quoteSubtotal(quote); return subtotal + subtotal * (quote.gst / 100) + quote.freight; };
const downloadQuotePdf = async (quote: Quote) => {
  const { jsPDF } = await import("jspdf"); const pdf = new jsPDF(); const logo = await fetch("/brand/geebee-logo.png").then((response) => response.blob()).then((blob) => new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob); })); let y = 18;
  pdf.addImage(logo, "PNG", 14, 8, 42, 42); pdf.setTextColor(104, 29, 43); pdf.setFontSize(22); pdf.text("QUOTATION", 196, 20, { align: "right" }); pdf.setFontSize(10); pdf.setTextColor(60, 50, 54); pdf.text(`Quotation No: ${quote.id}`, 196, 28, { align: "right" }); pdf.text(`Issued: ${new Date().toLocaleDateString("en-IN")}`, 196, 34, { align: "right" }); y = 58; pdf.setDrawColor(205, 171, 176); pdf.line(14, y, 196, y); y += 10; pdf.setFontSize(11); pdf.text(`Customer: ${quote.customer}`, 14, y); y += 7; pdf.setFontSize(9); pdf.text(`Validity: ${quote.validity || "Not specified"}  |  Payment: ${quote.paymentTerms || "To be agreed"}`, 14, y); y += 11;
  pdf.setFontSize(10); pdf.text("Product", 14, y); pdf.text("Qty", 105, y); pdf.text("Rate", 125, y); pdf.text("Discount", 148, y); pdf.text("Amount", 174, y); y += 5; pdf.line(14, y, 196, y); y += 7;
  quote.products.forEach((product) => { const total = product.quantity * product.unitPrice * (1 - product.discount / 100); pdf.text(product.product.slice(0, 42), 14, y); pdf.text(String(product.quantity), 105, y); pdf.text(String(product.unitPrice), 125, y); pdf.text(`${product.discount}%`, 148, y); pdf.text(String(Math.round(total)), 174, y); y += 7; });
  y += 4; pdf.line(112, y, 196, y); y += 7; pdf.text(`Subtotal: Rs. ${Math.round(quoteSubtotal(quote))}`, 125, y); y += 6; pdf.text(`GST (${quote.gst}%): Rs. ${Math.round(quoteSubtotal(quote) * quote.gst / 100)}`, 125, y); y += 6; pdf.text(`Freight: Rs. ${Math.round(quote.freight)}`, 125, y); y += 7; pdf.setFontSize(12); pdf.setTextColor(104, 29, 43); pdf.text(`Total: Rs. ${Math.round(quoteTotal(quote))}`, 125, y); y += 14; pdf.setFontSize(9); pdf.setTextColor(60, 50, 54); pdf.text(`Delivery terms: ${quote.deliveryTerms || "To be agreed"}`, 14, y); y += 8; pdf.setFontSize(8); pdf.text("Thank you for choosing GeeBee — The Party Factory.", 14, 285); pdf.save(`${quote.id}.pdf`);
};
const logoData = () => fetch("/brand/geebee-logo.png").then((response) => response.blob()).then((blob) => new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob); }));
const downloadOrderPdf = async (order: Order) => { const { jsPDF } = await import("jspdf"); const pdf = new jsPDF(); const logo = await logoData(); const isAdvanceOrder = order.status === "Advance order"; const documentTitle = isAdvanceOrder ? "ADVANCE ORDER" : "PURCHASE ORDER"; const documentLabel = isAdvanceOrder ? "Advance Order No" : "PO No"; pdf.addImage(logo, "PNG", 14, 8, 42, 42); pdf.setTextColor(104, 29, 43); pdf.setFontSize(22); pdf.text(documentTitle, 196, 20, { align: "right" }); pdf.setTextColor(60, 50, 54); pdf.setFontSize(10); pdf.text(`${documentLabel}: ${order.id}`, 196, 28, { align: "right" }); pdf.text(`Customer: ${order.client}`, 14, 60); pdf.text(`City: ${order.city || "—"}`, 14, 67); if (isAdvanceOrder) { pdf.setTextColor(139, 76, 19); pdf.text("This document covers only the short quantity pending future dispatch.", 14, 74); } let y = 82; pdf.setTextColor(60, 50, 54); pdf.setFontSize(10); pdf.text("Product", 14, y); pdf.text("SKU", 105, y); pdf.text("Qty", 135, y); pdf.text("Rate", 155, y); pdf.text("Amount", 180, y); y += 5; pdf.line(14, y, 196, y); y += 7; (order.products || [{ product: order.product, sku: order.sku, quantity: order.quantity, unitPrice: order.unitPrice }]).forEach((line) => { pdf.text(line.product.slice(0, 36), 14, y); pdf.text(line.sku, 105, y); pdf.text(String(line.quantity), 135, y); pdf.text(String(line.unitPrice), 155, y); pdf.text(String(Math.round(line.quantity * line.unitPrice)), 180, y); y += 7; }); pdf.line(125, y, 196, y); y += 9; pdf.setFontSize(12); pdf.setTextColor(104, 29, 43); pdf.text(`${isAdvanceOrder ? "Advance" : "Order"} Total: ${money(orderTotal(order))}`, 135, y); pdf.setFontSize(9); pdf.setTextColor(60, 50, 54); pdf.text(`Expected arrival: ${order.eta || "To be confirmed"}`, 14, y + 14); pdf.text("GeeBee — The Party Factory", 14, 285); pdf.save(`${isAdvanceOrder ? "AO" : "PO"}-${order.id}.pdf`); };
const downloadClientOrderFormat = async () => { const { jsPDF } = await import("jspdf"); const pdf = new jsPDF(); const logo = await logoData(); pdf.addImage(logo, "PNG", 14, 8, 42, 42); pdf.setTextColor(104, 29, 43); pdf.setFontSize(20); pdf.text("CLIENT ORDER FORMAT", 196, 22, { align: "right" }); pdf.setTextColor(60, 50, 54); pdf.setFontSize(11); pdf.text("Please send a clear photo or PDF using this format.", 14, 62); const lines = ["Customer / Business name: ______________________________", "Contact person: ___________________   Mobile: ___________________", "Delivery address / City: ________________________________________", "Required delivery date: ________________________________________", "", "SKU ID       Product name                  Quantity       Rate", "_________    _________________________   _________      ________", "_________    _________________________   _________      ________", "_________    _________________________   _________      ________", "", "GSTIN (if applicable): _________________________________________", "Special instructions: __________________________________________"]; let y = 78; lines.forEach((line) => { pdf.text(line, 14, y); y += 10; }); pdf.setFontSize(8); pdf.text("Tip: Use exact GeeBee SKU IDs. The CRM will match catalogue pricing and ask for review before saving.", 14, 280); pdf.save("GeeBee-client-order-format.pdf"); };
const downloadInternalOrderFormat = async () => { const { jsPDF } = await import("jspdf"); const pdf = new jsPDF("p", "mm", "a4"); const logo = await logoData(); pdf.addImage(logo, "PNG", 14, 8, 42, 42); pdf.setFontSize(16); pdf.setTextColor(104, 29, 43); pdf.text("INTERNAL ORDER SHEET", 196, 19, { align: "right" }); pdf.setFontSize(9); pdf.setTextColor(70, 56, 61); pdf.text("Upload a clear photo of this completed sheet into GeeBee CRM.", 196, 26, { align: "right" }); const left = 14, top = 56, width = 182, row = 10; const columns = [0, 42, 82, 115, 150, 182]; pdf.setFillColor(199, 226, 237); pdf.rect(left, top, width, row, "F"); pdf.setFillColor(199, 226, 237); pdf.rect(left, top + row, width, row, "F"); pdf.setTextColor(30, 43, 48); pdf.setFontSize(10); pdf.text("DATE- ____ . ____ . ______", 105, top + 6.5, { align: "center" }); pdf.setFontSize(11); pdf.text("CUSTOMER / BUSINESS NAME", 105, top + 16.5, { align: "center" }); pdf.setFillColor(255, 239, 0); pdf.rect(left, top + row * 2, width, row, "F"); pdf.setFontSize(8.5); ["ITEM", "QUANTITY", "PRICE", "VALUE", "REMARKS"].forEach((label, index) => pdf.text(label, left + (columns[index] + columns[index + 1]) / 2, top + row * 2 + 6.5, { align: "center" })); for (let index = 0; index < 8; index += 1) { const y = top + row * (3 + index); pdf.setDrawColor(75, 75, 75); pdf.rect(left, y, width, row); columns.slice(1, -1).forEach((offset) => pdf.line(left + offset, y, left + offset, y + row)); } const totalY = top + row * 11; pdf.setFillColor(247, 247, 247); pdf.rect(left, totalY, width, row, "F"); pdf.setDrawColor(75, 75, 75); pdf.rect(left, totalY, width, row); columns.slice(1, -1).forEach((offset) => pdf.line(left + offset, totalY, left + offset, totalY + row)); pdf.setFontSize(9); pdf.text("INTERNAL NOTE / KRC", left + 62, totalY + 6.5, { align: "center" }); pdf.text("TOTAL", left + 132, totalY + 6.5, { align: "center" }); pdf.setFontSize(8); pdf.setTextColor(104, 29, 43); pdf.text("Keep Item, Quantity, Price and Value in the same columns. The CRM recognises this fixed GeeBee format.", left, totalY + 20); pdf.save("GeeBee-internal-order-sheet.pdf"); };
function QuotesPanel({ quotes, edit, remove, convert }: { quotes: Quote[]; edit: (quote: Quote) => void; remove: (id: string) => void; convert: (quote: Quote) => void }) {
  return <section className="panel record-panel quotes-panel"><div className="panel-head"><div><span className="overline">QUOTATION MANAGEMENT</span><h2>Customer quotations</h2><p>Build commercial offers, share them, then convert accepted quotes into orders.</p></div></div><div className="table-wrap"><table className="records"><thead><tr><th>QUOTE</th><th>CUSTOMER</th><th>PRODUCTS</th><th>TOTAL</th><th>VALIDITY</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{quotes.map((quote) => <tr key={quote.id}><td><b>{quote.id}</b></td><td>{quote.customer}</td><td>{quote.products.length} line{quote.products.length === 1 ? "" : "s"}</td><td><b>{money(quoteTotal(quote))}</b></td><td>{quote.validity || "—"}</td><td><Pill value={quote.status}/></td><td><div className="quote-actions"><button type="button" onClick={() => downloadQuotePdf(quote)}>PDF</button><button type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`GeeBee quotation ${quote.id} for ${quote.customer}: ${money(quoteTotal(quote))}`)}`, "_blank")}>WhatsApp</button><button type="button" onClick={() => window.location.href = `mailto:?subject=${encodeURIComponent(`GeeBee quotation ${quote.id}`)}&body=${encodeURIComponent(`Quotation ${quote.id} for ${quote.customer}\nTotal: ${money(quoteTotal(quote))}`)}`}>Email</button>{quote.status !== "Converted" && <button className="convert-quote" type="button" onClick={() => window.confirm(`Create an order from ${quote.id}?`) && convert(quote)}>Convert to order</button>}<button className="edit-btn" type="button" onClick={() => edit(quote)}><Pencil size={14}/></button><button className="row-delete" type="button" onClick={() => window.confirm(`Remove ${quote.id}?`) && remove(quote.id)}><Trash2 size={14}/></button></div></td></tr>)}</tbody></table>{!quotes.length && <div className="empty">No quotations yet. Create one from a qualified enquiry.</div>}</div></section>;
}
function AutomationPanel() {
  const templates = [
    ["Order confirmation", "Order #{orderId} confirmed. We will keep you updated."],
    ["Payment reminder", "Invoice #{invoiceId} has an outstanding amount of ₹{amount}."],
    ["Dispatch update", "Your GeeBee order #{orderId} has been dispatched."],
    ["Delivery update", "Your GeeBee order #{orderId} has been delivered."],
    ["Quotation", "Your GeeBee quotation #{quoteId} is ready. Valid until {validity}."],
  ];
  return <section className="panel automation-panel"><div className="panel-head"><div><span className="overline">CUSTOMER COMMUNICATION</span><h2>WhatsApp & notification templates</h2><p>Order and invoice rows now have a prepared WhatsApp action. These templates are the messages that will be automated when the WhatsApp Business connection is added.</p></div></div><div className="automation-grid">{templates.map(([name, message]) => <article key={name}><div className="automation-icon">WA</div><div><b>{name}</b><p>{message}</p><small>Ready for WhatsApp automation</small></div></article>)}</div><div className="automation-next"><b>Next connection: WhatsApp → CRM</b><p>With a WhatsApp Business API connection, an incoming customer message can create a new enquiry automatically, and these messages can be sent without opening WhatsApp Web.</p></div></section>;
}
function TasksDashboard({ tasks, leads, quotes, invoices, orders, toggle, edit }: { tasks: SalesTask[]; leads: Lead[]; quotes: Quote[]; invoices: Invoice[]; orders: Order[]; toggle: (id: string) => void; edit: (task: SalesTask) => void }) {
  const today = new Date().toISOString().slice(0, 10); const dueTasks = tasks.filter((task) => task.dueDate === today); const reminders = [
    ...quotes.filter((quote) => quote.status === "Sent").map((quote) => `Follow up quotation ${quote.id} for ${quote.customer}`),
    ...invoices.filter((invoice) => invoice.status !== "Paid").map((invoice) => `Payment due: ${invoice.id} · ${invoice.client}`),
    ...leads.filter((lead) => ["New", "Contacted", "Requirement Received", "Quotation Sent", "Negotiation"].includes(lead.status)).map((lead) => `Enquiry pending: ${lead.id} · ${lead.company}`),
    ...orders.filter((order) => order.status === "In transit" || order.status === "Customs clearance").map((order) => `Track delivery: ${order.id} · ${order.client}`),
  ].slice(0, 6);
  return <section className="tasks-workspace"><div className="task-day-card"><div><span className="overline">TODAY</span><h2>Tasks & follow-ups</h2><p>Keep each salesperson’s next action visible and accountable.</p></div><b>{dueTasks.filter((task) => task.status === "Open").length} open</b></div><div className="tasks-grid"><section className="panel task-list"><h3>Today’s schedule</h3>{dueTasks.sort((a, b) => a.time.localeCompare(b.time)).map((task) => <article key={task.id} className={task.status === "Done" ? "done" : ""}><time>{task.time}</time><button type="button" className="task-check" onClick={() => toggle(task.id)}>{task.status === "Done" ? "✓" : ""}</button><div><b>{task.title}</b><span>{task.type} · {task.assignee}{task.relatedTo ? ` · ${task.relatedTo}` : ""}</span></div><button className="edit-btn" type="button" onClick={() => edit(task)}><Pencil size={14}/></button></article>)}{!dueTasks.length && <p className="profile-empty">No tasks planned today.</p>}</section><section className="panel reminder-list"><h3>Automatic reminders</h3><p>Generated from CRM records needing attention.</p>{reminders.map((reminder) => <article key={reminder}><span>!</span>{reminder}</article>)}{!reminders.length && <p className="profile-empty">No reminders need attention.</p>}</section></div></section>;
}
function SalesTeamDashboard({ leads, quotes, orders, invoices }: { leads: Lead[]; quotes: Quote[]; orders: Order[]; invoices: Invoice[] }) {
  const businessOrders = orders.filter((order) => !["Advance order", "Backorder", "Cancelled"].includes(order.status)); const totalSales = businessOrders.reduce((total, order) => total + orderTotal(order), 0); const collections = invoices.filter((invoice) => invoice.status === "Paid").reduce((total, invoice) => total + (Number(invoice.amount.replace(/[^0-9.]/g, "")) || 0), 0); const outstanding = invoices.filter((invoice) => invoice.status !== "Paid" && invoice.status !== "Cancelled").reduce((total, invoice) => total + (Number(invoice.amount.replace(/[^0-9.]/g, "")) || 0), 0); const activeLeads = leads.filter((lead) => lead.status !== "Lost"); const conversion = activeLeads.length ? Math.round((businessOrders.length / activeLeads.length) * 100) : 0; const team = [...new Set(leads.map((lead) => lead.salesperson).filter(Boolean))];
  return <section className="panel sales-dashboard"><div className="panel-head"><div><span className="overline">SALES TEAM MANAGEMENT</span><h2>Sales team performance</h2><p>Live pipeline, conversion, sales and collections across {team.length || 0} assigned salesperson{team.length === 1 ? "" : "s"}.</p></div></div><div className="sales-metric-grid">{[["Team members", team.length], ["Leads", activeLeads.length], ["Enquiries", leads.filter((lead) => ["Requirement Received", "Quotation Sent", "Negotiation", "Confirmed"].includes(lead.status)).length], ["Quotes", quotes.length], ["Orders", businessOrders.length], ["Conversion", `${conversion}%`], ["Sales", money(totalSales)], ["Collections", money(collections)], ["Outstanding", money(outstanding)], ["Lost leads", leads.filter((lead) => lead.status === "Lost").length]].map(([label, value]) => <article key={String(label)}><span>{label}</span><b>{value}</b></article>)}</div><div className="sales-detail-strip"><span>Calls and follow-ups are managed in the Follow-ups workspace.</span><span>Metrics update from live leads, quotations, orders and invoices.</span></div></section>;
}
function ReportsDashboard({ report, orders, clients, catalogue, leads, quotes, invoices }: { report: string; orders: Order[]; clients: Client[]; catalogue: CatalogueItem[]; leads: Lead[]; quotes: Quote[]; invoices: Invoice[] }) {
  const amount = (value: string) => Number(value.replace(/[^0-9.]/g, "")) || 0;
  const businessOrders = orders.filter((order) => !["Advance order", "Backorder", "Cancelled"].includes(order.status));
  const sales = businessOrders.reduce((total, order) => total + orderTotal(order), 0);
  const paid = invoices.filter((invoice) => invoice.status === "Paid").reduce((total, invoice) => total + amount(invoice.amount), 0);
  const openInvoices = invoices.filter((invoice) => invoice.status !== "Paid" && invoice.status !== "Cancelled");
  const outstanding = openInvoices.reduce((total, invoice) => total + amount(invoice.amount), 0);
  const lines = businessOrders.flatMap(linesFor);
  const productSales = catalogue.map((product) => ({ product, sold: lines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((total, line) => total + line.quantity, 0), revenue: lines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((total, line) => total + line.quantity * line.unitPrice, 0) })).sort((a, b) => b.sold - a.sold);
  const customerSales = clients.map((client) => ({ client, sales: businessOrders.filter((order) => order.client === client.name).reduce((total, order) => total + orderTotal(order), 0), orders: businessOrders.filter((order) => order.client === client.name).length })).sort((a, b) => b.sales - a.sales);
  const available = catalogue.reduce((total, product) => total + availableStock(product), 0);
  const reserved = catalogue.reduce((total, product) => total + (product.reservedStock || 0), 0);
  const lowStock = catalogue.filter((product) => freeStock(product) <= 0);
  const deadStock = productSales.filter((item) => item.sold === 0 && availableStock(item.product) > 0);
  const titles: Record<string, [string, string]> = {
    "Sales Report": ["Sales performance", "Confirmed customer orders and revenue, calculated from your live order register."],
    "Customer Report": ["Customer performance", "Customer activity, order value and incomplete profiles from live CRM records."],
    "Product Report": ["Product performance", "SKU movement and revenue based on products actually ordered."],
    "Inventory Report": ["Inventory health", "Available quantity and backorder reservations from your live catalogue."],
    "Payment Report": ["Payments & collections", "Invoice collections and outstanding balances from your live billing register."],
  };
  const metrics = report === "Sales Report" ? [["Sales value", money(sales)], ["Confirmed orders", String(businessOrders.length)], ["Average order", money(businessOrders.length ? sales / businessOrders.length : 0)], ["Delivered", String(businessOrders.filter((order) => order.status === "Delivered").length)], ["In progress", String(businessOrders.filter((order) => !["Delivered"].includes(order.status)).length)], ["Quotes pending", String(quotes.filter((quote) => quote.status !== "Converted").length)]]
    : report === "Customer Report" ? [["Customers", String(clients.length)], ["Customers ordering", String(customerSales.filter((item) => item.orders > 0).length)], ["New / incomplete", String(clients.filter((client) => !client.phone || !client.city || !client.gstin).length)], ["Top customer", customerSales[0]?.client.name || "—"], ["Repeat customers", String(customerSales.filter((item) => item.orders > 1).length)], ["Average customer value", money(clients.length ? sales / clients.length : 0)]]
    : report === "Product Report" ? [["Active SKUs", String(catalogue.length)], ["Units ordered", lines.reduce((total, line) => total + line.quantity, 0).toLocaleString("en-IN")], ["Top SKU", productSales[0]?.product.sku || "—"], ["Lowest moving", productSales.at(-1)?.product.sku || "—"], ["Dead stock SKUs", String(deadStock.length)], ["Gross margin", money(productSales.reduce((total, item) => total + item.revenue - item.sold * (item.product.purchasePrice || 0), 0))]]
    : report === "Inventory Report" ? [["Available quantity", available.toLocaleString("en-IN")], ["Reserved for backorders", reserved.toLocaleString("en-IN")], ["Free to order", (available - reserved).toLocaleString("en-IN")], ["No-stock SKUs", String(lowStock.length)], ["Catalogue SKUs", String(catalogue.length)], ["Stock retail value", money(catalogue.reduce((total, product) => total + availableStock(product) * product.unitPrice, 0))]]
    : [["Invoices", String(invoices.length)], ["Collected", money(paid)], ["Outstanding", money(outstanding)], ["Paid invoices", String(invoices.filter((invoice) => invoice.status === "Paid").length)], ["Overdue invoices", String(invoices.filter((invoice) => invoice.status === "Overdue").length)], ["Collection rate", `${Math.round((paid / Math.max(1, paid + outstanding)) * 100)}%`]];
  return <section className="reports-workspace"><div className="report-hero"><div><span className="overline">REPORTS & ANALYTICS</span><h2>{titles[report]?.[0] || "Reports"}</h2><p>{titles[report]?.[1]}</p></div><b>{report === "Inventory Report" ? available.toLocaleString("en-IN") : report === "Payment Report" ? money(outstanding) : money(sales)}<small>{report === "Inventory Report" ? "available units" : report === "Payment Report" ? "outstanding" : "sales value"}</small></b></div><div className="report-metrics">{metrics.map(([label, value]) => <article key={label}><span>{label}</span><b>{value}</b></article>)}</div><div className="report-grid">
    {report === "Sales Report" && <><section className="panel"><h3>Sales funnel</h3><div className="funnel">{[["Leads", leads.length], ["Contacted", leads.filter((lead) => lead.status !== "New" && lead.status !== "Lost").length], ["Quotes", quotes.length], ["Orders", businessOrders.length]].map(([label, value], index) => <div key={String(label)}><span style={{ width: `${Math.max(30, 100 - index * 18)}%` }}><b>{value}</b> {label}</span></div>)}</div></section><section className="panel"><h3>Top customers by sales</h3><div className="report-list">{customerSales.slice(0, 6).map((item) => <article key={item.client.id}><span>{item.client.name}</span><b>{money(item.sales)}</b></article>)}{!customerSales.length && <p className="profile-empty">No customer sales yet.</p>}</div></section></>}
    {report === "Customer Report" && <><section className="panel"><h3>Top customers</h3><div className="report-list">{customerSales.slice(0, 6).map((item) => <article key={item.client.id}><span>{item.client.name} · {item.orders} order{item.orders === 1 ? "" : "s"}</span><b>{money(item.sales)}</b></article>)}</div></section><section className="panel"><h3>Profiles needing completion</h3><div className="report-list">{clients.filter((client) => !client.phone || !client.city || !client.gstin).slice(0, 6).map((client) => <article key={client.id}><span>{client.name}</span><b>{[!client.phone && "phone", !client.city && "city", !client.gstin && "GSTIN"].filter(Boolean).join(", ")}</b></article>)}{!clients.some((client) => !client.phone || !client.city || !client.gstin) && <p className="profile-empty">All customer profiles are complete.</p>}</div></section></>}
    {report === "Product Report" && <><section className="panel"><h3>Top selling SKUs</h3><div className="report-list">{productSales.slice(0, 6).map((item) => <article key={item.product.id}><span>{item.product.sku} · {item.product.name}</span><b>{item.sold.toLocaleString("en-IN")} units</b></article>)}</div></section><section className="panel"><h3>Non-moving stock</h3><div className="report-list">{deadStock.slice(0, 6).map((item) => <article key={item.product.id}><span>{item.product.sku} · {item.product.name}</span><b>{availableStock(item.product).toLocaleString("en-IN")} available</b></article>)}{!deadStock.length && <p className="profile-empty">No non-moving stock detected.</p>}</div></section></>}
    {report === "Inventory Report" && <><section className="panel"><h3>Products needing stock action</h3><div className="report-list">{lowStock.slice(0, 8).map((product) => <article key={product.id}><span>{product.sku} · {product.name}</span><b>{freeStock(product).toLocaleString("en-IN")} free</b></article>)}{!lowStock.length && <p className="profile-empty">All SKUs have free stock available.</p>}</div></section><section className="panel"><h3>Highest reserved SKUs</h3><div className="report-list">{[...catalogue].filter((product) => (product.reservedStock || 0) > 0).sort((a, b) => (b.reservedStock || 0) - (a.reservedStock || 0)).slice(0, 8).map((product) => <article key={product.id}><span>{product.sku} · {product.name}</span><b>{(product.reservedStock || 0).toLocaleString("en-IN")} reserved</b></article>)}{!catalogue.some((product) => (product.reservedStock || 0) > 0) && <p className="profile-empty">No quantity is reserved for backorders.</p>}</div></section></>}
    {report === "Payment Report" && <><section className="panel"><h3>Outstanding invoices</h3><div className="report-list">{openInvoices.sort((a, b) => amount(b.amount) - amount(a.amount)).slice(0, 8).map((invoice) => <article key={invoice.id}><span>{invoice.id} · {invoice.client}</span><b>{invoice.amount}</b></article>)}{!openInvoices.length && <p className="profile-empty">No outstanding invoices.</p>}</div></section><section className="panel"><h3>Recent collections</h3><div className="report-list">{invoices.filter((invoice) => invoice.status === "Paid").slice(0, 8).map((invoice) => <article key={invoice.id}><span>{invoice.id} · {invoice.client}</span><b>{invoice.amount}</b></article>)}{!invoices.some((invoice) => invoice.status === "Paid") && <p className="profile-empty">No paid invoices recorded yet.</p>}</div></section></>}
  </div></section>;
}
function DispatchPlanPanel({ orders, clients, edit, cancel, remove }: { orders: Order[]; clients: Client[]; edit: (order: Order) => void; cancel: (order: Order) => void; remove: (ids: string[]) => void }) {
  return <section className="panel record-panel dispatch-plan-panel"><div className="panel-head"><div><span className="overline">INVENTORY ALLOCATION</span><h2>Dispatch Plan</h2><p>Only orders moved here consume available SKU quantity. Any unavailable quantity is automatically sent to Backorders.</p></div></div><OrderTable orders={orders} edit={edit} cancel={cancel} remove={remove} sendWhatsApp={(order) => { const client = clients.find((item) => item.name === order.client); openWhatsApp(client?.whatsapp || client?.phone || "", `Dear ${order.client}, your GeeBee order #${order.id} is being prepared for dispatch.`); }} /></section>;
}
function BackordersPanel({ orders, clients, edit, cancel, remove }: { orders: Order[]; clients: Client[]; edit: (order: Order) => void; cancel: (order: Order) => void; remove: (ids: string[]) => void }) {
  return <section className="panel record-panel"><div className="panel-head"><div><span className="overline">BACKORDER & ADVANCE ORDER</span><h2>Advance order register</h2><p>Only quantities unavailable in free stock appear here. Each advance order is editable and has its own PDF.</p></div></div><OrderTable orders={orders} edit={edit} cancel={cancel} remove={remove} sendWhatsApp={(order) => { const client = clients.find((item) => item.name === order.client); openWhatsApp(client?.whatsapp || client?.phone || "", `Dear ${order.client}, your GeeBee advance order #${order.id} is pending future dispatch. Advance value: ${money(orderTotal(order))}.`); }} /></section>;
}
function LeadsPanel({ leads, edit, updateStage, remove }: { leads: Lead[]; edit: (lead: Lead) => void; updateStage: (id: string, status: LeadStage) => void; remove: (id: string) => void }) {
  return <section className="panel record-panel leads-panel"><div className="panel-head"><div><span className="overline">LEAD → ENQUIRY → QUOTE → ORDER</span><h2>Sales pipeline</h2><p>Qualify enquiries before creating customer orders.</p></div><div className="lead-stage-summary">{leadStages.slice(0, 7).map((stage) => <span key={stage}><b>{leads.filter((lead) => lead.status === stage).length}</b>{stage}</span>)}</div></div><div className="table-wrap"><table className="records"><thead><tr><th>LEAD</th><th>COMPANY / CONTACT</th><th>SOURCE</th><th>REQUIREMENT</th><th>EXPECTED VALUE</th><th>OWNER</th><th>EXPECTED DATE</th><th>STAGE</th><th/></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><b>{lead.id}</b></td><td><div><b>{lead.company}</b><small className="table-subtext">{lead.contact} · {lead.mobile} · {lead.city}</small></div></td><td>{lead.source}</td><td className="lead-requirement">{lead.requirement}</td><td><b>{lead.expectedValue || "—"}</b></td><td>{lead.salesperson || "—"}</td><td>{lead.expectedDate ? new Date(lead.expectedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td><td><select className="lead-stage-select" value={lead.status} onChange={(event) => updateStage(lead.id, event.target.value as LeadStage)}>{leadStages.map((stage) => <option key={stage}>{stage}</option>)}</select>{lead.status === "Lost" && <small className="table-subtext">{lead.lostReason || "Reason needed"}</small>}</td><td><div className="record-actions"><button className="edit-btn" type="button" onClick={() => edit(lead)} aria-label={`Edit ${lead.id}`}><Pencil size={14}/></button><button className="row-delete" type="button" onClick={() => window.confirm(`Remove ${lead.id}?`) && remove(lead.id)} aria-label={`Remove ${lead.id}`}><Trash2 size={14}/></button></div></td></tr>)}</tbody></table>{!leads.length && <div className="empty">No leads in this view. Create a lead to start the sales pipeline.</div>}</div></section>;
}
function ClientProfile({ client, orders, invoices, catalogue, auditEvents, close, edit }: { client: Client; orders: Order[]; invoices: Invoice[]; catalogue: CatalogueItem[]; auditEvents: AuditEvent[]; close: () => void; edit: () => void }) {
  const clientOrders = orders.filter((order) => order.client === client.name);
  const clientInvoices = invoices.filter((invoice) => invoice.client === client.name);
  const amount = (value: string) => Number(value.replace(/[^0-9.]/g, "")) || 0;
  const billed = clientInvoices.reduce((total, invoice) => total + amount(invoice.amount), 0);
  const paid = clientInvoices.filter((invoice) => invoice.status === "Paid").reduce((total, invoice) => total + amount(invoice.amount), 0);
  const outstanding = clientInvoices.filter((invoice) => invoice.status !== "Paid").reduce((total, invoice) => total + amount(invoice.amount), 0);
  const lastOrder = [...clientOrders].sort((a, b) => new Date(b.eta).getTime() - new Date(a.eta).getTime())[0];
  const averageOrder = clientOrders.length ? clientOrders.reduce((total, order) => total + orderTotal(order), 0) / clientOrders.length : 0;
  const timelineEvents = auditEvents.filter((event) => event.details.toLowerCase().includes(client.name.toLowerCase())).slice(0, 6);
  const rateName = (sku: string) => catalogue.find((item) => item.sku === sku)?.name || "Catalogue product";
  return <Shell close={close}>
    <div className="client-profile-head"><div className="profile-avatar-large">{client.avatar || initials(client.name)}</div><div><span className="overline">CLIENT ACCOUNT</span><h2>{client.name}</h2><p>{client.city} · {client.contact}</p></div><button className="edit-profile-btn" type="button" onClick={edit}><Pencil size={14}/> Edit client</button></div>
    <div className="client-contact-grid"><div><span>Customer ID</span><b>{client.customerId || `GB-C${String(client.id).padStart(4, "0")}`}</b></div><div><span>Primary contact</span><b>{client.contact || "—"}</b></div><div><span>Mobile</span><b>{client.phone || "—"}</b></div><div><span>WhatsApp</span><b>{client.whatsapp || client.phone || "—"}</b></div><div><span>Email</span><b>{client.email || "—"}</b></div><div><span>Customer category</span><b>{client.customerCategory || "—"}</b></div></div>
    <section className="profile-section"><div className="profile-section-head"><h3>Business information</h3><span>{client.customerStatus || "Active"}</span></div><div className="customer-details-grid"><div><span>Business type</span><b>{client.businessType || "—"}</b></div><div><span>GSTIN</span><b>{client.gstin || "—"}</b></div><div><span>PAN</span><b>{client.pan || "—"}</b></div><div><span>State</span><b>{client.state || "—"}</b></div><div><span>City</span><b>{client.city || "—"}</b></div><div><span>Pincode</span><b>{client.pincode || "—"}</b></div><div className="customer-address"><span>Address</span><b>{client.address || "—"}</b></div></div></section>
    <div className="client-stat-grid"><div><span>Total billing</span><b>{money(billed)}</b><small>{clientInvoices.length} invoice{clientInvoices.length === 1 ? "" : "s"}</small></div><div><span>Paid</span><b>{money(paid)}</b><small>{clientInvoices.filter((invoice) => invoice.status === "Paid").length} settled</small></div><div><span>Outstanding</span><b className={outstanding ? "attention" : ""}>{money(outstanding)}</b><small>{clientInvoices.filter((invoice) => invoice.status !== "Paid").length} open invoice{clientInvoices.filter((invoice) => invoice.status !== "Paid").length === 1 ? "" : "s"}</small></div><div><span>Total order value</span><b>{money(clientOrders.reduce((total, order) => total + orderTotal(order), 0))}</b><small>{clientOrders.length} order{clientOrders.length === 1 ? "" : "s"}</small></div></div>
    <section className="profile-section"><div className="profile-section-head"><h3>Commercial information</h3><span>{client.assignedSalesperson || "No salesperson assigned"}</span></div><div className="customer-details-grid"><div><span>Credit limit</span><b>{client.credit || "—"}</b></div><div><span>Payment terms</span><b>{client.paymentTerms || "—"}</b></div><div><span>Average order value</span><b>{money(averageOrder)}</b></div><div><span>Last order date</span><b>{lastOrder ? new Date(lastOrder.eta).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</b></div><div><span>Assigned salesperson</span><b>{client.assignedSalesperson || "—"}</b></div><div><span>Customer status</span><b>{client.customerStatus || "Active"}</b></div></div></section>
    <section className="profile-section"><div className="profile-section-head"><h3>Special SKU rates</h3><span>{client.specialRates?.length || 0} negotiated</span></div>{client.specialRates?.length ? <div className="profile-rates">{client.specialRates.map((rate) => <article key={rate.sku}><div><b>{rate.sku}</b><span>{rateName(rate.sku)}</span></div><strong>{money(rate.rate)}</strong></article>)}</div> : <p className="profile-empty">No special rates set. Standard catalogue pricing applies.</p>}</section>
    <section className="profile-section"><div className="profile-section-head"><h3>Invoices & payment status</h3><span>{clientInvoices.length} records</span></div>{clientInvoices.length ? <div className="profile-list">{clientInvoices.map((invoice) => <article key={invoice.id}><div><b>{invoice.id}</b><span>Order {invoice.order} · Due {invoice.due}</span></div><strong>{invoice.amount}</strong><Pill value={invoice.status}/></article>)}</div> : <p className="profile-empty">No invoices have been recorded for this client.</p>}</section>
    <section className="profile-section"><div className="profile-section-head"><h3>Related orders</h3><span>{clientOrders.length} records</span></div>{clientOrders.length ? <div className="profile-list">{clientOrders.map((order) => <article key={order.id}><div><b>{order.id}</b><span>{order.product}{order.products && order.products.length > 1 ? ` +${order.products.length - 1} products` : ""} · ETA {order.eta}</span></div><strong>{money(orderTotal(order))}</strong><Pill value={order.payment}/></article>)}</div> : <p className="profile-empty">No orders have been recorded for this client.</p>}</section>
    <section className="profile-section"><div className="profile-section-head"><h3>Customer timeline</h3><span>Latest activity</span></div><div className="customer-timeline">{timelineEvents.map((event) => <article key={event.id}><span className="timeline-dot"/><div><b>{event.action}</b><p>{event.actor_email} · {event.module}</p></div><time>{new Date(event.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></article>)}{clientInvoices.slice(0, 3).map((invoice) => <article key={`invoice-${invoice.id}`}><span className="timeline-dot invoice"/><div><b>Invoice {invoice.id} is {invoice.status.toLowerCase()}</b><p>{invoice.amount} · Due {invoice.due}</p></div></article>)}{clientOrders.slice(0, 3).map((order) => <article key={`order-${order.id}`}><span className="timeline-dot order"/><div><b>Order {order.id}</b><p>{order.product} · {money(orderTotal(order))}</p></div></article>)}{!timelineEvents.length && !clientInvoices.length && !clientOrders.length && <p className="profile-empty">Activity will appear here as this customer is engaged.</p>}</div></section>
  </Shell>;
}
function RecoveryPanel({ canManage, session, applyRestore }: { canManage: boolean; session: Session; applyRestore: (data: SavedCrmData) => void }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  if (!canManage) return <section className="panel coming"><div className="modal-mark"><RotateCcw size={22}/></div><h2>Data recovery</h2><p>Only administrators can preview or restore a GeeBee backup.</p></section>;
  const request = async (method: "GET" | "POST") => {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/recovery/google-sheets", { method, headers: { "Authorization": `Bearer ${session.access_token}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) }, body: method === "POST" ? JSON.stringify({ confirm }) : undefined });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Recovery request failed.");
      return result;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Recovery request failed."); return null; }
    finally { setLoading(false); }
  };
  const preview = async () => { const result = await request("GET"); if (result) { setCounts(result.counts); setConfirm(""); setMessage("Backup checked. Review the record counts before restoring."); } };
  const restore = async () => { if (confirm !== "RESTORE GEEBEE") { setMessage("Type RESTORE GEEBEE exactly to enable recovery."); return; } if (!window.confirm("Restore this Google Sheets backup? Your current CRM data will be replaced, but a server-side recovery snapshot will be saved first.")) return; const result = await request("POST"); if (result?.data) { applyRestore(result.data as SavedCrmData); setMessage("Recovery completed. The restored records are now in the CRM."); setConfirm(""); } };
  return <section className="recovery-workspace"><section className="recovery-hero"><div className="recovery-icon"><RotateCcw size={25}/></div><div><span className="overline">ADMIN-ONLY DATA PROTECTION</span><h2>Recover CRM data from Google Sheets</h2><p>Check the fixed GeeBee backup first. A protected server snapshot of current CRM data is saved immediately before recovery.</p></div></section><section className="panel recovery-card"><div><h3>1. Inspect the latest backup</h3><p>Reads your private Google Sheet without changing any live CRM data.</p></div><button className="outline recovery-preview" type="button" onClick={preview} disabled={loading}>{loading ? "Checking backup…" : "Check Google Sheet backup"}</button></section>{counts && <section className="panel recovery-counts"><div><h3>2. Review backup contents</h3><p>Only continue if these counts are what you expect to restore.</p></div><div className="recovery-count-grid">{Object.entries(counts).map(([tab, count]) => <article key={tab}><b>{count}</b><span>{tab}</span></article>)}</div><label>To replace the current CRM with this backup, type <b>RESTORE GEEBEE</b><input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="RESTORE GEEBEE" autoComplete="off"/></label><button className="primary recovery-restore" type="button" onClick={restore} disabled={loading || confirm !== "RESTORE GEEBEE"}>{loading ? "Restoring safely…" : "Create snapshot and restore backup"}</button></section>}{message && <p className={`recovery-message ${message.includes("completed") || message.includes("checked") ? "success" : "error"}`}>{message}</p>}<p className="recovery-note">Recovery restores business records. Product images stored only in a browser are not included in Google Sheets backups.</p></section>;
}

function TeamAccess({ members, workspaceOwnerId, canManage, onChange, onAudit, auditEvents }: { members: WorkspaceMember[]; workspaceOwnerId: string | null; canManage: boolean; onChange: (members: WorkspaceMember[]) => void; onAudit: (action: string, module: string, details: string) => void; auditEvents: AuditEvent[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const [modules, setModules] = useState<CrmModule[]>(["Overview"]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const toggle = (module: CrmModule) => setModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module]);
  const reset = () => { setEmail(""); setRole("employee"); setModules(["Overview"]); setEditingId(null); };
  const save = async () => {
    if (!supabase || !workspaceOwnerId || !email.trim()) return;
    const payload = { workspace_owner_id: workspaceOwnerId, email: email.trim().toLowerCase(), role, modules: role === "admin" ? [...crmModules] : modules };
    const { data, error } = await supabase.from("crm_workspace_members").upsert(payload, { onConflict: "workspace_owner_id,email" }).select("id, workspace_owner_id, email, role, modules").single();
    if (error) { setMessage(error.message); return; }
    onChange([...members.filter((member) => member.id !== editingId && member.email !== payload.email), data as WorkspaceMember]); onAudit(editingId ? "Updated employee access" : "Granted employee access", "Team access", `${payload.email} — ${payload.role}`); setMessage("Access saved."); reset();
  };
  const editMember = (member: WorkspaceMember) => { setEditingId(member.id); setEmail(member.email); setRole(member.role); setModules(member.modules); setMessage(""); };
  const remove = async (member: WorkspaceMember) => { if (!supabase || !window.confirm(`Remove ${member.email} from this workspace?`)) return; const { error } = await supabase.from("crm_workspace_members").delete().eq("id", member.id); if (error) { setMessage(error.message); return; } onChange(members.filter((item) => item.id !== member.id)); onAudit("Removed employee access", "Team access", member.email); };
  if (!canManage) return <section className="panel coming"><div className="modal-mark"><Settings size={22}/></div><h2>Workspace access</h2><p>Your administrator controls which modules you can use.</p></section>;
  return <section className="panel team-access"><div className="panel-head"><div><h2>Team access</h2><p>Invite employees, choose their role and give only the modules they need.</p></div></div><div className="team-grid"><div className="team-form"><b>{editingId ? "Edit employee access" : "Add employee"}</b><label>Employee email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="employee@company.com"/></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value as "admin" | "employee")}><option value="employee">Employee</option><option value="admin">Administrator</option></select></label>{role === "employee" && <div className="module-picker"><span>Allowed modules</span>{crmModules.map((module) => <label key={module}><input type="checkbox" checked={modules.includes(module)} onChange={() => toggle(module)}/>{module}</label>)}</div>}<div className="team-buttons"><button className="primary" type="button" onClick={save}>{editingId ? "Save access" : "Grant access"}</button>{editingId && <button type="button" className="text-btn" onClick={reset}>Cancel</button>}</div>{message && <p className="team-message">{message}</p>}</div><div className="member-list"><b>Current team</b>{!members.length && <p>No employees added yet.</p>}{members.map((member) => <article className="member-card" key={member.id}><div><b>{member.email}</b><small>{member.role === "admin" ? "Administrator — all modules" : member.modules.join(", ")}</small></div><div><button type="button" onClick={() => editMember(member)}>Edit</button><button type="button" onClick={() => remove(member)}>Remove</button></div></article>)}</div></div><div className="audit-trail"><div><h3>Recent activity</h3><p>Only administrators can see this log.</p></div>{!auditEvents.length && <p className="audit-empty">Changes made after this update will appear here.</p>}{auditEvents.map((event) => <article className="audit-event" key={event.id}><div className="audit-dot"/><div><b>{event.action}</b><span>{event.actor_email} · {event.module}{event.details ? ` · ${event.details}` : ""}</span></div><time>{new Date(event.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></article>)}</div></section>;
}
function Invoices({
  invoices,
  clients,
  edit,
  remove,
}: {
  invoices: Invoice[];
  clients: Client[];
  edit: (i: Invoice) => void;
  remove: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const removeSelected = () => { if (selected.length && window.confirm(`Remove ${selected.length} selected invoice${selected.length === 1 ? "" : "s"}?`)) { remove(selected); setSelected([]); } };
  const removeOne = (invoice: Invoice) => { if (window.confirm(`Remove invoice ${invoice.id}?`)) { remove([invoice.id]); setSelected((current) => current.filter((id) => id !== invoice.id)); } };
  return (
    <section className="panel record-panel">
      <div className="panel-head">
        <div>
          <h2>Invoice register</h2>
          <p>Keep invoice status and payment due dates current.</p>
        </div>
      </div>
      <div className="record-bulk-bar"><span>Select invoices to manage them together.</span>{selected.length > 0 && <button type="button" className="bulk-delete" onClick={removeSelected}><Trash2 size={14}/> Remove {selected.length} selected</button>}</div><div className="table-wrap">
        <table className="records">
          <thead>
            <tr>
              <th><input className="record-check" type="checkbox" checked={invoices.length > 0 && invoices.every((invoice) => selected.includes(invoice.id))} onChange={() => setSelected(selected.length === invoices.length ? [] : invoices.map((invoice) => invoice.id))} aria-label="Select all invoices" /></th>
              <th>INVOICE</th>
              <th>CLIENT</th>
              <th>ORDER</th>
              <th>AMOUNT</th>
              <th>DUE DATE</th>
              <th>STATUS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td><input className="record-check" type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} aria-label={`Select ${i.id}`} /></td>
                <td>
                  <b>{i.id}</b>
                </td>
                <td>{i.client}</td>
                <td>{i.order}</td>
                <td>
                  <b>{i.amount}</b>
                </td>
                <td>{i.due}</td>
                <td>
                  <Pill value={i.status} />
                </td>
                <td>
                  <div className="record-actions"><button className="whatsapp-action" type="button" onClick={() => { const client = clients.find((item) => item.name === i.client); openWhatsApp(client?.whatsapp || client?.phone || "", `Dear ${i.client}, Invoice #${i.id} has an outstanding amount of ${i.amount}. Due date: ${i.due}. Please contact GeeBee for any assistance.`); }} aria-label={`Send payment reminder for ${i.id}`}>WA</button><button className="edit-btn" onClick={() => edit(i)} aria-label={`Edit ${i.id}`}><Pencil size={14} /></button><button className="row-delete" type="button" onClick={() => removeOne(i)} aria-label={`Remove ${i.id}`}><Trash2 size={14}/></button></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Shell({
  children,
  close,
}: {
  children: React.ReactNode;
  close: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="close" onClick={close}>
          <X size={19} />
        </button>
        {children}
      </form>
    </div>
  );
}
function LegacyOrderModal({
  order,
  clients,
  close,
  save,
}: {
  order: Order | null;
  clients: Client[];
  close: () => void;
  save: (o: Order) => void;
}) {
  const initial = order || {
    id: "GB-24092",
    client: "",
    city: "",
    product: "",
    sku: "",
    quantity: 0,
    unitPrice: 0,
    eta: "",
    status: "Confirmed",
    payment: "Partial",
    avatar: "",
  };
  const [f, setF] = useState(initial),
    set = (k: keyof Order, v: string | number) => setF({ ...f, [k]: v }),
    setClient = (name: string) => {
      const c = clients.find((x) => x.name === name);
      setF({
        ...f,
        client: name,
        city: c?.city || "",
        avatar: c?.avatar || initials(name),
      });
    };
  return (
    <Shell close={close}>
      <div className="modal-mark">
        <PackageCheck size={22} />
      </div>
      <h2>{order ? "Edit order" : "Create a new order"}</h2>
      <p>Product, SKU, quantity, pricing and status are all editable.</p>
      <label>
        Client
        <select
          value={f.client}
          onChange={(e) => setClient(e.target.value)}
          required
        >
          <option value="" disabled>
            Select a client
          </option>
          {clients.map((c) => (
            <option key={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label>
          Product name
          <input
            value={f.product}
            onChange={(e) => set("product", e.target.value)}
            required
          />
        </label>
        <label>
          SKU ID
          <input
            value={f.sku}
            onChange={(e) => set("sku", e.target.value)}
            required
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Quantity
          <input
            type="number"
            min="1"
            value={f.quantity || ""}
            onChange={(e) => set("quantity", Number(e.target.value))}
            required
          />
        </label>
        <label>
          Unit price (₹)
          <input
            type="number"
            min="0"
            value={f.unitPrice || ""}
            onChange={(e) => set("unitPrice", Number(e.target.value))}
            required
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Expected arrival
          <input
            type="date"
            value={f.eta}
            onChange={(e) => set("eta", e.target.value)}
            required
          />
        </label>
        <label>
          Order value
          <input value={money(f.quantity * f.unitPrice)} readOnly />
        </label>
      </div>
      <div className="form-row">
        <label>
          Status
          <select
            value={f.status}
            onChange={(e) => set("status", e.target.value)}
          >
            {[
              "Confirmed",
              "Production",
              "In transit",
              "Customs clearance",
              "Delivered",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Payment status
          <select
            value={f.payment}
            onChange={(e) => set("payment", e.target.value)}
          >
            {["Partial", "Paid", "Overdue"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="primary modal-submit"
        type="button"
        onClick={() => save(f)}
      >
        Save order
      </button>
    </Shell>
  );
}
function LegacyMultiProductOrderModal({ order, clients, close, save }: { order: Order | null; clients: Client[]; close: () => void; save: (o: Order) => void }) {
  const base = order || { id: "GB-24092", client: "", city: "", eta: "", status: "Confirmed", payment: "Partial", transporter: "", avatar: "" };
  const [f, setF] = useState(base);
  const [products, setProducts] = useState<ProductLine[]>(order?.products || (order ? [{ product: order.product, sku: order.sku, quantity: order.quantity, unitPrice: order.unitPrice }] : [{ product: "", sku: "", quantity: 0, unitPrice: 0 }]));
  const total = products.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const updateProduct = (index: number, key: keyof ProductLine, value: string | number) => setProducts(products.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const selectClient = (name: string) => { const client = clients.find((item) => item.name === name); setF({ ...f, client: name, city: client?.city || "", avatar: client?.avatar || initials(name) }); };
  const saveOrder = () => { const first = products[0]; save({ ...f, product: first.product, sku: first.sku, quantity: first.quantity, unitPrice: first.unitPrice, products }); };
  return <Shell close={close}><div className="modal-mark"><PackageCheck size={22} /></div><h2>{order ? "Edit order" : "Create a new order"}</h2><p>Add as many product lines as this order needs.</p><label>Client<select value={f.client} onChange={(e) => selectClient(e.target.value)} required><option value="" disabled>Select a client</option>{clients.map((client) => <option key={client.id}>{client.name}</option>)}</select></label><div className="product-lines"><div className="line-heading"><b>Product lines</b><span>{products.length} item{products.length !== 1 ? "s" : ""}</span></div>{products.map((item, index) => <div className="product-line" key={index}><div className="line-number">{index + 1}</div><div className="line-fields"><input aria-label="Product name" value={item.product} onChange={(e) => updateProduct(index, "product", e.target.value)} placeholder="Product name" required /><input aria-label="SKU ID" value={item.sku} onChange={(e) => updateProduct(index, "sku", e.target.value)} placeholder="SKU ID" required /><input aria-label="Quantity" type="number" min="1" value={item.quantity || ""} onChange={(e) => updateProduct(index, "quantity", Number(e.target.value))} placeholder="Qty" required /><input aria-label="Unit price" type="number" min="0" value={item.unitPrice || ""} onChange={(e) => updateProduct(index, "unitPrice", Number(e.target.value))} placeholder="Price ₹" required /></div><b className="line-total">{money(item.quantity * item.unitPrice)}</b>{products.length > 1 && <button type="button" className="remove-line" onClick={() => setProducts(products.filter((_, i) => i !== index))}>×</button>}</div>)}<button type="button" className="add-line" onClick={() => setProducts([...products, { product: "", sku: "", quantity: 0, unitPrice: 0 }])}><Plus size={15} /> Add another product</button></div><div className="order-total"><span>Order total</span><b>{money(total)}</b></div><div className="form-row"><label>Expected arrival<input type="date" value={f.eta} onChange={(e) => setF({ ...f, eta: e.target.value })} required /></label><label>Status<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{["Confirmed", "Production", "In transit", "Customs clearance", "Delivered"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label>Payment status<select value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value })}>{["Partial", "Paid", "Overdue"].map((value) => <option key={value}>{value}</option>)}</select></label><button className="primary modal-submit" type="button" onClick={saveOrder}>Save order</button></Shell>;
}
function OrderModal({ order, clients, catalogue, transporters, createClient, close, save }: { order: Order | null; clients: Client[]; catalogue: CatalogueItem[]; transporters: Transporter[]; createClient: (client: Client) => void; close: () => void; save: (o: Order) => void }) {
  const base = order || { id: nextOrderNumber(), client: "", city: "", eta: "", status: "Confirmed", payment: "Partial", transporter: "", avatar: "" };
  const [f, setF] = useState(base);
  const [products, setProducts] = useState<ProductLine[]>(order?.products || (order ? [{ product: order.product, sku: order.sku, quantity: order.quantity, unitPrice: order.unitPrice }] : [{ product: "", sku: "", quantity: 0, unitPrice: 0 }]));
  const [preview, setPreview] = useState("");
  const [scanState, setScanState] = useState<"idle" | "scanning" | "ready" | "error">("idle");
  const [scanNote, setScanNote] = useState("");
  const total = products.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const specialRate = (clientName: string, sku: string) => clients.find((client) => client.name === clientName)?.specialRates?.find((item) => item.sku.replaceAll("-", "").toLowerCase() === sku.replaceAll("-", "").toLowerCase())?.rate;
  const updateProduct = (index: number, key: keyof ProductLine, value: string | number) => setProducts(products.map((item, i) => {
    if (i !== index) return item;
    const updated = { ...item, [key]: value };
    if (key !== "sku" && key !== "product") return updated;
    const catalogueProduct = catalogue.find((product) => key === "sku" ? skuKey(product.sku) === skuKey(String(value)) : `${catalogueName(product)} · ${product.sku}`.toLowerCase() === String(value).trim().toLowerCase() || catalogueName(product).trim().toLowerCase() === String(value).trim().toLowerCase());
    const selectedSku = catalogueProduct?.sku || (key === "sku" ? String(value) : updated.sku);
    const rate = specialRate(f.client, selectedSku) ?? catalogueProduct?.unitPrice;
    return { ...updated, sku: selectedSku, product: catalogueProduct ? `${catalogueName(catalogueProduct)} · ${catalogueProduct.sku}` : updated.product, unitPrice: rate ?? updated.unitPrice };
  }));
  const selectClient = (name: string) => { const client = clients.find((item) => item.name === name); setF({ ...f, client: name, city: client?.city || "", avatar: client?.avatar || initials(name) }); setProducts((current) => current.map((item) => ({ ...item, unitPrice: specialRate(name, item.sku) ?? item.unitPrice }))); };
  useEffect(() => {
    const productLines = document.querySelector(".product-lines");
    if (!productLines?.parentElement) return;
    const label = document.createElement("label"); label.className = "order-transporter-field"; label.textContent = "Transporter";
    const selector = document.createElement("select"); selector.setAttribute("aria-label", "Transporter"); selector.append(new Option("Select transporter (optional)", ""));
    transporters.forEach((item) => selector.append(new Option(`${item.name}${item.city ? ` · ${item.city}` : ""}`, item.name)));
    if (f.transporter && !transporters.some((item) => skuKey(item.name) === skuKey(f.transporter || ""))) selector.append(new Option(`${f.transporter} — not yet in transporters`, f.transporter));
    selector.value = f.transporter || "";
    selector.onchange = () => setF((current) => ({ ...current, transporter: selector.value }));
    label.append(selector); productLines.parentElement.insertBefore(label, productLines);
    return () => label.remove();
  }, [transporters, f.transporter]);
  useEffect(() => { const capture = document.querySelector(".document-capture"); if (!capture) return; const button = document.createElement("button"); button.type = "button"; button.className = "outline"; button.textContent = "Download internal order sheet"; button.onclick = downloadInternalOrderFormat; capture.append(button); return () => button.remove(); }, []);
  useEffect(() => {
    const capture = document.querySelector(".document-capture");
    if (!capture) return;
    const label = document.createElement("label"); label.className = "upload-button"; label.innerHTML = "<span>Upload multiple order photos</span>";
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/*,application/pdf"; input.multiple = true;
    input.onchange = () => scanDocuments(input.files);
    label.append(input); capture.append(label);
    return () => label.remove();
  }, [catalogue, clients, transporters]);
  useEffect(() => {
    const list = document.createElement("datalist"); list.id = "order-product-search";
    catalogue.forEach((product) => { const option = document.createElement("option"); option.value = `${catalogueName(product)} · ${product.sku}`; option.label = money(specialRate(f.client, product.sku) ?? product.unitPrice); list.append(option); });
    document.body.append(list);
    const productInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[aria-label="Product name"]'));
    const skuInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[aria-label="SKU ID"]'));
    productInputs.forEach((input) => { input.setAttribute("list", list.id); input.setAttribute("placeholder", "Type product name to search catalogue"); });
    skuInputs.forEach((input) => { input.style.display = "none"; input.required = false; });
    return () => { productInputs.forEach((input) => input.removeAttribute("list")); skuInputs.forEach((input) => { input.style.display = ""; input.required = true; }); list.remove(); };
  }, [catalogue, f.client]);
  const scanDocument = async (file: File, append = false) => {
    setPreview((file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) ? "" : URL.createObjectURL(file)); setScanState("scanning"); setScanNote("Reading document and finding product lines…");
    try {
      const recognisedSheet = await readInternalOrderSheetImage(file);
      const rawText = recognisedSheet ? "" : await readDocumentText(file);
      const internalSheet = recognisedSheet || parseInternalOrderSheet(rawText);
      if (internalSheet) {
        let matchedClient = clients.find((client) => client.name.trim().toLowerCase() === internalSheet.client.trim().toLowerCase());
        let createdClient = false;
        if (!matchedClient && internalSheet.client.trim()) {
          matchedClient = { id: Date.now(), customerId: `GB-C${String(Date.now()).slice(-4)}`, name: internalSheet.client.trim(), city: "", contact: "", phone: "", credit: "", customerStatus: "Prospect", avatar: initials(internalSheet.client), specialRates: [] };
          createClient(matchedClient);
          createdClient = true;
        }
        const clientName = matchedClient?.name || internalSheet.client;
        const matchedTransporter = transporters.find((item) => skuKey(item.name) === skuKey(internalSheet.transporter || ""));
        const transporterName = matchedTransporter?.name || internalSheet.transporter || "";
        setF((current) => ({ ...current, client: clientName || current.client, city: matchedClient?.city || current.city, eta: internalSheet.eta || current.eta, transporter: transporterName || current.transporter || "", avatar: matchedClient?.avatar || initials(clientName || current.client) }));
        const importedLines = internalSheet.products.map((line) => {
          const exactMatch = catalogue.find((item) => skuKey(item.sku) === skuKey(line.sku));
          const partialMatches = exactMatch ? [] : catalogue.filter((item) => skuKey(item.sku).startsWith(skuKey(line.sku)) || skuKey(line.sku).startsWith(skuKey(item.sku)));
          const catalogueMatch = exactMatch || (partialMatches.length === 1 ? partialMatches[0] : undefined);
          // A readable sheet price always wins. Catalogue price is only a
          // safety fallback when the source image contains no numeric price.
          return { product: catalogueMatch ? `${catalogueName(catalogueMatch)} · ${catalogueMatch.sku}` : line.product || `Product ${line.sku}`, sku: catalogueMatch?.sku || line.sku, quantity: line.quantity, unitPrice: line.unitPrice || catalogueMatch?.unitPrice || 0 };
        });
        setProducts((current) => append ? [...current.filter((line) => line.sku || line.product || line.quantity), ...importedLines] : importedLines);
        setScanState("ready"); setScanNote(`GeeBee internal order sheet recognised: ${internalSheet.products.length} product line${internalSheet.products.length === 1 ? "" : "s"} added${clientName ? ` for ${clientName}` : ""}${transporterName ? ` with transporter ${transporterName}` : ""}.${createdClient ? " A new incomplete client profile was created—please complete it in Clients." : ""} Please review, then save the new order.${internalSheet.note ? ` Note: ${internalSheet.note}` : ""}`);
        return;
      }
      const text = rawText.replace(/\s+/g, " ");
      const matchedClient = clients.find((client) => text.toLowerCase().includes(client.name.toLowerCase()));
      if (matchedClient) selectClient(matchedClient.name);
      const sku = text.match(/(?:sku|item\s*code|code)\s*[:#-]?\s*([A-Z]{1,4}[- ]?\d{2,8})/i)?.[1]?.replace(" ", "-") || "";
      const quantity = Number(text.match(/(?:qty|quantity)\s*[:x-]?\s*(\d+)/i)?.[1] || 0);
      const unitPrice = Number(text.match(/(?:unit\s*price|rate|price)\s*[:₹Rs.-]?\s*([\d,]+)/i)?.[1]?.replaceAll(",", "") || 0);
      if (!sku || !quantity) throw new Error("This image did not contain a readable order row. Please use a sharp screenshot of the item, quantity and price columns.");
      const name = text.match(/(?:product|description|item)\s*[:#-]?\s*([A-Za-z][A-Za-z0-9 /&.-]{2,50})/i)?.[1]?.trim() || file.name.replace(/\.[^.]+$/, "").replaceAll(/[-_]/g, " ");
      const catalogueMatch = catalogue.find((item) => item.sku.replaceAll("-", "").toLowerCase() === sku.replaceAll("-", "").toLowerCase());
      const importedLine = { product: catalogueMatch?.name || name, sku: catalogueMatch?.sku || sku, quantity, unitPrice: specialRate(matchedClient?.name || f.client, catalogueMatch?.sku || sku) ?? catalogueMatch?.unitPrice ?? unitPrice };
      setProducts((current) => append ? [...current.filter((line) => line.sku || line.product || line.quantity), importedLine] : [importedLine]);
      setScanState("ready"); setScanNote(catalogueMatch ? `Matched ${catalogueMatch.sku} from your catalogue. Please confirm quantity.` : "Details were extracted. Please check the fields below before saving.");
    } catch { setScanState("error"); setScanNote("We could not read this image. You can still enter the order manually."); }
  };
  const scanDocuments = async (files: FileList | null) => {
    if (!files?.length) return;
    const uploads = Array.from(files);
    for (let index = 0; index < uploads.length; index += 1) await scanDocument(uploads[index], index > 0);
    if (uploads.length > 1) setScanNote(`${uploads.length} order images/documents processed. Review the combined product lines before saving.`);
  };
  const saveOrder = () => { const first = products[0]; save({ ...f, product: first.product, sku: first.sku, quantity: first.quantity, unitPrice: first.unitPrice, products }); };
  return <Shell close={close}><div className="order-modal-head"><div className="modal-mark"><PackageCheck size={22} /></div><div><span className="overline">ORDER WORKSPACE</span><h2>{order ? "Edit order" : "Create an order"}</h2><p>Capture a document or enter product lines yourself.</p></div></div><div className="document-capture"><div className="capture-copy"><div className="capture-icon"><ScanText size={19}/></div><div><b>Smart document capture</b><p>Upload a supplier PO, invoice, product-list image, or PDF.</p></div></div><label className="upload-button"><ImagePlus size={15}/><span>{scanState === "scanning" ? "Reading document…" : "Upload image or PDF"}</span><input type="file" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && scanDocument(e.target.files[0])} disabled={scanState === "scanning"}/></label>{preview && <img className="document-preview" src={preview} alt="Uploaded document preview"/>}{scanState !== "idle" && <div className={`scan-feedback ${scanState}`}><ScanText size={15}/>{scanNote}</div>}</div><div className="modal-section-title">Order details</div><label>Client<select value={f.client} onChange={(e) => selectClient(e.target.value)} required><option value="" disabled>Select a client</option>{clients.map((client) => <option key={client.id}>{client.name}</option>)}</select></label><div className="product-lines"><div className="line-heading"><b>Product lines</b><span>{products.length} item{products.length !== 1 ? "s" : ""}</span></div>{products.map((item, index) => <div className="product-line" key={index}><div className="line-number">{index + 1}</div><div className="line-fields"><input aria-label="Product name" value={item.product} onChange={(e) => updateProduct(index, "product", e.target.value)} placeholder="Product name" required /><input aria-label="SKU ID" value={item.sku} onChange={(e) => updateProduct(index, "sku", e.target.value)} placeholder="SKU ID" required /><input aria-label="Quantity" type="number" min="1" value={item.quantity || ""} onChange={(e) => updateProduct(index, "quantity", Number(e.target.value))} placeholder="Qty" required /><input aria-label="Unit price" type="number" min="0" value={item.unitPrice || ""} onChange={(e) => updateProduct(index, "unitPrice", Number(e.target.value))} placeholder="Price ₹" required /></div><b className="line-total">{money(item.quantity * item.unitPrice)}</b>{products.length > 1 && <button type="button" className="remove-line" onClick={() => setProducts(products.filter((_, i) => i !== index))}>×</button>}</div>)}<button type="button" className="add-line" onClick={() => setProducts([...products, { product: "", sku: "", quantity: 0, unitPrice: 0 }])}><Plus size={15} /> Add product line</button></div><div className="order-total"><span>Order total</span><b>{money(total)}</b></div><div className="form-row"><label>Expected arrival<input type="date" value={f.eta} onChange={(e) => setF({ ...f, eta: e.target.value })} required /></label><label>Status<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{["Confirmed", "Production", "In transit", "Customs clearance", "Delivered", "Backorder", "Advance order"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label>Payment status<select value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value })}>{["Partial", "Paid", "Overdue"].map((value) => <option key={value}>{value}</option>)}</select></label><button className="primary modal-submit" type="button" onClick={saveOrder}>Save order</button></Shell>;
}
function LegacyCataloguePanel({ items, edit }: { items: CatalogueItem[]; edit: (item: CatalogueItem) => void }) {
  return <section className="catalogue-page"><section className="catalogue-hero"><div><span className="overline">YOUR PRODUCT LIBRARY</span><h2>Catalogue makes order capture reliable.</h2><p>Add your product images and SKU IDs once. Uploaded order images can then match the SKU to your approved product name and price.</p></div><div className="catalogue-stat"><b>{items.length}</b><span>catalogued SKUs</span></div></section><section className="catalogue-grid">{items.map((item) => <article className="catalogue-card" key={item.id}><div className="catalogue-image">{item.image ? <img src={item.image} alt={item.name}/> : <PackageCheck size={27}/>}<span>{item.category}</span></div><div className="catalogue-info"><small>{item.sku}</small><h3>{item.name}</h3><p>{money(item.unitPrice)} / pc</p><button className="edit-product" onClick={() => edit(item)}><Pencil size={13}/> Edit product</button></div></article>)}{!items.length && <div className="empty">No catalogue products match your search.</div>}</section></section>;
}
function CataloguePanel({ items, edit, addDrafts, setAllOpeningStock, remove }: { items: CatalogueItem[]; edit: (item: CatalogueItem) => void; addDrafts: (drafts: CatalogueItem[]) => void; setAllOpeningStock: () => void; remove: (ids: number[]) => void }) {
  const [scanState, setScanState] = useState<"idle" | "scanning" | "ready" | "error">("idle");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const toggleSelected = (id: number) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleAll = () => setSelected((current) => current.length === items.length ? [] : items.map((item) => item.id));
  useEffect(() => {
    const toolbar = document.querySelector(".catalogue-toolbar-actions");
    if (!toolbar) return;
    const button = document.createElement("button"); button.type = "button"; button.className = "bulk-delete"; button.textContent = selected.length === items.length && items.length ? "Clear selection" : `Select all ${items.length} products`;
    button.onclick = toggleAll; toolbar.prepend(button);
    return () => button.remove();
  }, [items, selected]);
  const removeSelected = () => {
    if (!selected.length || !window.confirm(`Remove ${selected.length} selected product${selected.length === 1 ? "" : "s"} from the catalogue?`)) return;
    remove(selected); setSelected([]);
  };
  const removeOne = (item: CatalogueItem) => {
    if (!window.confirm(`Remove ${item.sku} — ${item.name} from the catalogue?`)) return;
    remove([item.id]); setSelected((current) => current.filter((id) => id !== item.id));
  };
  const importCatalogueImage = async (file?: File) => {
    if (!file) return;
    setScanState("scanning"); setNotice("Reading SKU IDs from your catalogue document…");
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        if (file.size > 25 * 1024 * 1024) throw new Error("This PDF is over the 25 MB catalogue limit. Please split it into smaller files.");
        let response: Response;
        if (file.size > 3 * 1024 * 1024) {
          if (!supabase) throw new Error("Cloud upload is not configured yet.");
          const path = `pdf-imports/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9._-]/gi, "-")}`;
          const { error: uploadError } = await supabase.storage.from("catalogue-imports").upload(path, file, { contentType: "application/pdf", upsert: false });
          if (uploadError) throw new Error("Large PDF upload is not ready yet. Please run the latest Supabase setup script, then try again.");
          const { data, error: linkError } = await supabase.storage.from("catalogue-imports").createSignedUrl(path, 600);
          if (linkError || !data?.signedUrl) throw new Error("A secure link for this PDF could not be created.");
          response = await fetch("/api/pdf-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceUrl: data.signedUrl }) });
        } else { const form = new FormData(); form.append("file", file); response = await fetch("/api/pdf-text", { method: "POST", body: form }); }
        const raw = await response.text();
        let result: { products?: Omit<CatalogueItem, "id">[]; error?: string } = {};
        try { result = JSON.parse(raw); } catch { throw new Error(response.status === 413 ? "This PDF is over the online upload limit. Please run the Supabase setup script for large-file imports." : "The PDF service returned an unexpected response. Please try again."); }
        if (!response.ok) throw new Error(result.error || "The catalogue PDF could not be read.");
        if (!result.products?.length) throw new Error("No product records were found in this catalogue PDF.");
        addDrafts(result.products.map((product: Omit<CatalogueItem, "id">, index: number) => ({ ...product, id: Date.now() + index })));
        setScanState("ready"); setNotice(`${result.products.length} products imported with descriptions, carton quantities, and prices. Add or replace product images from each card.`);
        return;
      }
      const text = await readDocumentText(file);
      const skus = [...new Set((text.toUpperCase().match(/\b[A-Z]{1,4}[- ]?\d{2,8}\b/g) || []).map((sku) => sku.replace(" ", "-")))];
      if (!skus.length) throw new Error("No SKUs found");
      const image = (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) ? "" : await fileToDataUrl(file);
      addDrafts(skus.map((sku, index) => ({ id: Date.now() + index, sku, name: `New product — ${sku}`, description: "", cartonQty: "", unitPrice: 0, category: "Uncategorised", image })));
      setScanState("ready"); setNotice(`${skus.length} SKU draft${skus.length === 1 ? "" : "s"} added. Open each card to add its product name and price.`);
    } catch (error) { setScanState("error"); setNotice(error instanceof Error ? error.message : "The catalogue file could not be read."); }
  };
  return <section className="catalogue-page"><div className="catalogue-top"><div><span className="overline">PRODUCT LIBRARY</span><h2>Your catalogue, ready for order matching.</h2><p>Upload individual product photos, or scan a complete catalogue image or PDF to create SKU drafts quickly.</p></div><div className="catalogue-count"><b>{items.length}</b><span>active SKUs</span></div></div><section className="catalogue-actions"><label className="catalogue-scan"><div className="scan-orb"><ScanText size={20}/></div><div><b>Scan catalogue image or PDF</b><p>Read SKU IDs from a complete catalogue page.</p></div><span className="scan-cta">Upload file <ImagePlus size={14}/></span><input type="file" accept="image/*,application/pdf" onChange={(e) => importCatalogueImage(e.target.files?.[0])} disabled={scanState === "scanning"}/></label><div className="catalogue-tip"><b>How it works</b><p>Catalogue SKUs are matched automatically when you scan an incoming order image or PDF.</p></div></section>{scanState !== "idle" && <div className={`catalogue-notice ${scanState}`}><ScanText size={16}/>{notice}</div>}<div className="catalogue-toolbar"><div><h3>Products</h3><span>{items.length} shown</span></div><div className="catalogue-toolbar-actions"><button type="button" className="bulk-delete" onClick={setAllOpeningStock}>Set all available quantity: 10,000</button>{selected.length > 0 && <button type="button" className="bulk-delete" onClick={removeSelected}><Trash2 size={14}/> Remove {selected.length} selected</button>}<span>Click a product to edit it, or select products to remove.</span></div></div><section className="catalogue-grid">{items.map((item) => <article className="catalogue-card" key={item.id} onClick={() => edit(item)}><div className="catalogue-image">{item.image ? <img src={item.image} alt={catalogueName(item)} onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <PackageCheck size={27}/>}<span>{item.category || "Uncategorised"}</span></div><div className="catalogue-info"><div className="catalogue-card-heading"><label className="catalogue-select" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelected(item.id)} aria-label={`Select ${catalogueName(item)}`}/><span>Select</span></label><small title={catalogueSku(item)}>{catalogueSku(item)}</small></div><h3 title={catalogueName(item)}>{catalogueName(item)}</h3><p>{item.unitPrice ? `${money(item.unitPrice)} / pc` : "Price to be added"}</p><div className="catalogue-card-actions"><button type="button" className="edit-product"><Pencil size={13}/> Edit product</button><button type="button" className="delete-product" onClick={(event) => { event.stopPropagation(); removeOne(item); }}><Trash2 size={13}/> Remove</button></div></div></article>)}{!items.length && <div className="empty">No catalogue products match your search.</div>}</section></section>;
}
function CatalogueModal({ item, close, save }: { item: CatalogueItem | null; close: () => void; save: (item: CatalogueItem) => void }) {
  const initial: CatalogueItem = item || { id: Date.now(), name: "", sku: "", unitPrice: 0, category: "Party Props", image: "", description: "", cartonQty: "", subCategory: "", brand: "GeeBee", unit: "Piece", packSize: "", moq: 0, purchasePrice: 0, wholesalePrice: 0, distributorPrice: 0, gst: 18, barcode: "", weight: "", dimensions: "", supplier: "", countryOfOrigin: "", availableQuantity: 0, reservedStock: 0 };
  const [form, setForm] = useState<CatalogueItem>(initial); const [preview, setPreview] = useState(initial.image);
  const update = (key: keyof CatalogueItem, value: string | number) => setForm({ ...form, [key]: value });
  const chooseImage = async (file?: File) => { if (!file) return; const image = await fileToDataUrl(file); setPreview(image); setForm({ ...form, image }); };
  const stockAvailable = availableStock(form); const stockFree = freeStock(form);
  return <Shell close={close}><div className="order-modal-head"><div className="modal-mark"><PackageCheck size={22}/></div><div><span className="overline">PRODUCT & SKU MASTER</span><h2>{item ? "Edit product" : "Add a product"}</h2><p>Keep only the product, packaging, price and live inventory details needed by GeeBee.</p></div></div><label className="catalogue-upload">{preview ? <img src={preview} alt="Product preview"/> : <><ImagePlus size={23}/><b>Upload product image</b><span>PNG or JPG</span></>}<input type="file" accept="image/*" onChange={(e) => chooseImage(e.target.files?.[0])}/></label><div className="modal-section-title">Product details</div><div className="form-row"><label>Product name<input value={form.name} onChange={(e) => update("name", e.target.value)} required/></label><label>SKU<input value={form.sku} onChange={(e) => update("sku", e.target.value.toUpperCase())} placeholder="GB-BAL-001" required/></label></div><div className="form-row"><label>Category<input value={form.category} onChange={(e) => update("category", e.target.value)}/></label><label>Sub-category<input value={form.subCategory || ""} onChange={(e) => update("subCategory", e.target.value)}/></label></div><div className="form-row"><label>Brand<input value={form.brand || ""} onChange={(e) => update("brand", e.target.value)}/></label><label>Unit<select value={form.unit || "Piece"} onChange={(e) => update("unit", e.target.value)}>{["Piece", "Set", "Box", "Carton", "Kg", "Pair"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label>Description<textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Product details"/></label><div className="form-row"><label>Inner qty<input value={form.innerQty || ""} onChange={(e) => update("innerQty", e.target.value)} placeholder="e.g. 12"/></label><label>Outer qty<input value={form.outerQty || form.cartonQty || ""} onChange={(e) => { update("outerQty", e.target.value); update("cartonQty", e.target.value); }} placeholder="e.g. 144"/></label></div><div className="form-row"><label>Weight<input value={form.weight || ""} onChange={(e) => update("weight", e.target.value)} placeholder="e.g. 250 g"/></label><label>Dimensions<input value={form.dimensions || ""} onChange={(e) => update("dimensions", e.target.value)} placeholder="L × W × H"/></label></div><div className="modal-section-title">Pricing</div><div className="form-row"><label>Purchase price (₹)<input type="number" min="0" value={form.purchasePrice || ""} onChange={(e) => update("purchasePrice", Number(e.target.value))}/></label><label>Selling price (₹)<input type="number" min="0" value={form.unitPrice || ""} onChange={(e) => update("unitPrice", Number(e.target.value))} required/></label></div><div className="modal-section-title">Inventory</div><div className="stock-input-grid"><label>Available quantity<input type="number" min="0" value={form.availableQuantity ?? ""} onChange={(e) => update("availableQuantity", Number(e.target.value))}/></label><label>Reserved stock<input type="number" min="0" value={form.reservedStock || ""} onChange={(e) => update("reservedStock", Number(e.target.value))}/></label></div><div className="stock-calculation"><span>Available quantity <b>{stockAvailable.toLocaleString("en-IN")}</b></span><span>Free to order <b>{stockFree.toLocaleString("en-IN")}</b></span></div><button className="primary modal-submit" type="button" onClick={() => save(form)}>Save product</button></Shell>;
  return <Shell close={close}><div className="order-modal-head"><div className="modal-mark"><PackageCheck size={22}/></div><div><span className="overline">PRODUCT & SKU MASTER</span><h2>{item ? "Edit product" : "Add a product"}</h2><p>Set master data, prices and stock controls for this SKU.</p></div></div><label className="catalogue-upload">{preview ? <img src={preview} alt="Product preview"/> : <><ImagePlus size={23}/><b>Upload product image</b><span>PNG or JPG</span></>}<input type="file" accept="image/*" onChange={(e) => chooseImage(e.target.files?.[0])}/></label><div className="modal-section-title">Product master</div><div className="form-row"><label>Product name<input value={form.name} onChange={(e) => update("name", e.target.value)} required/></label><label>SKU<input value={form.sku} onChange={(e) => update("sku", e.target.value.toUpperCase())} placeholder="GB-BAL-001" required/></label></div><div className="form-row"><label>Category<input value={form.category} onChange={(e) => update("category", e.target.value)}/></label><label>Sub-category<input value={form.subCategory || ""} onChange={(e) => update("subCategory", e.target.value)}/></label></div><div className="form-row"><label>Brand<input value={form.brand || ""} onChange={(e) => update("brand", e.target.value)}/></label><label>Unit<select value={form.unit || "Piece"} onChange={(e) => update("unit", e.target.value)}>{["Piece", "Set", "Box", "Carton", "Kg", "Pair"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label>Description<textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Product details"/></label><div className="form-row"><label>Pack size<input value={form.packSize || form.cartonQty || ""} onChange={(e) => { update("packSize", e.target.value); update("cartonQty", e.target.value); }} placeholder="e.g. 12 pcs / box"/></label><label>MOQ<input type="number" min="0" value={form.moq || ""} onChange={(e) => update("moq", Number(e.target.value))}/></label></div><div className="form-row"><label>Barcode<input value={form.barcode || ""} onChange={(e) => update("barcode", e.target.value)}/></label><label>GST %<input type="number" min="0" value={form.gst ?? 18} onChange={(e) => update("gst", Number(e.target.value))}/></label></div><div className="form-row"><label>Weight<input value={form.weight || ""} onChange={(e) => update("weight", e.target.value)} placeholder="e.g. 250 g"/></label><label>Dimensions<input value={form.dimensions || ""} onChange={(e) => update("dimensions", e.target.value)} placeholder="L × W × H"/></label></div><div className="form-row"><label>Supplier<input value={form.supplier || ""} onChange={(e) => update("supplier", e.target.value)}/></label><label>Country of origin<input value={form.countryOfOrigin || ""} onChange={(e) => update("countryOfOrigin", e.target.value)}/></label></div><div className="modal-section-title">Commercial pricing</div><div className="form-row"><label>Purchase price (₹)<input type="number" min="0" value={form.purchasePrice || ""} onChange={(e) => update("purchasePrice", Number(e.target.value))}/></label><label>Selling price (₹)<input type="number" min="0" value={form.unitPrice || ""} onChange={(e) => update("unitPrice", Number(e.target.value))} required/></label></div><div className="form-row"><label>Wholesale price (₹)<input type="number" min="0" value={form.wholesalePrice || ""} onChange={(e) => update("wholesalePrice", Number(e.target.value))}/></label><label>Distributor price (₹)<input type="number" min="0" value={form.distributorPrice || ""} onChange={(e) => update("distributorPrice", Number(e.target.value))}/></label></div><div className="modal-section-title">Inventory control</div><div className="stock-input-grid"><label>Available quantity<input type="number" min="0" value={form.availableQuantity ?? ""} onChange={(e) => update("availableQuantity", Number(e.target.value))}/></label><label>Reserved stock<input type="number" min="0" value={form.reservedStock || ""} onChange={(e) => update("reservedStock", Number(e.target.value))}/></label></div><div className="stock-calculation"><span>Available quantity <b>{stockAvailable.toLocaleString("en-IN")}</b></span><span>Free to order <b>{stockFree.toLocaleString("en-IN")}</b></span></div><button className="primary modal-submit" type="button" onClick={() => save(form)}>Save product</button></Shell>;
}
function ClientModal({
  client,
  catalogue,
  close,
  save,
}: {
  client: Client | null;
  catalogue: CatalogueItem[];
  close: () => void;
  save: (c: Client) => void;
}) {
  const initial = client || {
    id: Date.now(),
    customerId: "",
    name: "",
    city: "",
    state: "",
    address: "",
    pincode: "",
    contact: "",
    phone: "",
    whatsapp: "",
    email: "",
    gstin: "",
    pan: "",
    businessType: "",
    customerCategory: "",
    credit: "",
    paymentTerms: "",
    assignedSalesperson: "",
    customerStatus: "Active",
    avatar: "",
    specialRates: [],
  };
  const [f, setF] = useState<Client>({ ...initial, specialRates: initial.specialRates || [] });
  const set = (k: keyof Client, v: string) => setF({ ...f, [k]: v });
  const setRate = (sku: string, rate: number) => setF({ ...f, specialRates: [...(f.specialRates || []).filter((item) => item.sku !== sku), { sku, rate }] });
  const removeRate = (sku: string) => setF({ ...f, specialRates: (f.specialRates || []).filter((item) => item.sku !== sku) });
  return <Shell close={close}><div className="modal-mark"><Users size={22}/></div><h2>{client ? "Edit client" : "New client"}</h2><p>Only the customer details required for day-to-day orders and collections.</p><div className="form-row"><label>Business name<input value={f.name} onChange={(e) => set("name", e.target.value)} required/></label><label>City<input value={f.city} onChange={(e) => set("city", e.target.value)} required/></label></div><div className="form-row"><label>Phone number<input value={f.phone} onChange={(e) => set("phone", e.target.value)} required/></label><label>Payment threshold<input value={f.credit} onChange={(e) => set("credit", e.target.value)} placeholder="₹ 0" required/></label></div><div className="form-row"><label>Payment terms<select value={f.paymentTerms || ""} onChange={(e) => set("paymentTerms", e.target.value)}><option value="">Select payment terms</option>{["Advance", "7 days", "15 days", "30 days", "45 days", "60 days"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Status<select value={f.customerStatus || "Active"} onChange={(e) => set("customerStatus", e.target.value)}>{["Active", "On hold", "Inactive", "Prospect", "Blocked"].map((value) => <option key={value}>{value}</option>)}</select></label></div><button className="primary modal-submit" type="button" onClick={() => save({ ...f, customerId: f.customerId || `GB-C${String(f.id).slice(-4)}`, contact: f.contact || f.name, avatar: f.avatar || initials(f.name) })}>Save client</button></Shell>;
  return (
    <Shell close={close}>
      <div className="modal-mark">
        <Users size={22} />
      </div>
      <h2>{client ? "Edit client" : "New client"}</h2>
      <p>Create a complete customer account for sales, billing and follow-ups.</p>
      <div className="modal-section-title">Business information</div>
      <div className="form-row"><label>Customer ID<input value={f.customerId || ""} onChange={(e) => set("customerId", e.target.value.toUpperCase())} placeholder="GB-C0001"/></label><label>Business name
        <input
          value={f.name}
          onChange={(e) => set("name", e.target.value)}
          required
        />
      </label></div>
      <div className="form-row">
        <label>
          City
          <input
            value={f.city}
            onChange={(e) => set("city", e.target.value)}
            required
          />
        </label>
        <label>
          Payment threshold
          <input
            value={f.credit}
            onChange={(e) => set("credit", e.target.value)}
            placeholder="₹ 0"
            required
          />
        </label>
      </div>
      <label>
        Primary contact
        <input
          value={f.contact}
          onChange={(e) => set("contact", e.target.value)}
          required
        />
      </label>
      <label>
        Phone
        <input
          value={f.phone}
          onChange={(e) => set("phone", e.target.value)}
          required
        />
      </label>
      <div className="form-row"><label>WhatsApp<input value={f.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} placeholder="+91 98765 43210"/></label><label>Email<input type="email" value={f.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="buyer@business.com"/></label></div>
      <div className="form-row"><label>GSTIN<input value={f.gstin || ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5"/></label><label>PAN<input value={f.pan || ""} onChange={(e) => set("pan", e.target.value.toUpperCase())} placeholder="AAAAA0000A"/></label></div>
      <div className="form-row"><label>Business type<select value={f.businessType || ""} onChange={(e) => set("businessType", e.target.value)}><option value="">Select type</option>{["Wholesaler", "Retailer", "Event Supplier", "Party Shop", "Distributor", "Online Seller", "Corporate", "Other"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Customer category<select value={f.customerCategory || ""} onChange={(e) => set("customerCategory", e.target.value)}><option value="">Select category</option>{["A — Strategic", "B — Growth", "C — Standard", "New", "Other"].map((value) => <option key={value}>{value}</option>)}</select></label></div>
      <div className="form-row"><label>State<input value={f.state || ""} onChange={(e) => set("state", e.target.value)} placeholder="Maharashtra"/></label><label>Pincode<input value={f.pincode || ""} onChange={(e) => set("pincode", e.target.value)} placeholder="400001"/></label></div>
      <label>Address<textarea value={f.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="Full billing / delivery address"/></label>
      <div className="modal-section-title">Commercial information</div>
      <div className="form-row"><label>Payment terms<select value={f.paymentTerms || ""} onChange={(e) => set("paymentTerms", e.target.value)}><option value="">Select payment terms</option>{["Advance", "7 days", "15 days", "30 days", "45 days", "60 days"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Assigned salesperson<input value={f.assignedSalesperson || ""} onChange={(e) => set("assignedSalesperson", e.target.value)} placeholder="Employee name"/></label></div>
      <label>Customer status<select value={f.customerStatus || "Active"} onChange={(e) => set("customerStatus", e.target.value)}>{["Active", "On hold", "Inactive", "Prospect", "Blocked"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <div className="modal-section-title">Special SKU rates</div>
      <p className="special-rate-help">Set a negotiated unit price for this client. It will be applied automatically when that SKU is used in an order.</p>
      <div className="special-rate-list">{(f.specialRates || []).map((item) => <div className="special-rate-row" key={item.sku}><b>{item.sku}</b><input aria-label={`Special rate for ${item.sku}`} type="number" min="0" value={item.rate} onChange={(event) => setRate(item.sku, Number(event.target.value))}/><button type="button" onClick={() => removeRate(item.sku)}>Remove</button></div>)}</div>
      <div className="special-rate-add"><select defaultValue="" onChange={(event) => { const sku = event.target.value; if (sku && !(f.specialRates || []).some((item) => item.sku === sku)) { const product = catalogue.find((item) => item.sku === sku); setRate(sku, product?.unitPrice || 0); } event.currentTarget.value = ""; }}><option value="" disabled>Add catalogue SKU special rate</option>{catalogue.filter((item) => !(f.specialRates || []).some((rate) => rate.sku === item.sku)).map((item) => <option value={item.sku} key={item.id}>{item.sku} — {item.name}</option>)}</select></div>
      <button
        className="primary modal-submit"
        type="button"
        onClick={() => save({ ...f, customerId: f.customerId || `GB-C${String(f.id).slice(-4)}`, avatar: f.avatar || initials(f.name) })}
      >
        Save client
      </button>
    </Shell>
  );
}
function QuoteModal({ quote, clients, catalogue, close, save }: { quote: Quote | null; clients: Client[]; catalogue: CatalogueItem[]; close: () => void; save: (quote: Quote) => void }) {
  const initial: Quote = quote || { id: `QT-${String(Date.now()).slice(-6)}`, customer: "", products: [{ product: "", sku: "", quantity: 1, unitPrice: 0, discount: 0 }], gst: 18, freight: 0, validity: "", paymentTerms: "", deliveryTerms: "", status: "Draft", createdAt: new Date().toISOString().slice(0, 10) };
  const [form, setForm] = useState<Quote>(initial);
  const updateLine = (index: number, key: keyof QuoteProduct, value: string | number) => setForm((current) => ({ ...current, products: current.products.map((line, lineIndex) => { if (lineIndex !== index) return line; const next = { ...line, [key]: value }; if (key === "sku") { const product = catalogue.find((item) => item.sku === value); return { ...next, product: product?.name || next.product, unitPrice: product?.unitPrice ?? next.unitPrice }; } return next; }) }));
  const subtotal = quoteSubtotal(form); const total = quoteTotal(form);
  return <Shell close={close}><div className="modal-mark"><FileText size={22}/></div><h2>{quote ? "Edit quotation" : "New quotation"}</h2><p>Create a customer-ready quote, then share or convert it into an order.</p><div className="form-row"><label>Quote number<input value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value.toUpperCase() })}/></label><label>Customer<select value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })}><option value="">Select customer</option>{clients.map((client) => <option key={client.id}>{client.name}</option>)}</select></label></div><div className="modal-section-title">Products & pricing</div><div className="quote-lines">{form.products.map((line, index) => <div className="quote-line" key={index}><select value={line.sku} onChange={(event) => updateLine(index, "sku", event.target.value)}><option value="">Select SKU</option>{catalogue.map((product) => <option key={product.id} value={product.sku}>{product.sku} — {product.name}</option>)}</select><input aria-label="Quantity" type="number" min="1" value={line.quantity} onChange={(event) => updateLine(index, "quantity", Number(event.target.value))}/><input aria-label="Rate" type="number" min="0" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", Number(event.target.value))}/><input aria-label="Discount percent" type="number" min="0" max="100" value={line.discount} onChange={(event) => updateLine(index, "discount", Number(event.target.value))}/><b>{money(line.quantity * line.unitPrice * (1 - line.discount / 100))}</b>{form.products.length > 1 && <button type="button" onClick={() => setForm({ ...form, products: form.products.filter((_, itemIndex) => itemIndex !== index) })}>×</button>}</div>)}</div><button type="button" className="add-line" onClick={() => setForm({ ...form, products: [...form.products, { product: "", sku: "", quantity: 1, unitPrice: 0, discount: 0 }] })}><Plus size={15}/> Add product</button><div className="quote-total-box"><span>Subtotal <b>{money(subtotal)}</b></span><span>GST<input type="number" min="0" value={form.gst} onChange={(event) => setForm({ ...form, gst: Number(event.target.value) })}/>%</span><span>Freight<input type="number" min="0" value={form.freight} onChange={(event) => setForm({ ...form, freight: Number(event.target.value) })}/></span><strong>Total {money(total)}</strong></div><div className="form-row"><label>Validity<input type="date" value={form.validity} onChange={(event) => setForm({ ...form, validity: event.target.value })}/></label><label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Quote["status"] })}>{["Draft", "Sent", "Accepted", "Converted"].map((status) => <option key={status}>{status}</option>)}</select></label></div><label>Payment terms<input value={form.paymentTerms} onChange={(event) => setForm({ ...form, paymentTerms: event.target.value })} placeholder="e.g. 30 days from invoice"/></label><label>Delivery terms<input value={form.deliveryTerms} onChange={(event) => setForm({ ...form, deliveryTerms: event.target.value })} placeholder="e.g. Ex-warehouse, Mumbai"/></label><button className="primary modal-submit" type="button" onClick={() => save(form)}>Save quotation</button></Shell>;
}
function TaskModal({ task, close, save }: { task: SalesTask | null; close: () => void; save: (task: SalesTask) => void }) {
  const initial: SalesTask = task || { id: `TASK-${String(Date.now()).slice(-6)}`, title: "", time: "10:00", dueDate: "2026-09-17", assignee: "Rahul", type: "Follow-up", status: "Open", relatedTo: "" };
  const [form, setForm] = useState<SalesTask>(initial);
  const set = (key: keyof SalesTask, value: string) => setForm({ ...form, [key]: value });
  return <Shell close={close}><div className="modal-mark"><ClipboardList size={22}/></div><h2>{task ? "Edit task" : "New task"}</h2><p>Assign a timed action to a salesperson.</p><label>Task<input value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="e.g. Follow-up customer" required/></label><div className="form-row"><label>Date<input type="date" value={form.dueDate} onChange={(event) => set("dueDate", event.target.value)}/></label><label>Time<input type="time" value={form.time} onChange={(event) => set("time", event.target.value)}/></label></div><div className="form-row"><label>Task type<select value={form.type} onChange={(event) => set("type", event.target.value)}>{["Call", "Follow-up", "Payment", "Quotation", "Enquiry", "Other"].map((type) => <option key={type}>{type}</option>)}</select></label><label>Assigned salesperson<input value={form.assignee} onChange={(event) => set("assignee", event.target.value)} placeholder="Employee name"/></label></div><label>Related record<input value={form.relatedTo || ""} onChange={(event) => set("relatedTo", event.target.value)} placeholder="Optional: invoice, quote, lead or order ID"/></label><button className="primary modal-submit" type="button" onClick={() => save(form)}>Save task</button></Shell>;
}
function LeadModal({ lead, close, save }: { lead: Lead | null; close: () => void; save: (lead: Lead) => void }) {
  const initial: Lead = lead || { id: `LEAD-${String(Date.now()).slice(-6)}`, company: "", contact: "", mobile: "", city: "", source: "WhatsApp", salesperson: "", requirement: "", expectedValue: "", expectedDate: "", status: "New", lostReason: "", createdAt: new Date().toISOString().slice(0, 10) };
  const [form, setForm] = useState<Lead>(initial);
  const set = (key: keyof Lead, value: string) => setForm({ ...form, [key]: value });
  return <Shell close={close}><div className="modal-mark"><Target size={22}/></div><h2>{lead ? "Edit lead" : "New lead"}</h2><p>Capture the enquiry first, then progress it through quote and order stages.</p><div className="modal-section-title">Lead details</div><div className="form-row"><label>Lead ID<input value={form.id} onChange={(event) => set("id", event.target.value.toUpperCase())}/></label><label>Company<input value={form.company} onChange={(event) => set("company", event.target.value)} required/></label></div><div className="form-row"><label>Contact person<input value={form.contact} onChange={(event) => set("contact", event.target.value)} required/></label><label>Mobile<input value={form.mobile} onChange={(event) => set("mobile", event.target.value)} required/></label></div><div className="form-row"><label>City<input value={form.city} onChange={(event) => set("city", event.target.value)}/></label><label>Source<select value={form.source} onChange={(event) => set("source", event.target.value)}>{leadSources.map((source) => <option key={source}>{source}</option>)}</select></label></div><label>Requirement<textarea value={form.requirement} onChange={(event) => set("requirement", event.target.value)} placeholder="Products, quantity, event or business requirement"/></label><div className="modal-section-title">Qualification & follow-up</div><div className="form-row"><label>Assigned salesperson<input value={form.salesperson} onChange={(event) => set("salesperson", event.target.value)} placeholder="Employee name"/></label><label>Expected order value<input value={form.expectedValue} onChange={(event) => set("expectedValue", event.target.value)} placeholder="₹ 0"/></label></div><div className="form-row"><label>Expected order date<input type="date" value={form.expectedDate} onChange={(event) => set("expectedDate", event.target.value)}/></label><label>Stage<select value={form.status} onChange={(event) => set("status", event.target.value)}>{leadStages.map((stage) => <option key={stage}>{stage}</option>)}</select></label></div>{form.status === "Lost" && <label>Lost reason<select value={form.lostReason || ""} onChange={(event) => set("lostReason", event.target.value)}><option value="">Select reason</option>{lostReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>}<button className="primary modal-submit" type="button" onClick={() => save(form)}>Save lead</button></Shell>;
}
function InvoiceModal({
  invoice,
  clients,
  orders,
  close,
  save,
}: {
  invoice: Invoice | null;
  clients: Client[];
  orders: Order[];
  close: () => void;
  save: (i: Invoice) => void;
}) {
  const initial = invoice || {
    id: "INV-1021",
    client: "",
    order: "",
    amount: "",
    due: "",
    status: "Partial",
  };
  const [f, setF] = useState(initial),
    set = (k: keyof Invoice, v: string) => setF({ ...f, [k]: v });
  return (
    <Shell close={close}>
      <div className="modal-mark">
        <FileText size={22} />
      </div>
      <h2>{invoice ? "Edit invoice" : "New invoice"}</h2>
      <p>Keep invoice dates, value and payment status updated.</p>
      <label>
        Client
        <select
          value={f.client}
          onChange={(e) => set("client", e.target.value)}
        >
          <option value="" disabled>
            Select a client
          </option>
          {clients.map((c) => (
            <option key={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label>
          Order
          <select
            value={f.order}
            onChange={(e) => set("order", e.target.value)}
          >
            <option value="" disabled>
              Select an order
            </option>
            {orders.map((o) => (
              <option key={o.id}>{o.id}</option>
            ))}
          </select>
        </label>
        <label>
          Amount
          <input
            value={f.amount}
            onChange={(e) => set("amount", e.target.value)}
            placeholder="₹ 0"
            required
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Due date
          <input
            type="date"
            value={f.due.includes("-") ? f.due : ""}
            onChange={(e) => set("due", e.target.value)}
            required
          />
        </label>
        <label>
          Status
          <select
            value={f.status}
            onChange={(e) => set("status", e.target.value)}
          >
            {["Partial", "Paid", "Overdue"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="primary modal-submit"
        type="button"
        onClick={() =>
          save({
            ...f,
            due: f.due.includes("-")
              ? new Date(f.due).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : f.due,
          })
        }
      >
        Save invoice
      </button>
    </Shell>
  );
}
function ImageStudio() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const maskRef = useRef<HTMLImageElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [maskUrl, setMaskUrl] = useState("");
  const [shape, setShape] = useState<"circle" | "rounded" | "arch" | "portrait" | "wide" | "reference">("circle");
  const [fitMode, setFitMode] = useState<"fit" | "fill">("fit");
  const [zoom, setZoom] = useState(100);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [quality, setQuality] = useState(2048);
  const [maskRatio, setMaskRatio] = useState(1);
  const ratio = shape === "portrait" ? .8 : shape === "wide" ? 1.78 : shape === "reference" ? maskRatio : 1;
  const dimensions = ratio >= 1 ? { width: quality, height: Math.round(quality / ratio) } : { width: Math.round(quality * ratio), height: quality };

  const loadImage = (file: File, callback: (url: string, image: HTMLImageElement) => void) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => callback(url, image);
    image.src = url;
  };
  const draw = () => {
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    if (!canvas) return;
    canvas.width = dimensions.width; canvas.height = dimensions.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!source) return;
    // Fit is the safe default: it preserves the complete uploaded image.
    // Fill is available when an edge-to-edge crop is preferred.
    const baseScale = (fitMode === "fit" ? Math.min : Math.max)(canvas.width / source.width, canvas.height / source.height);
    const scale = baseScale * (zoom / 100);
    const width = source.width * scale, height = source.height * scale;
    const maxX = Math.max(0, (width - canvas.width) / 2);
    const maxY = Math.max(0, (height - canvas.height) / 2);
    const dx = (canvas.width - width) / 2 + maxX * (x / 100);
    const dy = (canvas.height - height) / 2 + maxY * (y / 100);
    ctx.save();
    if (shape !== "reference") {
      ctx.beginPath();
      if (shape === "circle") ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2);
      if (shape === "rounded") ctx.roundRect(0, 0, canvas.width, canvas.height, canvas.width * .13);
      if (shape === "portrait") ctx.roundRect(0, 0, canvas.width, canvas.height, canvas.width * .08);
      if (shape === "wide") ctx.roundRect(0, 0, canvas.width, canvas.height, canvas.height * .12);
      if (shape === "arch") { const r = canvas.width / 2; ctx.moveTo(0, canvas.height); ctx.lineTo(0, r); ctx.arc(r, r, r, Math.PI, 0); ctx.lineTo(canvas.width, canvas.height); ctx.closePath(); }
      ctx.clip();
    }
    ctx.drawImage(source, dx, dy, width, height);
    ctx.restore();
    if (shape === "reference" && maskRef.current) {
      ctx.save(); ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(maskRef.current, 0, 0, canvas.width, canvas.height); ctx.restore();
    }
  };
  useEffect(() => { draw(); }, [sourceUrl, maskUrl, shape, fitMode, zoom, x, y, quality, maskRatio]); // redraw the HD export canvas
  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceRef.current) return;
    const anchor = document.createElement("a");
    anchor.download = `geebee-social-${shape}-${dimensions.width}x${dimensions.height}.png`;
    anchor.href = canvas.toDataURL("image/png"); anchor.click();
  };
  const shapes: Array<{ id: typeof shape; name: string; note: string }> = [
    { id: "circle", name: "Circle", note: "Profile / sticker" }, { id: "rounded", name: "Rounded", note: "Social post" },
    { id: "arch", name: "Arch", note: "Product feature" }, { id: "portrait", name: "Portrait", note: "4:5 feed" }, { id: "wide", name: "Wide", note: "Story / banner" },
  ];
  return <section className="image-studio">
    <div className="studio-hero"><div><span className="overline">GEEBEE CONTENT STUDIO</span><h2>Social image cropper</h2><p>Prepare product visuals in a chosen shape and download a crisp HD PNG.</p></div><span className="studio-badge"><Crop size={17}/> HD export</span></div>
    <div className="studio-layout">
      <aside className="studio-controls">
        <label className="studio-upload"><ImagePlus size={20}/><b>{sourceUrl ? "Replace product image" : "Upload product image"}</b><small>JPG, PNG or WebP</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) loadImage(file, (url, image) => { sourceRef.current = image; setSourceUrl(url); }); }}/></label>
        <div className="studio-control-block"><b>Choose a shape</b><div className="shape-grid">{shapes.map((item) => <button type="button" key={item.id} className={`shape-card ${shape === item.id ? "selected" : ""}`} onClick={() => setShape(item.id)}><i className={`shape-icon ${item.id}`}/><span>{item.name}</span><small>{item.note}</small></button>)}</div></div>
        <div className="studio-control-block"><b>How should the image sit in the shape?</b><div className="fit-options"><button type="button" className={fitMode === "fit" ? "selected" : ""} onClick={() => { setFitMode("fit"); setZoom(100); setX(0); setY(0); }}><strong>Fit whole image</strong><small>Nothing is cut off</small></button><button type="button" className={fitMode === "fill" ? "selected" : ""} onClick={() => { setFitMode("fill"); setZoom(100); setX(0); setY(0); }}><strong>Fill shape</strong><small>Crop to the edges</small></button></div></div>
        <div className="studio-control-block reference-control"><b>Use your reference shape</b><p>Upload a transparent PNG template. Its visible area becomes the crop shape.</p><label className="reference-upload">{maskUrl ? "Replace reference PNG" : "Upload reference PNG"}<input type="file" accept="image/png" onChange={(event) => { const file = event.target.files?.[0]; if (file) loadImage(file, (url, image) => { maskRef.current = image; setMaskRatio(image.width / image.height); setMaskUrl(url); setShape("reference"); }); }}/></label></div>
        <div className="studio-control-block"><b>Output size</b><div className="size-buttons">{[1080, 2048, 4096].map((size) => <button type="button" key={size} className={quality === size ? "selected" : ""} onClick={() => setQuality(size)}>{size === 1080 ? "1080px" : `${size / 1024}K HD`}</button>)}</div></div>
      </aside>
      <div className="studio-preview-wrap"><div className="studio-preview">{!sourceUrl && <div className="studio-empty"><ImagePlus size={30}/><b>Upload an image to start</b><span>Your final crop will preview here.</span></div>}<canvas ref={canvasRef} className={sourceUrl ? "ready" : ""}/></div>{sourceUrl && <p className="preview-size">Export: {dimensions.width} × {dimensions.height}px · transparent PNG</p>}</div>
      <aside className="studio-adjust"><h3>Adjust image</h3><p>{fitMode === "fit" ? "The whole image is preserved. Zoom only if you want to crop it deliberately." : "Move the image inside the selected frame."}</p><label>Zoom <b>{zoom}%</b><input type="range" min="100" max="250" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}/></label><label>Horizontal position<input type="range" min="-100" max="100" value={x} onChange={(event) => setX(Number(event.target.value))}/></label><label>Vertical position<input type="range" min="-100" max="100" value={y} onChange={(event) => setY(Number(event.target.value))}/></label><button type="button" className="outline studio-reset" onClick={() => { setZoom(100); setX(0); setY(0); }}>Reset position</button><button type="button" className="primary studio-download" disabled={!sourceUrl || (shape === "reference" && !maskUrl)} onClick={exportPng}><Download size={17}/> Download HD PNG</button></aside>
    </div>
  </section>;
}
function Metric({
  label,
  value,
  change,
  icon,
  kind,
}: {
  label: string;
  value: string;
  change: string;
  icon: React.ReactNode;
  kind: string;
}) {
  return (
    <section className="metric">
      <div className={`metric-icon ${kind}`}>{icon}</div>
      <div>
        <p>{label}</p>
        <h2>{value}</h2>
        <small>{change}</small>
      </div>
    </section>
  );
}
