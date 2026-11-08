"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import "./task-completion.css";
import "./reports.css";
import "./recovery.css";
import "./transporters.css";
import "./image-studio.css";
import "./image-studio-fit.css";
import "./dispatch-plan.css";
import "./purchasing.css";
import "./order-import-review.css";
import "./customer-transfer.css";
import "./crm-polish.css";
import "./auth-reference.css";
import "./inventory-reconciliation.css";
import { supabase } from "./lib/supabase";
import { stockMovementBalances } from "./lib/stockMovementBalances";
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
  Keyboard,
  Download,
  Crop,
  Copy,
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
type ProductLine = { product: string; sku: string; quantity: number; unitPrice: number; remarks?: string; masterPriceChanged?: boolean; review?: { product?: boolean; quantity?: boolean; price?: boolean } };
type QuoteProduct = ProductLine & { discount: number };
type CatalogueItem = { id: number; name: string; sku: string; unitPrice: number; category: string; image: string; description: string; cartonQty: string; innerQty?: string; outerQty?: string; subCategory?: string; brand?: string; unit?: string; packSize?: string; moq?: number; purchasePrice?: number; wholesalePrice?: number; distributorPrice?: number; gst?: number; barcode?: string; weight?: string; dimensions?: string; supplier?: string; countryOfOrigin?: string; availableQuantity?: number; openingStock?: number; purchasedStock?: number; orderedStock?: number; damagedStock?: number; reservedStock?: number; reorderThreshold?: number; sheetSyncPending?: boolean; sheetSyncError?: string; sheetSyncToken?: string; sheetSyncUpdatedAt?: string };
type InventoryReconciliation = { sourceLabel: string; quantity: number; status: "matched" | "unmatched" | "ambiguous"; sku?: string; name?: string; currentAvailable?: number; candidates?: string[] };
type PurchaseLine = { sku: string; product: string; quantity: number; receivedQuantity: number };
type PurchaseOrder = { id: string; supplier: string; status: "Draft" | "Ordered" | "Part received" | "Delivered" | "Cancelled"; expectedDate: string; createdAt: string; notes: string; lines: PurchaseLine[]; importKey?: string };
type ClientSpecialRate = { sku: string; rate: number };
const crmModules = ["Dashboard", "Customers", "Enquiries", "Daily Tasks", "Sales", "Products", "Inventory", "Operations", "Fulfilment", "Billing", "Imports", "Reports", "Automation", "Settings"] as const;
type CrmModule = typeof crmModules[number];
type ModuleAccess = "view" | "edit";
type WorkspaceMember = { id: number; workspace_owner_id: string; email: string; role: "admin" | "employee"; modules: string[] };
const moduleToken = (module: CrmModule, access: ModuleAccess) => `${module}:${access}`;
const allModuleTokens = () => crmModules.map((module) => moduleToken(module, "edit"));
const legacyModuleGroups: Record<string, CrmModule[]> = {
  Overview: ["Dashboard"], Clients: ["Customers"], Leads: ["Enquiries", "Daily Tasks"], Orders: ["Sales", "Operations", "Fulfilment"], Catalogue: ["Products"], Invoices: ["Billing"], Payments: ["Billing"], Shipments: ["Operations", "Imports"],
};
const memberModuleAccess = (tokens: string[] | undefined, module: CrmModule): ModuleAccess | undefined => {
  const saved = tokens || [];
  if (saved.includes(moduleToken(module, "edit"))) return "edit";
  if (saved.includes(moduleToken(module, "view"))) return "view";
  return saved.some((token) => legacyModuleGroups[token]?.includes(module)) ? "edit" : undefined;
};
type AccessRequest = { user_id: string; full_name: string; phone: string; email: string; created_at: string };
type AuditEvent = { id: number; actor_email: string; action: string; module: string; details: string; created_at: string };
type ProductStockMovement = { orderId: string; client?: string; direction: "Dispatch" | "Return"; sku: string; product: string; quantity: number; before: number; after: number };
type InventoryLedgerEntry = {
  id: number;
  transaction_id: string;
  reference_transaction_id?: string | null;
  order_id: string;
  sku_id: string;
  product_record_id: string;
  transaction_type: "Dispatch" | "Reversal";
  occurred_at: string;
  quantity: number;
  signed_quantity: number;
  previous_available: number;
  new_available: number;
  actor_email: string;
};
type StageTransitionJob = { id: string; direction: "CtoD" | "DtoC"; state: "running" | "success" | "error"; message: string; startedAt: number };
type ConfirmedOrderProductChange = { sku: string; product: string; change: "Confirmed" | "Added" | "Removed" | "Quantity increased" | "Quantity reduced"; before: number; after: number };
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
  remarks?: string;
  clientApproval?: "Approval pending" | "Approval requested" | "Approved" | "Changes requested" | "Rejected";
  // A permanent, human-readable confirmation reference. It is assigned only
  // the first time a Draft becomes Confirmed and survives a return to Draft.
  confirmationSequence?: number;
  sourceSheetOrderId?: string;
  // Product lines originally requested by the customer. Confirmed `products`
  // can hold only the stock allocated for dispatch while this preserves the
  // complete request for a later return to Draft.
  requestedProducts?: ProductLine[];
  // Only Qty changes on these exact SKU lines are allowed to reserve beyond
  // free stock. Saving, changing price, or editing another SKU does not count.
  draftEditedQuantityKeys?: string[];
  // True only after this order's quantities have actually been deducted from
  // Product / SKU available stock on entry to Dispatch Plan.
  inventoryCommitted?: boolean;
  // Immutable quantities deducted when the order entered Dispatch Plan. These
  // are the only quantities allowed to be added back on a Dispatch reversal.
  dispatchStockLines?: ProductLine[];
  // Ledger identifiers are immutable. They make retrying a network request
  // harmless and tie a reversal to exactly one original dispatch.
  inventoryDispatchTransactionId?: string;
  inventoryDispatchCycle?: number;
  inventoryReversalTransactionId?: string;
  dispatchedAt?: string;
  dispatchReversedAt?: string;
  cancelledFromDispatch?: boolean;
  cancelledFromStage?: "Draft" | "Confirmed" | "Dispatch plan" | "Sent to customer" | "Received by customer";
  avatar: string;
  products?: ProductLine[];
  approvedProducts?: ProductLine[];
  backorders?: ProductLine[];
  // New confirmations retain the customer's complete requested quantity even
  // when a linked backorder also records the shortage.
  confirmedIncludesBackorderQuantity?: boolean;
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
  whatsappGroupLink?: string;
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
const isProductProfileIncomplete = (product: CatalogueItem) => !product.sku?.trim() || !product.name?.trim() || !product.image || !String(product.outerQty || product.cartonQty || "").trim() || product.unitPrice <= 0 || product.availableQuantity === undefined || product.reorderThreshold === undefined;
type Invoice = {
  id: string;
  client: string;
  order: string;
  amount: string;
  due: string;
  status: string;
};
type LeadStage = "New" | "Contacted" | "Requirement Received" | "Quotation Sent" | "Negotiation" | "Order Created" | "Lost";
type Lead = { id: string; company: string; contact: string; mobile: string; city: string; source: string; salesperson: string; requirement: string; expectedValue: string; expectedDate: string; status: LeadStage; lostReason?: string; createdAt: string };
type Quote = { id: string; customer: string; products: QuoteProduct[]; gst: number; freight: number; validity: string; paymentTerms: string; deliveryTerms: string; status: "Draft" | "Sent" | "Accepted" | "Converted"; createdAt: string };
type SalesTask = { id: string; title: string; description?: string; time: string; dueDate: string; assignee: string; type: "Call" | "Follow-up" | "Payment" | "Quotation" | "Enquiry" | "Other"; status: "Open" | "Done"; relatedTo?: string };
type Transporter = { id: number; name: string; contact: string; phone: string; email?: string; city?: string; area?: string; gstin?: string; serviceType?: string; notes?: string };
type Supplier = { id: number; name: string; contact: string; phone: string; email?: string; city?: string; country?: string; gstin?: string; paymentTerms?: string; notes?: string; status?: "Active" | "Inactive" };
type ScalableRecord = { record_id: string; data: unknown };
const productStockCacheKey = (userId: string) => `geebee-product-stock-inventory:${userId}`;
const readProductStockCache = (userId: string): CatalogueItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(productStockCacheKey(userId)) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
};
const saveProductStockCache = (userId: string, products: CatalogueItem[]) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(productStockCacheKey(userId), JSON.stringify(products)); } catch { /* Storage is optional; the cloud copy remains authoritative. */ }
};
const scalableTables = [
  { key: "clients", table: "crm_clients", search: (item: Client) => `${item.customerId || ""} ${item.name} ${item.contact} ${item.phone} ${item.city}` },
  { key: "catalogue", table: "crm_products", search: (item: CatalogueItem) => `${item.sku} ${item.name} ${item.category} ${item.brand || ""}` },
  { key: "orders", table: "crm_orders", search: (item: Order) => `${item.id} ${item.client} ${item.product} ${item.sku} ${item.city}` },
  { key: "invoices", table: "crm_invoices", search: (item: Invoice) => `${item.id} ${item.client} ${item.order} ${item.status}` },
  { key: "leads", table: "crm_leads", search: (item: Lead) => `${item.id} ${item.company} ${item.contact} ${item.mobile} ${item.city}` },
  { key: "quotes", table: "crm_quotes", search: (item: Quote) => `${item.id} ${item.customer} ${item.status}` },
  { key: "tasks", table: "crm_tasks", search: (item: SalesTask) => `${item.id} ${item.title} ${item.assignee} ${item.relatedTo || ""}` },
  { key: "transporters", table: "crm_transporters", search: (item: Transporter) => `${item.name} ${item.contact} ${item.phone} ${item.city || ""} ${item.area || ""} ${item.serviceType || ""}` },
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
const seedSuppliers: Supplier[] = [];
const transporterCityAreas: Record<string, string[]> = {
  Mumbai: ["Andheri", "Bhiwandi", "Borivali", "Chembur", "Dadar", "Goregaon", "Kurla", "Lower Parel", "Mulund", "Navi Mumbai", "Thane", "Vashi"],
  Delhi: ["Azadpur", "Dwarka", "Karol Bagh", "Kirti Nagar", "Mayapuri", "Narela", "Okhla", "Rohini", "Sadar Bazar"],
  Bengaluru: ["Bommasandra", "Electronic City", "Indiranagar", "Koramangala", "Peenya", "Whitefield", "Yeshwanthpur"],
  Chennai: ["Ambattur", "Guindy", "Madhavaram", "Parrys", "Porur", "T Nagar", "Tambaram"],
  Hyderabad: ["Balanagar", "Begum Bazar", "Gachibowli", "Kukatpally", "Secunderabad", "Uppal"],
  Kolkata: ["Burrabazar", "Howrah", "New Market", "Park Street", "Salt Lake", "Topsia"],
  Ahmedabad: ["Asarwa", "Bapunagar", "Naroda", "Odhav", "Sarkhej", "Vatva"],
  Surat: ["Adajan", "Katargam", "Pandesara", "Sachin", "Udhna", "Varachha"],
  Pune: ["Bhosari", "Hadapsar", "Kothrud", "Pimpri", "Shivajinagar", "Wagholi"],
  Jaipur: ["Bais Godam", "Mansarovar", "Sanganer", "Sitapura", "Vaishali Nagar"],
};
const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const displayMoney = (value: string | number) => {
  if (typeof value === "number") return money(value);
  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? money(numeric) : value.replace(/\$/g, "₹");
};
const openWhatsApp = (phone: string, message: string) => window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
const availableStock = (product: CatalogueItem) => product.availableQuantity ?? ((product.openingStock || 0) + (product.purchasedStock || 0) - (product.orderedStock || 0) - (product.damagedStock || 0));
// Older imported POs may not have a receivedQuantity value at all. Treat that
// as zero everywhere; never let an undefined value turn stock into NaN/zero.
const receivedPurchaseQuantity = (line: Partial<PurchaseLine>) => {
  const value = Number(line.receivedQuantity);
  return Number.isFinite(value) && value > 0 ? value : 0;
};
// Available quantity belongs to the Product Stock Inventory Sheet. CRM orders
// only reserve part of that quantity, so the Sheet and the CRM never overwrite
// each other between stock syncs.
// Do not hide an over-allocation. A negative free balance is an operational
// warning that a confirmed order has been manually increased beyond the stock
// recorded in the Stock Master; the linked backorder continues as normal.
const freeStock = (product: CatalogueItem) => availableStock(product) - (product.reservedStock || 0);
const linesFor = (order: Order): ProductLine[] => order.products || [{ product: order.product, sku: order.sku, quantity: order.quantity, unitPrice: order.unitPrice }];
const confirmedReservationsForSku = (orders: Order[], sku: string) => orders
  .filter((order) => order.status === "Confirmed")
  .flatMap((order) => (order.approvedProducts || linesFor(order)).filter((line) => skuKey(line.sku) === skuKey(sku)).map((line) => ({ orderId: order.id, quantity: line.quantity })));
// Backorders are calculated from the final confirmed lines. Existing
// reservations from other confirmed orders reduce what is free; the order
// being edited is deliberately excluded so its new quantity replaces—not
// stacks on top of—its prior reservation.
const backorderLinesFor = (lines: ProductLine[], orderId: string, orders: Order[], catalogue: CatalogueItem[]) => {
  const remaining = new Map(catalogue.map((product) => {
    const reservedElsewhere = confirmedReservationsForSku(orders.filter((order) => order.id !== orderId), product.sku)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    return [skuKey(product.sku), availableStock(product) - reservedElsewhere];
  }));
  const shortages: ProductLine[] = [];
  lines.forEach((line) => {
    const key = skuKey(line.sku);
    const free = remaining.get(key) ?? 0;
    const shortage = Math.max(0, line.quantity - Math.max(0, free));
    if (shortage) shortages.push({ ...line, quantity: shortage });
    remaining.set(key, free - line.quantity);
  });
  return shortages;
};
const draftQuantityLineKey = (line: ProductLine) => skuKey(line.sku) || line.product.trim().toLowerCase();
const editedDraftQuantityKeys = (before: ProductLine[], after: ProductLine[]) => {
  const oldQuantities = new Map(before.map((line) => [draftQuantityLineKey(line), line.quantity]));
  const newQuantities = new Map(after.map((line) => [draftQuantityLineKey(line), line.quantity]));
  return [...oldQuantities].flatMap(([key, quantity]) => newQuantities.has(key) && newQuantities.get(key) !== quantity ? [key] : []);
};
const confirmationAllocationFor = (lines: ProductLine[], orderId: string, orders: Order[], catalogue: CatalogueItem[], editedQuantityKeys: Set<string>) => {
  const remaining = new Map(catalogue.map((product) => {
    const reservedElsewhere = confirmedReservationsForSku(orders.filter((order) => order.id !== orderId), product.sku).reduce((sum, entry) => sum + entry.quantity, 0);
    return [skuKey(product.sku), availableStock(product) - reservedElsewhere];
  }));
  const confirmed: ProductLine[] = [];
  const shortages: ProductLine[] = [];
  lines.forEach((line) => {
    const key = skuKey(line.sku);
    const free = remaining.get(key) ?? 0;
    const shortage = Math.max(0, line.quantity - Math.max(0, free));
    if (shortage) shortages.push({ ...line, quantity: shortage });
    const allowOverAllocation = editedQuantityKeys.has(draftQuantityLineKey(line));
    const confirmedQuantity = allowOverAllocation ? line.quantity : Math.max(0, Math.min(line.quantity, Math.max(0, free)));
    if (confirmedQuantity) confirmed.push({ ...line, quantity: confirmedQuantity });
    remaining.set(key, free - (allowOverAllocation ? line.quantity : confirmedQuantity));
  });
  return { confirmed, shortages };
};
function ProductReservationSummary({ product, orders }: { product: CatalogueItem; orders: Order[] }) {
  const reservations = confirmedReservationsForSku(orders, product.sku);
  const reserved = reservations.reduce((total, entry) => total + entry.quantity, 0);
  const free = availableStock(product) - reserved;
  return <><p className="catalogue-stock">Reserved: <b>{reserved.toLocaleString("en-IN")}</b> · Free: <b className={free < 0 ? "negative-stock" : ""}>{free.toLocaleString("en-IN")}</b></p>{free < 0 && <p className="catalogue-stock negative-stock">Over-allocated by {Math.abs(free).toLocaleString("en-IN")} · linked backorder remains active.</p>}{reservations.length > 0 && <p className="catalogue-stock">Reserved by: <b>{reservations.map((entry) => `${entry.orderId} (${entry.quantity.toLocaleString("en-IN")})`).join(", ")}</b></p>}</>;
}
const orderTotal = (order: Order) => linesFor(order).reduce((total, line) => total + line.quantity * line.unitPrice, 0);
const orderEntrySource = (order: Order) => /imported\s+from/i.test(order.remarks || "") ? "Import" : "Manual";
const packingInstructions = (order: Order) => /^imported\s+from\s+connected\s+google\s+sheet\.?$/i.test((order.remarks || "").trim()) ? "" : (order.remarks || "").trim();
const orderQuantity = (order: Order) => linesFor(order).reduce((total, line) => total + line.quantity, 0);
const describeConfirmedOrderChanges = (before: Order, after: Order) => {
  const changes: string[] = [];
  ([
    ["client", "Customer"], ["city", "City"], ["transporter", "Transporter"], ["eta", "Expected arrival"], ["payment", "Payment status"], ["remarks", "Packing"],
  ] as const).forEach(([field, label]) => {
    const previous = String(before[field] || "").trim();
    const next = String(after[field] || "").trim();
    if (previous !== next) changes.push(`${label}: ${previous || "—"} → ${next || "—"}`);
  });
  // SKU is the identity of an order product. Product labels can change
  // formatting (for example "AB - 972" versus "AB 972") while referring to
  // the same SKU, so never use the label as part of this comparison key.
  const keyFor = (line: ProductLine) => skuKey(line.sku) || skuKey(line.product);
  const previousLines = new Map(linesFor(before).map((line) => [keyFor(line), line]));
  const nextLines = new Map(linesFor(after).map((line) => [keyFor(line), line]));
  new Set([...previousLines.keys(), ...nextLines.keys()]).forEach((key) => {
    const previous = previousLines.get(key);
    const next = nextLines.get(key);
    const label = (next || previous)?.sku || (next || previous)?.product || "Product";
    if (!previous && next) { changes.push(`Added ${label} × ${next.quantity}`); return; }
    if (previous && !next) { changes.push(`Removed ${label} × ${previous.quantity}`); return; }
    if (!previous || !next) return;
    if (previous.quantity !== next.quantity) changes.push(`${label} qty: ${previous.quantity} → ${next.quantity}`);
    if (previous.unitPrice !== next.unitPrice) changes.push(`${label} price: ${money(previous.unitPrice)} → ${money(next.unitPrice)}`);
    if ((previous.remarks || "").trim() !== (next.remarks || "").trim()) changes.push(`${label} remark updated`);
  });
  return changes;
};
// Older history entries created before SKU-only comparison may contain a
// misleading Removed + Added pair for the same SKU. Present those as the
// single quantity change they actually represent, without changing the audit
// record itself.
const readableOrderHistoryDetails = (details: string) => {
  const separator = " · ";
  const separatorAt = details.indexOf(separator);
  const prefix = separatorAt >= 0 ? details.slice(0, separatorAt + separator.length) : "";
  const segments = (separatorAt >= 0 ? details.slice(separatorAt + separator.length) : details).split(" | ");
  const parsed = segments.map((segment, index) => {
    const match = segment.match(/^(Added|Removed)\s+(.+?)\s+×\s+([\d,.]+)$/i);
    return match ? { index, raw: segment, action: match[1].toLowerCase(), label: match[2].trim(), quantity: match[3] } : null;
  });
  const pairs = new Map<string, { added?: NonNullable<(typeof parsed)[number]>; removed?: NonNullable<(typeof parsed)[number]> }>();
  parsed.forEach((entry) => {
    if (!entry) return;
    const key = skuKey(entry.label);
    const pair = pairs.get(key) || {};
    if (entry.action === "added") pair.added = entry;
    if (entry.action === "removed") pair.removed = entry;
    pairs.set(key, pair);
  });
  const consumed = new Set<number>();
  const readable = segments.flatMap((segment, index) => {
    if (consumed.has(index)) return [];
    const entry = parsed[index];
    if (!entry) return [segment];
    const pair = pairs.get(skuKey(entry.label));
    if (!pair?.added || !pair.removed) return [segment];
    consumed.add(pair.added.index); consumed.add(pair.removed.index);
    if (pair.added.quantity === pair.removed.quantity) return [];
    return [`${pair.added.label} qty: ${pair.removed.quantity} → ${pair.added.quantity}`];
  });
  return `${prefix}${readable.join(" | ")}`.trim();
};
// This is deliberately SKU based (not product-name based): product names can
// repeat, while a confirmed order must leave an auditable history for the
// exact Stock Master SKU that was changed.
const confirmedOrderProductChanges = (before: ProductLine[], after: ProductLine[]): ConfirmedOrderProductChange[] => {
  const summarise = (lines: ProductLine[]) => {
    const result = new Map<string, ProductLine>();
    lines.forEach((line) => {
      const key = skuKey(line.sku);
      if (!key) return;
      const existing = result.get(key);
      result.set(key, existing ? { ...existing, quantity: existing.quantity + line.quantity } : { ...line });
    });
    return result;
  };
  const previous = summarise(before);
  const next = summarise(after);
  return [...new Set([...previous.keys(), ...next.keys()])].reduce<ConfirmedOrderProductChange[]>((changes, key) => {
    const oldLine = previous.get(key);
    const newLine = next.get(key);
    if (!oldLine && newLine) changes.push({ sku: newLine.sku, product: newLine.product, change: "Added", before: 0, after: newLine.quantity });
    else if (oldLine && !newLine) changes.push({ sku: oldLine.sku, product: oldLine.product, change: "Removed", before: oldLine.quantity, after: 0 });
    else if (oldLine && newLine && oldLine.quantity !== newLine.quantity) changes.push({ sku: newLine.sku || oldLine.sku, product: newLine.product || oldLine.product, change: newLine.quantity > oldLine.quantity ? "Quantity increased" : "Quantity reduced", before: oldLine.quantity, after: newLine.quantity });
    return changes;
  }, []);
};
const nextPurchaseOrderNumber = (purchases: PurchaseOrder[]) => {
  const now = new Date();
  // Purchase order numbers are date + month based: 24 October becomes
  // 2410-01, 2410-02, and so on for that day.
  const prefix = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const sequence = purchases.reduce((highest, purchase) => {
    const match = purchase.id.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  return `${prefix}-${String(sequence).padStart(2, "0")}`;
};
const initials = (n: string) =>
  n
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const readOrderImageText = async (file: File) => {
  if (!file.type.startsWith("image/")) throw new Error("Upload a clear image file.");
  const { recognize } = await import("tesseract.js");
  return (await recognize(file, "eng")).data.text;
};
type InternalOrderSheet = { client: string; eta: string; products: ProductLine[]; note: string; transporter?: string };
const skuKey = (value: string) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();
const numberCandleMixRecipe = [{ digit: "1", cartons: 10 }, { digit: "2", cartons: 5 }, { digit: "3", cartons: 5 }, { digit: "4", cartons: 5 }, { digit: "5", cartons: 5 }, { digit: "6", cartons: 4 }, { digit: "7", cartons: 4 }, { digit: "8", cartons: 4 }, { digit: "9", cartons: 4 }, { digit: "0", cartons: 4 }] as const;
const numberCandleMixUnits = numberCandleMixRecipe.reduce((sum, component) => sum + component.cartons, 0);
const numberCandleMixSeries = (line: ProductLine) => {
  const compact = skuKey(`${line.sku} ${line.product}`);
  const match = compact.match(/(?:ab)?(204|205)mix/);
  return match?.[1] || null;
};
const expandNumberCandleMixLines = (lines: ProductLine[], catalogue: CatalogueItem[]) => {
  const expanded: ProductLine[] = [];
  for (const line of lines) {
    const series = numberCandleMixSeries(line);
    if (!series) { expanded.push(line); continue; }
    const multiplier = line.quantity / numberCandleMixUnits;
    if (!Number.isInteger(multiplier)) return { error: `${line.sku || line.product} quantity must be a multiple of ${numberCandleMixUnits}. Example: 600 MIX = 12 complete MIX sets.`, lines: [] as ProductLine[] };
    for (const component of numberCandleMixRecipe) {
      const sku = `AB-${series}-${component.digit}`;
      const product = catalogue.find((item) => skuKey(item.sku) === skuKey(sku));
      if (!product) return { error: `${line.sku || line.product} needs ${sku} in Product / SKUs before it can be confirmed.`, lines: [] as ProductLine[] };
      expanded.push({ ...line, sku: product.sku, product: `${product.sku} · ${catalogueName(product)}`, quantity: component.cartons * multiplier, remarks: [line.remarks, `MIX allocation from ${line.sku || `AB-${series} MIX`}`].filter(Boolean).join(" · ") });
    }
  }
  return { lines: expanded };
};
// GeeBee order sheets legitimately use more than one SKU style: AB 851,
// 204-2, 205 MIX, and sometimes just 337. Keep the source code intact;
// catalogue matching later accepts it only when it identifies one SKU.
const extractSheetSku = (value: string) => {
  const cleaned = value.replace(/[^a-z0-9 .-]/gi, " ").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/[A-Z]{1,6}\s*[- ]?\s*\d{1,8}|\d{1,6}\s*[- ]\s*\d{1,4}|\d{1,6}\s+[A-Z]{2,12}|\b\d{2,6}\b/i)?.[0];
  return match ? match.trim().replace(/\s*[- ]\s*/g, "-").toUpperCase() : "";
};
const cleanSheetClient = (value: string) => {
  const withoutDate = value.replace(/\bdate\b\s*[-:. ]*\s*[0-3]?\d[.\/-][01]?\d[.\/-](?:20)?\d{2}/ig, "").replace(/\bdate\b/ig, "").replace(/[|_]/g, " ").replace(/\s+/g, " ").trim();
  if (!withoutDate || !/[a-z]{2}/i.test(withoutDate) || /^[\d.\/\- ]+$/.test(withoutDate)) return "";
  const letters = (withoutDate.match(/[a-z]/gi) || []).length; const digits = (withoutDate.match(/\d/g) || []).length;
  if (/\b(item|quantity|price|value|remarks)\b/i.test(withoutDate) || digits > 1 || digits > letters / 2 || withoutDate.split(" ").length > 6) return "";
  return withoutDate.replace(/^['’]/, "").trim();
};
const isBackorderRecord = (order: Order) => /^ADV-/i.test(order.id) || /advance|back\s*order/i.test(order.status || "");
const isVisibleBackorder = (order: Order) => order.status !== "Cancelled" && isBackorderRecord(order) && (/^ADV-/i.test(order.id) || linesFor(order).some((line) => line.quantity > 0));
const isFulfilmentOrder = (order?: Order) => Boolean(order && ["Sent to customer", "Received by customer"].includes(order.status));
const orderWithLines = (order: Order, products: ProductLine[]): Order => {
  const first = products[0] || { product: "", sku: "", quantity: 0, unitPrice: 0 };
  return { ...order, product: first.product, sku: first.sku, quantity: first.quantity, unitPrice: first.unitPrice, products };
};
const catalogueSku = (item: CatalogueItem) => item.sku?.trim() || "SKU pending";
const catalogueName = (item: CatalogueItem) => item.name?.trim() || item.description?.trim() || (item.sku?.trim() ? `Product ${item.sku.trim()}` : "Product name pending");
// A product input can retain its human-readable label even when an older
// import supplied a malformed or blank SKU. Resolve that label only when it
// identifies exactly one current master product. This repairs harmless UI
// mismatches without ever guessing between duplicate product names.
const catalogueMatchForOrderLine = (line: ProductLine, catalogue: CatalogueItem[]) => {
  const skuMatches = catalogue.filter((item) => skuKey(item.sku) === skuKey(line.sku));
  if (skuMatches.length === 1) return skuMatches[0];
  // Some older Sheet imports saved the whole display label in the SKU field
  // (for example, "AB - 30 GOLDEN"). It is not an SKU, but it can be repaired
  // safely only when it equals one complete, unique catalogue display label.
  // This never treats SKU prefixes as matches: AB 204 and AB 204-1 stay distinct.
  const labels = [line.product, line.sku]
    .map((value) => skuKey(value))
    .filter(Boolean);
  if (!labels.length) return undefined;
  const labelMatches = catalogue.filter((item) => {
    const name = catalogueName(item);
    const candidates = [name, `${item.sku} · ${name}`, `${name} · ${item.sku}`, `${item.sku} ${name}`, `${name} ${item.sku}`]
      .map((candidate) => skuKey(candidate));
    return labels.some((label) => candidates.includes(label));
  });
  return labelMatches.length === 1 ? labelMatches[0] : undefined;
};
const canonicaliseCatalogueOrderLines = (lines: ProductLine[], catalogue: CatalogueItem[]) => lines.map((line) => {
  const matched = catalogueMatchForOrderLine(line, catalogue);
  return matched
    ? { ...line, sku: matched.sku, product: `${matched.sku} · ${catalogueName(matched)}` }
    : line;
});
const productCategories = ["Candles", "Paper Banner", "Ribbon", "Metal & Paper stands", "Cake crown", "Crown & Tiaras", "Led candles", "Balloon pump", "Goggles /LED Goggles", "Caps", "Paper Sets /Props", "Cake topper", "Party popper", "Party items"] as const;
const categoryImages: Record<(typeof productCategories)[number], string> = {
  "Party popper": "https://gbcosmos.com/wp-content/uploads/2026/09/Party_Poppers.png",
  "Candles": "https://gbcosmos.com/wp-content/uploads/2026/09/candles-1.webp",
  "Cake topper": "https://gbcosmos.com/wp-content/uploads/2026/09/Caketoppers.webp",
  "Caps": "https://gbcosmos.com/wp-content/uploads/2026/09/caps.webp",
  "Paper Banner": "https://gbcosmos.com/wp-content/uploads/2026/09/Paper_Banner.webp",
  "Goggles /LED Goggles": "https://gbcosmos.com/wp-content/uploads/2026/09/Goggles-LED-Goggles.webp",
  "Led candles": "https://gbcosmos.com/wp-content/uploads/2026/09/LED_candles.webp",
  "Cake crown": "https://gbcosmos.com/wp-content/uploads/2026/09/cakecrown.webp",
  "Balloon pump": "https://gbcosmos.com/wp-content/uploads/2026/09/Balloon-Pumps.webp",
  "Metal & Paper stands": "https://gbcosmos.com/wp-content/uploads/2026/09/Metal-Paper-stands.webp",
  "Ribbon": "https://gbcosmos.com/wp-content/uploads/2026/09/Ribbon.webp",
  "Crown & Tiaras": "https://gbcosmos.com/wp-content/uploads/2026/09/Crown-Tiaras.webp",
  "Paper Sets /Props": "https://gbcosmos.com/wp-content/uploads/2026/09/Papersets_props.webp",
  "Party items": "https://gbcosmos.com/wp-content/uploads/2026/09/Party_items.webp",
};
// Curated from the live GeeBee public catalogue.  The key ignores spaces and
// punctuation, so AB 621, AB-621 and AB621 resolve to the same category.
const websiteSkuCategories = [
  ["Party popper", "AB 30 METALLIC|AB 30-FANCY / PVC|AB 30|AB 40 METALLIC|FANCY|AB 40- FANCY / DISPLAY|AB 40|AB 50|AB 60|AB BAT POPPER"],
  ["Candles", "AB 225|AB 226|AB 227|AB 228|AB 229|AB 230|AB 231|AB 232|AB 205|AB 213|AB 203|AB 212"],
  ["Cake topper", "AB 612|AB 613|AB 610|AB 611|AB 601|AB 602|AB 603|AB 604|AB 605|AB 606|AB 621|AB 622"],
  ["Caps", "AB 442|AB 449|AB 447|AB 445|AB 441|AB 448|AB 446|AB 444|AB 451|AB 450|ABC 801|AB 472"],
  ["Paper Banner", "AB 309|AB 321|AB 302|AB 375|AB 374|AB 307|AB 376|AB 352|AB 353|AB 303|AB 314|AB 351"],
  ["Goggles /LED Goggles", "AB 985|AB 983|AB 982|AB 984|AB 991|AB 992|AB 993|AB 994|AB 995|AB 981|AB 988"],
  ["Led candles", "AB 852|AB 853|AB 854|AB 855|AB 861|AB 871|AB 881|AB 863|AB 873|AB 883|AB 865|AB 875"],
  ["Cake crown", "AB 823|AB 821|AB 822"],
  ["Balloon pump", "AB 972|AB 971|AB 973|AB 975|AB 976"],
  ["Metal & Paper stands", "AB 945|AB 946|AB 947|AB 941|AB 944"],
  ["Ribbon", "AB 903|AB 902|AB 901"],
  ["Crown & Tiaras", "AB 831|AB 832|AB 833|AB 834|AB 835|AB 836|AB 837|AB 838"],
  ["Paper Sets /Props", "AB 514|AB 552|AB 506|AB 554|AB 558|AB 510|AB 553|AB 507|AB 513|AB 509|AB 508|AB 512"],
  ["Party items", "AB 385|AB 386|AB 387|AB 951|AB 952|AB 953|AB 954|AB 955|AB 961|AB 956|AB 957|AB 958"],
] as const;
const websiteCategoryBySku = new Map(websiteSkuCategories.flatMap(([category, skus]) => skus.split("|").map((sku) => [skuKey(sku), category] as const)));
const categoriseProduct = (item: Pick<CatalogueItem, "name" | "description" | "category" | "sku">) => {
  const officialCategory = websiteCategoryBySku.get(skuKey(item.sku || ""));
  if (officialCategory) return officialCategory;
  // Party items was the old import default. Re-check it from the product name
  // so imported candles, toppers and banners do not remain in the catch-all.
  if ((productCategories as readonly string[]).includes(item.category) && item.category !== "Party items") return item.category;
  const text = `${item.name || ""} ${item.description || ""}`.toLowerCase();
  if (/(led|electric).*(candle)|candle.*(led|electric)/.test(text)) return "Led candles";
  if (text.includes("candle")) return "Candles";
  if (text.includes("banner")) return "Paper Banner";
  if (text.includes("ribbon")) return "Ribbon";
  if (text.includes("stand")) return "Metal & Paper stands";
  if (text.includes("cake crown")) return "Cake crown";
  if (text.includes("crown") || text.includes("tiara")) return "Crown & Tiaras";
  if (text.includes("balloon pump") || text.includes("pump")) return "Balloon pump";
  if (text.includes("goggle")) return "Goggles /LED Goggles";
  if (/\bcap\b|\bcaps\b/.test(text)) return "Caps";
  if (text.includes("topper")) return "Cake topper";
  if (text.includes("popper")) return "Party popper";
  if (text.includes("paper") || text.includes("prop")) return "Paper Sets /Props";
  return "Party items";
};
const nextOrderNumber = () => `GB-${Date.now().toString().slice(-8)}`;
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csvDownload = (name: string, headers: string[], rows: unknown[][]) => { const blob = new Blob([[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); };
const readCsv = async (file: File) => { const text = await file.text(); const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false; for (let index = 0; index < text.length; index += 1) { const character = text[index]; if (character === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted; } else if (character === "," && !quoted) { row.push(cell.trim()); cell = ""; } else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && text[index + 1] === "\n") index += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; } else cell += character; } row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); const headers = (rows.shift() || []).map((header) => header.trim().toLowerCase()); return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))); };
const csvNumber = (value: string) => Number(value.replaceAll(",", "")) || 0;
const parseInternalOrderSheet = (raw: string): InternalOrderSheet | null => {
  const lines = raw.replace(/\r/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const headerAt = lines.findIndex((line) => /\bitem\b/i.test(line) && /\b(?:quantity|qty)\b/i.test(line) && /\bprice\b/i.test(line));
  // A continuation image often begins straight with product rows, without the
  // blue/yellow header. It is still a valid page of the same internal order.
  const rowsStart = headerAt < 0 ? 0 : headerAt + 1;
  const dateLineIndex = lines.findIndex((line) => /\bdate\b/i.test(line));
  const dateText = lines.slice(0, headerAt).join(" ").match(/date\s*[-: ]*([0-3]?\d[.\/-][01]?\d[.\/-](?:20)?\d{2})/i)?.[1];
  let eta = "";
  if (dateText) { const [day, month, year] = dateText.split(/[.\/-]/); eta = `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`; }
  const client = headerAt < 0 ? "" : cleanSheetClient(lines[dateLineIndex + 1] || "") || lines.slice(0, headerAt).map(cleanSheetClient).filter(Boolean).filter((line) => !/^[A-Z]$/.test(line)).at(-1) || "";
  const products: ProductLine[] = [];
  const trailing: string[] = [];
  for (const line of lines.slice(rowsStart)) {
    if (/\btotal\b/i.test(line)) { const beforeTotal = line.replace(/\btotal\b.*$/i, "").trim(); if (beforeTotal && !/^\d[\d,.]*$/.test(beforeTotal)) trailing.push(beforeTotal); break; }
    const match = line.match(/^(.+?)\s+([\d,]+)\s+([\d,.]+)(?:\s+[\d,.]+)?(?:\s+(.*))?$/i);
    const sku = match ? extractSheetSku(match[1]) : "";
    if (!match || !sku) continue;
    products.push({ product: "", sku, quantity: Number(match[2].replaceAll(",", "")) || 0, unitPrice: Number(match[3].replaceAll(",", "")) || 0 });
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
  const readCell = async (x: number, y: number, width: number, height: number, numeric = false, highContrast = false) => {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: numeric ? "0123456789.," : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,&.:-" });
    const canvas = document.createElement("canvas"); const zoom = 5; canvas.width = width * zoom; canvas.height = height * zoom;
    const context = canvas.getContext("2d"); if (!context) return ""; context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, x, y, width, height, 0, 0, canvas.width, canvas.height);
    if (highContrast) { const imageData = context.getImageData(0, 0, canvas.width, canvas.height); for (let index = 0; index < imageData.data.length; index += 4) { const dark = imageData.data[index] + imageData.data[index + 1] + imageData.data[index + 2] < 550; imageData.data[index] = imageData.data[index + 1] = imageData.data[index + 2] = dark ? 0 : 255; } context.putImageData(imageData, 0, 0); }
    const { data } = await worker.recognize(canvas); return data.text.replace(/\s+/g, " ").trim();
  };
  try {
    const x = source.width / 591; let y = source.height / 1253;
    // Do not rely on the screenshot being exported at exactly the same height.
    // The yellow ITEM / QUANTITY / PRICE header is the stable marker in every
    // GeeBee sheet, so find it first and then read the rows beneath it.
    const marker = document.createElement("canvas"); marker.width = source.width; marker.height = source.height;
    const markerContext = marker.getContext("2d"); markerContext?.drawImage(source, 0, 0);
    let headerTopYellow = 0; let headerBottom = 0; let strongestYellow = 0; let gridLeft = 44 * x; let gridRight = 529 * x;
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
        if (yellowPixels >= 16) { if (!headerTopYellow) headerTopYellow = row; headerBottom = row; }
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
        const at = (row * source.width + column) * 4; const red = pixels?.[at] ?? 255; const green = pixels?.[at + 1] ?? 255; const blue = pixels?.[at + 2] ?? 255;
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
      const yellowTopLine = gridLines.filter((line) => line <= headerTopYellow + 3).at(-1) || headerTopYellow;
      const clientTopLine = gridLines.filter((line) => line < yellowTopLine - 2).at(-1) || Math.max(0, yellowTopLine - 40 * headerScale);
      const dateTopLine = gridLines.filter((line) => line < clientTopLine - 2).at(-1) || Math.max(0, clientTopLine - 40 * headerScale);
      const dateRead = await readCell(tableLeft + (tableRight - tableLeft) * .12, dateTopLine + 2, (tableRight - tableLeft) * .82, Math.max(12, clientTopLine - dateTopLine - 4));
      const clientHeight = Math.max(14, yellowTopLine - clientTopLine - 3);
      const clientReads = await Promise.all([-2, 0, 2].map((offset) => readCell(tableLeft + (tableRight - tableLeft) * .025, Math.max(0, clientTopLine + offset), (tableRight - tableLeft) * .95, clientHeight, false, true)));
      gridClient = clientReads.map(cleanSheetClient).filter(Boolean).sort((a, b) => b.replace(/[^a-z]/gi, "").length - a.replace(/[^a-z]/gi, "").length)[0] || "";
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
        // Read only the two source fields the CRM needs: quantity and price.
        // Line value and the order total are calculated by the CRM itself.
        // A second pass across the two numeric cells recovers values when a
        // vertical grid border interferes with a single-cell OCR pass.
        const rowNumbers = (await readCell(tableLeft + cellWidth, top, cellWidth * 2, height, true)).match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
        // Grid borders can hide the first or final character of a SKU. Take a
        // few nearby crops, retaining the longest valid code; catalogue
        // matching below still refuses ambiguous codes.
        const skuCandidates = [skuText];
        for (const shift of [-3, 3]) skuCandidates.push(await readCell(tableLeft, Math.max(0, top + shift), cellWidth, height));
        const skuMatch = skuCandidates.map(extractSheetSku).filter(Boolean).sort((a, b) => skuKey(b).length - skuKey(a).length)[0]; const quantity = Number(quantityText.replace(/[^\d]/g, "")) || rowNumbers[0] || 0;
        if (skuMatch && quantity) {
          blanks = 0;
          gridProducts.push({ product: "", sku: skuMatch, quantity, unitPrice: 0 });
          continue;
        }
        const rowText = await readCell(tableLeft, top, cellWidth * 4, height);
        // The transporter is written in the cells before TOTAL. Some vendors
        // use a name such as "New KRC", so do not require the word Transport.
        if ((/\btransport\b|\btotal\b/i.test(rowText)) && gridProducts.length) transporter = rowText.replace(/\btotal\b.*$/i, "").replace(/[^a-z0-9 &.-]/gi, "").replace(/\s+/g, " ").trim();
        if (gridProducts.length) { blanks += 1; if (blanks >= 2) break; }
      }
      if (gridProducts.length) return { client: cleanSheetClient(gridClient), eta: gridEta, products: gridProducts, note: "GeeBee grid order sheet", transporter: transporter || undefined };
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
        const match = extractSheetSku(skuText); const quantity = Number(quantityText.replace(/[^\d]/g, ""));
        if (!match || !quantity) { blanks += 1; if (blanks >= 3) break; continue; }
        blanks = 0;
        continuationProducts.push({ product: "", sku: match, quantity, unitPrice: 0 });
      }
      const transportTop = continuationProducts.length * continuationRow;
      const transportRead = continuationProducts.length ? await readCell(0, transportTop, continuationWidth * 4, continuationRow - 1) : "";
      const transporter = /\btransport\b|\btotal\b/i.test(transportRead) ? transportRead.replace(/\btotal\b.*$/i, "").replace(/[^a-z0-9 &.-]/gi, "").replace(/\s+/g, " ").trim() : "";
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
    const clientReads = await Promise.all([-28, -22, -16, -10, -4].map((offset) => readCell(gridLeft + gridWidth * .085, Math.max(0, headerTop + offset * y), gridWidth * .8, 25 * y)));
    const client = clientReads.map(cleanSheetClient).filter(Boolean).sort((a, b) => b.replace(/[^a-z]/gi, "").length - a.replace(/[^a-z]/gi, "").length)[0] || "";
    const dateText = dateRead.match(/([0-3]?\d[.\/-][01]?\d[.\/-](?:20)?\d{2})/)?.[1];
    let eta = ""; if (dateText) { const [day, month, year] = dateText.split(/[.\/-]/); eta = `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`; }
    const products: ProductLine[] = []; let blankRows = 0;
    for (let row = 0; row < 100; row += 1) {
      const top = rowStart + row * 21 * y;
      // A little vertical overlap makes this resilient to WhatsApp/iPhone
      // screenshots whose grid line is one or two pixels higher or lower.
      let sku = await readCell(gridLeft, top - 2 * y, columnWidth, 24 * y);
      let quantityText = await readCell(gridLeft + columnWidth, top - 2 * y, columnWidth, 24 * y, true);
      let skuMatch = extractSheetSku(sku); let quantity = Number(quantityText.replace(/[^\d]/g, ""));
      // The final handwritten/phone-screenshot row commonly sits closest to a
      // gridline. Retry only an unreadable row with two nearby crops rather
      // than silently dropping it.
      // Always take a few nearby reads and retain the SKU with the most
      // characters. This prevents AB-203 being shortened to AB-20 when a
      // gridline sits across the final digit.
      const skuCandidates = skuMatch ? [skuMatch] : [];
      for (const shift of [-7, -3, 4, 7]) {
        const retrySku = await readCell(gridLeft, top + shift * y, columnWidth, 21 * y);
        const candidateSku = extractSheetSku(retrySku);
        if (candidateSku) skuCandidates.push(candidateSku);
      }
      if (skuCandidates.length) { skuMatch = skuCandidates.sort((a, b) => skuKey(b).length - skuKey(a).length)[0]; }
      if (!skuMatch || !quantity) {
        for (const shift of [-6, 4]) {
          const retrySku = await readCell(gridLeft, top + shift * y, columnWidth, 21 * y);
          const retryQuantity = await readCell(gridLeft + columnWidth, top + shift * y, columnWidth, 21 * y, true);
          const candidateSku = extractSheetSku(retrySku); const candidateQuantity = Number(retryQuantity.replace(/[^\d]/g, ""));
          if (candidateSku && candidateQuantity) { sku = retrySku; quantityText = retryQuantity; skuMatch = candidateSku; quantity = candidateQuantity; break; }
        }
      }
      if (!skuMatch || !quantity) { blankRows += 1; if (blankRows >= 4) break; continue; }
      blankRows = 0;
      products.push({ product: "", sku: skuMatch, quantity, unitPrice: 0 });
    }
    // The row immediately after the product lines has the transporter merged
    // across the left-hand cells, followed by TOTAL on the right.
    const transporterRead = products.length ? await readCell(gridLeft, rowStart + products.length * 21 * y - 2 * y, columnWidth * 4, 24 * y) : "";
    const transporter = /\btransport\b|\btotal\b/i.test(transporterRead) ? transporterRead.replace(/\b(?:total|remarks?)\b.*$/i, "").replace(/[^a-z0-9 &.-]/gi, "").replace(/\s+/g, " ").trim() : "";
    return products.length ? { client: cleanSheetClient(client), eta, products, note: "GeeBee internal order sheet", transporter: transporter || undefined } : null;
  } finally { await worker.terminate(); URL.revokeObjectURL(source.src); }
};
const storageKey = "geebee-crm-data-v1";
type SavedCrmData = { orders: Order[]; clients: Client[]; invoices: Invoice[]; catalogue: CatalogueItem[]; leads: Lead[]; quotes: Quote[]; tasks: SalesTask[]; transporters: Transporter[]; suppliers: Supplier[]; purchases: PurchaseOrder[] };
const loadCrmData = (): SavedCrmData => {
  // Products / SKUs are never recovered from old browser state. The current
  // Stock Master is the only source loaded after sign-in.
  // Never show demo information in a real workspace. Until the cloud read
  // completes, each business area is intentionally empty.
  const fallback = { orders: [] as Order[], clients: [] as Client[], invoices: [] as Invoice[], catalogue: [] as CatalogueItem[], leads: [] as Lead[], quotes: [] as Quote[], tasks: [] as SalesTask[], transporters: [] as Transporter[], suppliers: [] as Supplier[], purchases: [] as PurchaseOrder[] };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as Partial<SavedCrmData>;
    // Permanently discard the retired browser catalogue cache. It could
    // otherwise briefly appear before the current Stock Master loads.
    if ("catalogue" in parsed) {
      delete parsed.catalogue;
      window.localStorage.setItem(storageKey, JSON.stringify(parsed));
    }
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders : fallback.orders,
      clients: Array.isArray(parsed.clients) ? parsed.clients : fallback.clients,
      invoices: Array.isArray(parsed.invoices) ? parsed.invoices : fallback.invoices,
      catalogue: fallback.catalogue,
      leads: Array.isArray(parsed.leads) ? parsed.leads : fallback.leads,
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : fallback.quotes,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : fallback.tasks,
      transporters: Array.isArray(parsed.transporters) ? parsed.transporters : fallback.transporters,
      suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : fallback.suppliers,
      purchases: Array.isArray(parsed.purchases) ? parsed.purchases : fallback.purchases,
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
function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="auth-screen">
    <section className="auth-showcase" aria-label="GeeBee CRM">
      <img src="/brand/geebee-logo-transparent.png" alt="GeeBee — The Party Factory" />
      <div className="auth-showcase-copy">
        <span>WHOLESALE PARTY PRODUCTS</span>
        <h1>Manage your party business, beautifully.</h1>
        <p>Orders, customers, stock, dispatch and payments — all in one GeeBee workspace.</p>
      </div>
      <div className="auth-confetti one"/><div className="auth-confetti two"/><div className="auth-confetti three"/>
      <div className="auth-orb one"/><div className="auth-orb two"/>
    </section>
    <section className="auth-panel"><div className="auth-card">{children}</div></section>
  </main>;
}
function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.8 12.23c0-.72-.06-1.24-.2-1.79H12v3.66h5.64c-.11.91-.72 2.28-2.08 3.2l-.02.12 3.02 2.34.21.02c1.93-1.78 3.03-4.4 3.03-7.55Z"/><path fill="#34A853" d="M12 22c2.76 0 5.08-.91 6.77-2.47l-3.22-2.49c-.86.6-2.01 1.02-3.55 1.02-2.7 0-5-1.78-5.82-4.24l-.11.01-3.14 2.43-.04.11A10.23 10.23 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.18 13.82A6.15 6.15 0 0 1 5.85 12c0-.64.12-1.27.32-1.82v-.13L2.99 7.6l-.1.05A10.22 10.22 0 0 0 1.8 12c0 1.55.37 3.02 1.09 4.35l3.29-2.53Z"/><path fill="#EA4335" d="M12 5.94c1.94 0 3.25.84 4 1.55l2.92-2.85C17.07 2.92 14.76 2 12 2a10.23 10.23 0 0 0-9.11 5.65l3.29 2.53C7 7.72 9.3 5.94 12 5.94Z"/></svg>;
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
  const signInWithGoogle = async () => {
    if (!supabase) return;
    setSending(true); setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) { setSending(false); setMessage(error.message.includes("provider") ? "Google sign-in has not been enabled in Supabase yet. Complete the Google setup steps below, then try again." : error.message); }
  };
  return <AuthLayout>
    <span className="overline">GEEBEE CRM</span>
    <h1>{mode === "signin" ? "Welcome back!" : "Create your account"}</h1>
    <p>{mode === "signin" ? "Sign in to your GeeBee operations workspace." : "Your administrator will approve workspace access after sign-up."}</p>
    <div className="auth-tabs"><button className={mode === "signin" ? "active" : ""} type="button" onClick={() => { setMode("signin"); setMessage(""); }}>Sign in</button><button className={mode === "signup" ? "active" : ""} type="button" onClick={() => { setMode("signup"); setMessage(""); }}>Sign up</button></div>
    <button className="google-auth" type="button" disabled={sending} onClick={signInWithGoogle}><GoogleMark/>Continue with Google</button>
    <div className="auth-divider"><i/>or use email<i/></div>
    {mode === "signup" && <><label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" autoComplete="name"/></label><label>Phone number<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" autoComplete="tel"/></label></>}
    <label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendMagicLink()} placeholder="you@company.com" autoComplete="email"/></label>
    <button className="primary auth-submit" type="button" disabled={sending} onClick={sendMagicLink}>{sending ? "Connecting…" : mode === "signup" ? "Create account and send link" : "Send secure sign-in link"}</button>
    {message && <div className={message.toLowerCase().includes("sent") ? "auth-message" : "auth-message warning"}>{message}</div>}
    <small>Only GeeBee-approved users can open the CRM.</small>
  </AuthLayout>;
}
function SharedAccessScreen({ notice = "" }: { notice?: string }) {
  const [message, setMessage] = useState(notice);
  const [loading, setLoading] = useState(false);
  const signInWithGoogle = async () => {
    if (!supabase || loading) return;
    setLoading(true); setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) { setLoading(false); setMessage(error.message.includes("provider") ? "Google sign-in has not been enabled in Supabase yet. Complete the Google setup steps, then try again." : error.message); }
  };
  return <AuthLayout>
    <span className="overline">GEEBEE CRM</span>
    <h1>Welcome back!</h1>
    <p>Use your authorised GeeBee Google account to securely enter the workspace.</p>
    <button className="google-auth" type="button" disabled={loading} onClick={signInWithGoogle}><GoogleMark/>Continue with Google</button>
    {message && <div className="auth-message warning">{message}</div>}
    <small>Your account must be approved by a GeeBee administrator.</small>
  </AuthLayout>;
}
export default function Home() {
  const [section, setSection] = useState("Overview"),
    [sectionSearches, setSectionSearches] = useState<Record<string, string>>({}),
    [orders, setOrders] = useState<Order[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [invoices, setInvoices] = useState<Invoice[]>([]),
    [catalogue, setCatalogue] = useState<CatalogueItem[]>([]),
    [catalogueHydrated, setCatalogueHydrated] = useState(false),
    [leads, setLeads] = useState<Lead[]>([]),
    [quotes, setQuotes] = useState<Quote[]>([]),
    [tasks, setTasks] = useState<SalesTask[]>([]),
    [transporters, setTransporters] = useState<Transporter[]>([]),
    [suppliers, setSuppliers] = useState<Supplier[]>([]),
    [purchases, setPurchases] = useState<PurchaseOrder[]>([]),
    [storageReady, setStorageReady] = useState(false),
    [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(false),
    [workspaceAccessReady, setWorkspaceAccessReady] = useState(false),
    [cloudReady, setCloudReady] = useState(false),
    [cloudError, setCloudError] = useState(""),
    [accessNotice, setAccessNotice] = useState(""),
    [workspaceOwnerId, setWorkspaceOwnerId] = useState<string | null>(null),
    [allowedModules, setAllowedModules] = useState<string[]>(allModuleTokens()),
    [isAdmin, setIsAdmin] = useState(false),
    [members, setMembers] = useState<WorkspaceMember[]>([]),
    [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]),
    [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]),
    [inventoryLedger, setInventoryLedger] = useState<InventoryLedgerEntry[]>([]),
    [clientProfile, setClientProfile] = useState<Client | null>(null),
    [catalogueAttentionOnly, setCatalogueAttentionOnly] = useState(false),
    [notificationsOpen, setNotificationsOpen] = useState(false),
    [shortcutsOpen, setShortcutsOpen] = useState(false),
    [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ Customers: true, "Leads & Enquiries": true, Sales: true, Products: true, Inventory: true, Operations: true, Billing: true, Imports: true, Reports: true, Automation: true, Settings: true }),
    [modal, setModal] = useState<"order" | "orderView" | "orderDetails" | "client" | "invoice" | "catalogue" | "lead" | "quote" | "task" | "transporter" | "supplier" | "purchase" | "purchaseView" | "purchaseReceive" | null>(null),
    [editing, setEditing] = useState<any>(null),
    [toast, setToast] = useState("");
  const [stageTransitionJobs, setStageTransitionJobs] = useState<StageTransitionJob[]>([]);
  const [transitionStatusOpen, setTransitionStatusOpen] = useState(false);
  const [productPoLoading, setProductPoLoading] = useState(false);
  const [dashboardClock, setDashboardClock] = useState<number | null>(null);
  useEffect(() => {
    const refreshClock = () => setDashboardClock(Date.now());
    refreshClock();
    const timer = window.setInterval(refreshClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const dashboardGreeting = useMemo(() => {
    if (!dashboardClock) return "Welcome";
    const hour = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(new Date(dashboardClock)));
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, [dashboardClock]);
  const search = sectionSearches[section] || "";
  const setSearch = (value: string) => setSectionSearches((current) => ({ ...current, [section]: value }));
  const searchInputRef = useRef<HTMLInputElement>(null);
  const recordSnapshots = useRef<Record<string, Map<string, string>>>({});
  const inventorySnapshots = useRef<Map<string, string>>(new Map());
  // Customer records are business-critical.  They may only be removed from
  // the cloud after an explicit delete action, never because a browser has
  // briefly loaded an empty/stale client array while a Sheet import is running.
  const explicitCloudDeletes = useRef<Record<string, Set<string>>>({});
  const markForCloudDeletion = (table: string, ids: Array<string | number>) => {
    const marked = explicitCloudDeletes.current[table] || new Set<string>();
    ids.forEach((id) => marked.add(String(id)));
    explicitCloudDeletes.current[table] = marked;
  };
  const sheetSyncTimer = useRef<number | null>(null);
  const sheetBackupInFlight = useRef(false);
  const sheetBackupPending = useRef(false);
  const workspaceDataSnapshot = useRef<string | null>(null);
  const pendingStockMovementAudits = useRef<Array<{ orderId: string; direction: ProductStockMovement["direction"]; lines: ProductStockMovement[] }>>([]);
  // Dispatch and reversal wait for both the inventory ledger and Stock Master.
  // Keep the lock until the complete action finishes, not merely until render.
  const orderTransitionLocks = useRef<Set<string>>(new Set());
  const beginOrderTransition = (stage: "confirm" | "dispatch" | "reverse", orderId: string) => {
    const key = `${stage}:${orderId}`;
    if (orderTransitionLocks.current.has(key)) return false;
    orderTransitionLocks.current.add(key);
    window.setTimeout(() => orderTransitionLocks.current.delete(key), 60_000);
    return true;
  };
  const endOrderTransition = (stage: "confirm" | "dispatch" | "reverse", orderId: string) => orderTransitionLocks.current.delete(`${stage}:${orderId}`);
  const updateStageTransitionJob = (id: string, direction: StageTransitionJob["direction"], state: StageTransitionJob["state"], message: string) => {
    setStageTransitionJobs((current) => {
      const next = [{ id, direction, state, message, startedAt: current.find((job) => job.id === id && job.direction === direction)?.startedAt || Date.now() }, ...current.filter((job) => !(job.id === id && job.direction === direction))];
      const cToD = next.filter((job) => job.direction === "CtoD").slice(0, 5);
      const dToC = next.filter((job) => job.direction === "DtoC").slice(0, 5);
      return [...cToD, ...dToC].sort((a, b) => b.startedAt - a.startedAt);
    });
  };
  const flash = (m: string) => {
      setToast(m);
      setTimeout(() => setToast(""), 2600);
    },
    show = (k: "order" | "orderView" | "orderDetails" | "client" | "invoice" | "catalogue" | "lead" | "quote" | "task" | "transporter" | "supplier" | "purchase" | "purchaseView" | "purchaseReceive", d?: any) => {
      setEditing(d || null);
      setModal(k);
    };
  useEffect(() => {
    const openOrder = (event: Event) => show("orderDetails", (event as CustomEvent<Order>).detail);
    const openPurchase = (event: Event) => show("purchaseView", (event as CustomEvent<PurchaseOrder>).detail);
    window.addEventListener("geebee:view-order", openOrder);
    window.addEventListener("geebee:view-purchase", openPurchase);
    return () => {
      window.removeEventListener("geebee:view-order", openOrder);
      window.removeEventListener("geebee:view-purchase", openPurchase);
    };
  }, []);
  const refreshPanel = () => {
    // A full refresh re-reads the cloud workspace and the current Product / SKU
    // Stock Master without asking the user to use browser controls.
    window.location.reload();
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        setEditing(null);
        setClientProfile(null);
        setNotificationsOpen(false);
        setShortcutsOpen(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      if (isTyping || modal || clientProfile) return;
      if ((event.metaKey || event.ctrlKey) && event.code === "KeyK") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.shiftKey && event.code === "Slash") {
        event.preventDefault();
        setShortcutsOpen((current) => !current);
        return;
      }
      if (event.altKey === false || event.ctrlKey || event.metaKey) return;
      if (event.code === "KeyO") { event.preventDefault(); show("order"); }
      if (event.code === "KeyC") { event.preventDefault(); show("client"); }
      if (event.code === "KeyT") { event.preventDefault(); show("task"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, clientProfile]);
  // The scheduled backup remains a safety net. Live mirrors are batched and
  // throttled so a series of CRM saves cannot exceed Google Sheets' per-user
  // write quota. The most recent pending change is always mirrored next.
  const queueGoogleSheetLiveBackup = () => {
    if (!session?.access_token || typeof window === "undefined") return;
    if (sheetSyncTimer.current) window.clearTimeout(sheetSyncTimer.current);
    sheetSyncTimer.current = window.setTimeout(() => {
      if (sheetBackupInFlight.current) { sheetBackupPending.current = true; return; }
      sheetBackupInFlight.current = true;
      fetch("/api/backup/google-sheets?mode=live", { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((response) => { if (!response.ok) console.warn("Live Google Sheet backup was not completed."); })
        .catch(() => console.warn("Live Google Sheet backup was not completed."))
        .finally(() => {
          sheetBackupInFlight.current = false;
          if (sheetBackupPending.current) { sheetBackupPending.current = false; queueGoogleSheetLiveBackup(); }
        });
    }, 12000);
  };
  // Existing delete actions use this name; all now feed the same live mirror.
  const syncGoogleSheetAfterDelete = queueGoogleSheetLiveBackup;
  const updateLeadStage = (id: string, status: LeadStage) => {
    const lead = leads.find((item) => item.id === id); if (!lead) return;
    let lostReason = lead.lostReason;
    if (status === "Lost") { lostReason = window.prompt(`Lost reason (${lostReasons.join(", ")}):`, lead.lostReason || "")?.trim() || "Other"; }
    setLeads((current) => current.map((item) => item.id === id ? { ...item, status, lostReason } : item));
    if (["Contacted", "Requirement Received", "Quotation Sent", "Negotiation"].includes(status)) {
      const title = `${status}: ${lead.company}`;
      setTasks((current) => current.some((task) => task.relatedTo === id && task.title === title && task.status === "Open") ? current : [...current, { id: `TASK-${Date.now()}`, title, time: "10:00", dueDate: new Date().toISOString().slice(0, 10), assignee: lead.salesperson || "Unassigned", type: "Follow-up", status: "Open", relatedTo: id }]);
    }
    if (status === "Order Created") {
      setClients((current) => current.some((client) => client.name.trim().toLowerCase() === lead.company.trim().toLowerCase()) ? current : [...current, { id: Date.now(), customerId: `GB-C${String(Date.now()).slice(-4)}`, name: lead.company, city: lead.city, contact: lead.contact, phone: lead.mobile, credit: "", customerStatus: "Prospect", avatar: initials(lead.company), specialRates: [] }]);
      setOrders((current) => current.some((order) => order.client === lead.company && order.status === "Draft") ? current : [...current, { id: nextOrderNumber(), client: lead.company, city: lead.city, product: "", sku: "", quantity: 0, unitPrice: 0, products: [], eta: lead.expectedDate || "", status: "Draft", payment: "Partial", avatar: initials(lead.company) }]);
    }
    logActivity(status === "Lost" ? "Marked enquiry lost" : "Updated enquiry stage", "Enquiries", `${id} → ${status}${lostReason ? ` · ${lostReason}` : ""}`);
    flash(status === "Order Created" ? `${lead.company} added to Customers and a draft order was created.` : status === "Lost" ? `Enquiry moved to Lost Leads: ${lostReason}.` : `Enquiry moved to ${status}; follow-up created where required.`);
  };
  const logActivity = (action: string, module: string, details: string) => {
    // A hard-deleted order must leave no ID-bearing audit record behind. The
    // deletion action is deliberately not logged; a newly fetched order with
    // the same ID therefore begins with a completely fresh history.
    if (action === "Hard deleted orders from sheet") return;
    const cloud = supabase;
    if (!cloud || !workspaceOwnerId || !session?.user.email) return;
    const event = { id: Date.now(), workspace_owner_id: workspaceOwnerId, actor_email: session.user.email, action, module, details, created_at: new Date().toISOString() };
    setAuditEvents((current) => [event, ...current].slice(0, 100));
    cloud.from("crm_audit_events").insert({ workspace_owner_id: event.workspace_owner_id, actor_email: event.actor_email, action, module, details }).then(({ error }) => { if (error) console.warn("Could not record activity", error.message); });
  };
  const deleteOrderHistory = async (orderIds: string[]) => {
    if (!session?.access_token || !orderIds.length) return;
    try {
      const response = await fetch("/api/admin/delete-order-history", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; deletedAuditIds?: number[]; error?: string };
      if (!response.ok || !result.ok) {
        flash(result.error || "The order was deleted, but its history could not be cleared from the activity log.");
        return;
      }
      const deleted = new Set((result.deletedAuditIds || []).map(Number));
      if (deleted.size) setAuditEvents((current) => current.filter((event) => !deleted.has(Number(event.id))));
    } catch {
      flash("The order was deleted, but its history could not be cleared from the activity log.");
    }
  };
  useEffect(() => {
    const saved = loadCrmData();
    setOrders(saved.orders); setClients(saved.clients); setInvoices(saved.invoices); setCatalogue([]); setLeads(saved.leads); setQuotes(saved.quotes); setTasks(saved.tasks); setTransporters(saved.transporters); setSuppliers(saved.suppliers); setPurchases(saved.purchases);
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ orders, clients, invoices, catalogue, leads, quotes, tasks, transporters, suppliers, purchases }));
  }, [orders, clients, invoices, catalogue, leads, quotes, tasks, transporters, suppliers, purchases, storageReady]);
  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setWorkspaceAccessReady(!data.session); setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => { if (event === "SIGNED_OUT") setWorkspaceAccessReady(true); setSession(nextSession); });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const cloud = supabase;
    if (!cloud || !session?.user.email) return;
    const email = session.user.email.toLowerCase();
    const draft = typeof window !== "undefined" ? window.localStorage.getItem("geebee-signup-profile") : null;
    let profile: { fullName?: string; phone?: string } = {};
    try { profile = draft ? JSON.parse(draft) : {}; } catch { /* ignore an invalid local profile */ }
    const saveProfile = cloud.from("crm_profiles").upsert({ user_id: session.user.id, email: session.user.email, full_name: profile.fullName || session.user.user_metadata?.full_name || "", phone: profile.phone || session.user.user_metadata?.phone || "" }, { onConflict: "user_id" });
    const resolveWorkspaceAccess = async () => {
      // Save this sign-in attempt before access is checked, so administrators
      // can review and approve people who are not yet workspace members.
      const { error: profileError } = await saveProfile;
      if (!profileError && draft) window.localStorage.removeItem("geebee-signup-profile");
      // A workspace owner is identified by their stable Supabase user ID, not
      // by a hard-coded email address. This allows GeeBee to change its
      // official email without ever disconnecting the stored CRM data.
      const { data: ownedWorkspace } = await cloud.from("crm_workspaces").select("owner_id").eq("owner_id", session.user.id).maybeSingle();
      if (ownedWorkspace) { setWorkspaceOwnerId(session.user.id); setAllowedModules(allModuleTokens()); setIsAdmin(true); setWorkspaceAccessReady(true); return; }
      const { data } = await cloud.from("crm_workspace_members").select("id, workspace_owner_id, email, role, modules").ilike("email", email).maybeSingle();
      if (!data) { setAccessNotice("Your access request has been sent to the GeeBee administrator. You can sign in once your account is approved."); setWorkspaceAccessReady(true); await cloud.auth.signOut(); return; }
      const member = data as WorkspaceMember; setWorkspaceOwnerId(member.workspace_owner_id); setAllowedModules(member.modules || [moduleToken("Dashboard", "view")]); setIsAdmin(member.role === "admin"); setWorkspaceAccessReady(true);
    };
    void resolveWorkspaceAccess();
  }, [session?.user.id]);
  useEffect(() => {
    const cloud = supabase;
    if (!cloud || !authReady || !session || !storageReady || !workspaceOwnerId) return;
    let cancelled = false;
    const loadScalableRecords = async () => {
      // The workspace row remains only as the access-control anchor. Business
      // records now live in their own tables and can grow independently.
      const { data: existingWorkspace, error: workspaceReadError } = await cloud.from("crm_workspaces").select("owner_id,data").eq("owner_id", workspaceOwnerId).maybeSingle();
      if (workspaceReadError || cancelled) { if (!cancelled) setCloudError("Cloud workspace is not ready yet. Please run the latest Supabase setup script."); return; }
      if (!existingWorkspace && isAdmin) {
        const { error: workspaceCreateError } = await cloud.from("crm_workspaces").upsert({ owner_id: workspaceOwnerId, data: { normalizedRecords: true }, updated_at: new Date().toISOString() });
        if (workspaceCreateError || cancelled) { if (!cancelled) setCloudError("Cloud workspace is not ready yet. Please run the latest Supabase setup script."); return; }
      }
      if (!existingWorkspace && !isAdmin) { setCloudError("Shared access could not locate the GeeBee workspace."); return; }
      // Product records carry catalogue images and are intentionally loaded a
      // moment later. That lets the dashboard become usable immediately.
      const initialTables = scalableTables.filter((config) => config.key !== "catalogue");
      const results = await Promise.all(initialTables.map(({ table }) => cloud.from(table).select("record_id, data").eq("workspace_owner_id", workspaceOwnerId).order("updated_at", { ascending: false }).limit(50000)));
      if (cancelled) return;
      const failed = results.find((result) => result.error);
      if (failed?.error) { setCloudError("Database upgrade required: run the latest scalable CRM SQL script in Supabase, then refresh this page."); return; }
      const records = Object.fromEntries(initialTables.map((config, index) => [config.key, (results[index].data || []) as ScalableRecord[]])) as Record<string, ScalableRecord[]>;
      const toItems = <T,>(key: string) => (records[key] || []).map((row) => row.data as T);
      if (records.clients?.length || records.orders?.length || records.invoices?.length || records.leads?.length || records.quotes?.length || records.tasks?.length || records.transporters?.length) {
        const loadedOrders = toItems<Order>("orders");
        const currentOrderIds = new Set(loadedOrders.map((order) => order.id));
        const loadedInvoices = toItems<Invoice>("invoices").filter((invoice) => !invoice.order || currentOrderIds.has(invoice.order));
        setClients(toItems<Client>("clients")); setOrders(loadedOrders); setInvoices(loadedInvoices); setLeads(toItems<Lead>("leads")); setQuotes(toItems<Quote>("quotes")); setTasks(toItems<SalesTask>("tasks")); setTransporters(toItems<Transporter>("transporters"));
        recordSnapshots.current = Object.fromEntries(initialTables.map((config) => [config.table, new Map((records[config.key] || []).map((row) => [row.record_id, JSON.stringify(row.data)]))]));
      } else {
        // An intentionally empty cloud workspace must win over a stale browser
        // cache. This prevents old data being uploaded again after a reset.
        setClients([]); setOrders([]); setInvoices([]); setLeads([]); setQuotes([]); setTasks([]); setTransporters([]);
        recordSnapshots.current = {};
      }
      const workspaceData = existingWorkspace?.data as { purchases?: PurchaseOrder[]; suppliers?: Supplier[] } | null;
      const loadedPurchases = Array.isArray(workspaceData?.purchases) ? workspaceData.purchases : [];
      const loadedSuppliers = Array.isArray(workspaceData?.suppliers) ? workspaceData.suppliers : [];
      // Establish the initial cloud state before the workspace persistence
      // effect starts. This prevents a browser opening the CRM from writing a
      // blank purchases/suppliers set back to the backup Sheet.
      workspaceDataSnapshot.current = JSON.stringify({ purchases: loadedPurchases, suppliers: loadedSuppliers });
      setPurchases(loadedPurchases);
      setSuppliers(loadedSuppliers);
      setCloudError(""); setCloudReady(true);
    };
    loadScalableRecords();
    return () => { cancelled = true; };
  }, [authReady, session, storageReady, workspaceOwnerId, isAdmin]);
  useEffect(() => {
    if (!cloudReady || !session?.access_token || catalogueHydrated) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/import/google-product-master", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Product / SKU master could not be loaded.");
        if (cancelled) return;
        const products = (result.products || []) as CatalogueItem[];
        inventorySnapshots.current = new Map(products.map((product) => [String(product.id), JSON.stringify({ availableQuantity: product.availableQuantity, reservedStock: product.reservedStock || 0 })]));
        setCatalogue(products.map((product) => ({ ...product, name: catalogueName(product) })));
        setCatalogueHydrated(true);
      } catch (error) {
        if (!cancelled) setCloudError(error instanceof Error ? error.message : "Product / SKU master could not be loaded.");
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [cloudReady, session?.access_token, catalogueHydrated]);
  useEffect(() => {
    if (!cloudReady || !session?.access_token) return;
    let cancelled = false;
    fetch("/api/inventory/ledger", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async (response) => ({ response, result: await response.json().catch(() => ({})) }))
      .then(({ response, result }) => {
        // A workspace that has not run the one-time ledger SQL setup keeps
        // operating normally; dispatch is deliberately blocked until setup
        // exists rather than falling back to the older unsafe calculation.
        if (!response.ok || cancelled) return;
        setInventoryLedger(Array.isArray(result.ledger) ? result.ledger : []);
      })
      .catch(() => { /* The movement action gives the clear setup error. */ });
    return () => { cancelled = true; };
  }, [cloudReady, session?.access_token]);
  useEffect(() => {
    // Dispatch changes product stock in the dedicated Product / SKU table.
    // Persist only the quantities that actually changed, after the initial
    // product master load has established the baseline.
    if (!cloudReady || !catalogueHydrated || !session?.access_token) return;
    const next = new Map(catalogue.map((product) => [String(product.id), JSON.stringify({ availableQuantity: availableStock(product), reservedStock: product.reservedStock || 0 })]));
    const changed = catalogue.filter((product) => inventorySnapshots.current.get(String(product.id)) !== next.get(String(product.id)));
    if (!changed.length) return;
    const timer = window.setTimeout(async () => {
      const movementsForThisSave = [...pendingStockMovementAudits.current];
      // A Confirmed order changes only the CRM reservation. It must never
      // write a cached available balance back to Stock Master, because someone
      // may have updated that Sheet since the last CRM sync. Only a real stock
      // movement (Dispatch, reversal, PO receipt/deletion) writes the Sheet.
      const response = await fetch("/api/import/google-product-master", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ stockUpdates: changed.map((product) => {
        const previous = inventorySnapshots.current.get(String(product.id));
        let previousAvailable: number | undefined;
        try { previousAvailable = previous ? JSON.parse(previous).availableQuantity : undefined; } catch { previousAvailable = undefined; }
        return { id: product.id, availableQuantity: availableStock(product), reservedStock: product.reservedStock || 0, writeToSheet: previousAvailable === undefined || previousAvailable !== availableStock(product) };
      }) }) });
      if (!response.ok) { const result = await response.json().catch(() => ({})); setCloudError(result.error || "Dispatch stock movement could not be saved to Product / SKU inventory."); return; }
      inventorySnapshots.current = next;
      // Only commit the audit after both the Stock Master write and CRM stock
      // update succeeded. A failed Sheet write therefore never creates a
      // misleading "deducted" history entry.
      pendingStockMovementAudits.current = pendingStockMovementAudits.current.filter((movement) => !movementsForThisSave.includes(movement));
      movementsForThisSave.forEach((movement) => logActivity("Recorded Product / SKU stock movement", "Products", JSON.stringify(movement)));
      queueGoogleSheetLiveBackup();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [catalogue, catalogueHydrated, cloudReady, session?.access_token]);
  useEffect(() => {
    // The verified Product / SKU Stock Master has replaced the legacy product
    // table. Retire that old table once, only after a current master exists.
    if (!isAdmin || !catalogueHydrated || !catalogue.length || !session?.access_token || !workspaceOwnerId) return;
    const key = `geebee-retired-legacy-catalogue:${workspaceOwnerId}`;
    if (window.localStorage.getItem(key)) return;
    fetch("/api/admin/retire-legacy-catalogue", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (result?.ok) window.localStorage.setItem(key, "true"); })
      .catch(() => { /* The old table is inactive; retry next sign-in if needed. */ });
  }, [isAdmin, catalogueHydrated, catalogue.length, session?.access_token, workspaceOwnerId]);
  useEffect(() => {
    if (!cloudReady) return;
    // A backorder exists only while its parent is Confirmed or further along.
    // Older releases could leave ADV records behind after the parent returned
    // to Draft. Remove those orphan records, their invoice and task safely.
    const orphanAdvanceIds = orders.filter((order) => isBackorderRecord(order) && orders.some((parent) => parent.id === order.id.replace(/^ADV-/, "") && parent.status === "Draft")).map((order) => order.id);
    if (!orphanAdvanceIds.length) return;
    const orphanSet = new Set(orphanAdvanceIds);
    markForCloudDeletion("crm_orders", orphanAdvanceIds);
    markForCloudDeletion("crm_invoices", invoices.filter((invoice) => orphanSet.has(invoice.order)).map((invoice) => invoice.id));
    markForCloudDeletion("crm_tasks", tasks.filter((task) => task.relatedTo && orphanSet.has(task.relatedTo)).map((task) => task.id));
    setOrders((current) => current.filter((order) => !orphanSet.has(order.id)));
    setInvoices((current) => current.filter((invoice) => !orphanSet.has(invoice.order)));
    setTasks((current) => current.filter((task) => !task.relatedTo || !orphanSet.has(task.relatedTo)));
  }, [orders, invoices, tasks, cloudReady]);
  useEffect(() => {
    const cloud = supabase;
    if (!cloud || !session || !cloudReady || !workspaceOwnerId) return;
    const collections: Array<{ table: string; items: any[]; search: (item: any) => string }> = [
      { table: "crm_clients", items: clients, search: scalableTables[0].search }, { table: "crm_products", items: catalogue, search: scalableTables[1].search }, { table: "crm_orders", items: orders, search: scalableTables[2].search }, { table: "crm_invoices", items: invoices, search: scalableTables[3].search }, { table: "crm_leads", items: leads, search: scalableTables[4].search }, { table: "crm_quotes", items: quotes, search: scalableTables[5].search }, { table: "crm_tasks", items: tasks, search: scalableTables[6].search }, { table: "crm_transporters", items: transporters, search: scalableTables[7].search },
    ].filter((collection) => collection.table !== "crm_products");
    const syncTimer = window.setTimeout(async () => {
      let didPersist = false;
      for (const { table, items, search } of collections) {
        const previous = recordSnapshots.current[table] || new Map<string, string>();
        const next = new Map(items.map((item) => [String(item.id), JSON.stringify(item)]));
        const changed = items.filter((item) => previous.get(String(item.id)) !== JSON.stringify(item)).map((item) => ({ workspace_owner_id: workspaceOwnerId, record_id: String(item.id), search_key: search(item).toLowerCase(), data: item, updated_at: new Date().toISOString() }));
        const removed = [...previous.keys()].filter((id) => !next.has(id));
        // A missing browser record is never enough to delete cloud data. Every
        // table needs an explicit user delete marker; this protects both the
        // CRM and the live backup Sheet from transient loading/sync glitches.
        const safeRemoved = removed.filter((id) => explicitCloudDeletes.current[table]?.has(id));
        if (changed.length) { const { error } = await cloud.from(table).upsert(changed, { onConflict: "workspace_owner_id,record_id" }); if (error) { setCloudError("A change could not be saved to the cloud. Your local copy is still safe."); return; } didPersist = true; }
        if (safeRemoved.length) { const { error } = await cloud.from(table).delete().eq("workspace_owner_id", workspaceOwnerId).in("record_id", safeRemoved); if (error) { setCloudError("A deleted record could not be synced to the cloud."); return; } safeRemoved.forEach((id) => explicitCloudDeletes.current[table]?.delete(id)); didPersist = true; }
        recordSnapshots.current[table] = next;
      }
      if (didPersist) queueGoogleSheetLiveBackup();
    }, 650);
    return () => window.clearTimeout(syncTimer);
  // Product / SKU stock is saved through its dedicated stock-master effect
  // above. Keeping it out of this general business-record sync prevents a
  // stock update from repeatedly serialising every order, client and invoice.
  }, [orders, clients, invoices, leads, quotes, tasks, transporters, session, cloudReady, workspaceOwnerId]);
  useEffect(() => {
    const cloud = supabase;
    if (!cloud || !session || !cloudReady || !workspaceOwnerId) return;
    const nextSnapshot = JSON.stringify({ purchases, suppliers });
    if (workspaceDataSnapshot.current === nextSnapshot) return;
    const timer = window.setTimeout(() => {
      cloud.from("crm_workspaces").update({ data: { normalizedRecords: true, purchases, suppliers }, updated_at: new Date().toISOString() }).eq("owner_id", workspaceOwnerId).then(({ error }) => {
        if (error) setCloudError("Purchase orders or suppliers could not be saved to the cloud. Your local copy is still safe.");
        else { workspaceDataSnapshot.current = nextSnapshot; queueGoogleSheetLiveBackup(); }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [purchases, suppliers, session, cloudReady, workspaceOwnerId]);
  useEffect(() => {
    if (!isAdmin || !session?.access_token) return;
    fetch("/api/admin/access-requests", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (Array.isArray(result?.requests)) setAccessRequests(result.requests as AccessRequest[]); if (Array.isArray(result?.members)) setMembers(result.members as WorkspaceMember[]); })
      .catch(() => { /* The access form remains available if this list cannot load. */ });
  }, [isAdmin, session?.access_token, workspaceOwnerId]);
  useEffect(() => {
    const cloud = supabase;
    if (!cloud || !isAdmin || !workspaceOwnerId) return;
    cloud.from("crm_audit_events").select("id, actor_email, action, module, details, created_at").eq("workspace_owner_id", workspaceOwnerId).order("created_at", { ascending: false }).limit(1000).then(({ data }) => setAuditEvents((data || []) as AuditEvent[]));
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
  const negativeStockProducts = catalogue.filter((product) => availableStock(product) < 0);
  const lowStockProducts = catalogue.filter((product) => (product.reorderThreshold || 0) > 0 && availableStock(product) <= (product.reorderThreshold || 0));
  const incompleteCatalogueProducts = catalogue.filter(isProductProfileIncomplete);
  const taskViewer = String(session?.user.email || "").trim().toLowerCase();
  const signedInName = String(session?.user.user_metadata?.full_name || session?.user.user_metadata?.name || session?.user.email?.split("@")[0] || "GeeBee user").trim();
  // Daily tasks are private to their creator. Administrators retain visibility
  // of the full task list for supervision.
  const visibleTasks = isAdmin ? tasks : tasks.filter((task) => task.assignee.trim().toLowerCase() === taskViewer);
  const activeTasks = visibleTasks.filter((task) => task.status === "Open");
  const receivePurchase = (purchase: PurchaseOrder) => {
    if (purchase.status === "Cancelled" || purchase.status === "Delivered") return;
    if (!purchase.lines.some((line) => Math.max(0, line.quantity - receivedPurchaseQuantity(line)) > 0)) return;
    show("purchaseReceive", purchase);
  };
  const savePurchaseReceipt = (purchase: PurchaseOrder, receivedNow: number[]) => {
    if (purchase.status === "Cancelled" || purchase.status === "Delivered") return;
    const updatedLines = purchase.lines.map((line, index) => ({ ...line, receivedQuantity: receivedPurchaseQuantity(line) + (receivedNow[index] || 0) }));
    const backorderLines = updatedLines.flatMap((line) => {
      const quantity = Math.max(0, line.quantity - receivedPurchaseQuantity(line));
      return quantity ? [{ sku: line.sku, product: line.product, quantity, receivedQuantity: 0 }] : [];
    });
    const receivedTotal = receivedNow.reduce((sum, quantity) => sum + quantity, 0);
    if (!receivedTotal) { flash("No quantity was received, so the purchase order was left unchanged."); return; }
    // Product / SKU is the live stock master. A received quantity is added to
    // the matching SKU immediately; the existing stock-sync effect persists
    // the same change to the linked Google Stock Master.
    setCatalogue((current) => current.map((product) => {
      const receivedForSku = purchase.lines.reduce((total, line, index) => total + (skuKey(line.sku) === skuKey(product.sku) ? (receivedNow[index] || 0) : 0), 0);
      return receivedForSku ? { ...product, availableQuantity: availableStock(product) + receivedForSku } : product;
    }));
    setPurchases((current) => {
      const received = { ...purchase, status: "Delivered" as const, lines: updatedLines };
      const next = current.map((item) => item.id === purchase.id ? received : item);
      if (!backorderLines.length) return next;
      const backorder: PurchaseOrder = {
        id: nextPurchaseOrderNumber(next),
        supplier: purchase.supplier,
        status: "Draft",
        expectedDate: "",
        createdAt: new Date().toISOString().slice(0, 10),
        notes: [purchase.notes, `Backorder balance from ${purchase.id}`].filter(Boolean).join(" · "),
        lines: backorderLines,
      };
      return [...next, backorder];
    });
    const backorderNote = backorderLines.length ? ` A backorder PO will be created for ${backorderLines.reduce((sum, line) => sum + line.quantity, 0).toLocaleString("en-IN")} remaining unit(s).` : "";
    logActivity("Received purchase order", "Purchase Orders", `${purchase.id} · ${receivedTotal} unit(s) received.${backorderNote}`);
    flash(`${purchase.id} received: ${receivedTotal.toLocaleString("en-IN")} unit(s) added to Product / SKUs.${backorderNote}`);
  };
  const deletePurchase = (purchase: PurchaseOrder) => {
    if (!isAdmin) { flash("Only an administrator can permanently delete a purchase order."); return; }
    const passcode = window.prompt(`Enter the delete passcode to permanently remove ${purchase.id}. Received quantities will be reversed from Product / SKUs.`);
    if (passcode !== "GeeBee2026") { flash("Incorrect delete passcode. Purchase order was not removed."); return; }
    const totalReceived = purchase.lines.reduce((total, line) => total + receivedPurchaseQuantity(line), 0);
    if (!window.confirm(`Permanently delete ${purchase.id}? ${totalReceived.toLocaleString("en-IN")} received unit(s) will be removed from inventory.`)) return;
    setCatalogue((current) => current.map((product) => {
      const receivedForSku = purchase.lines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((total, line) => total + receivedPurchaseQuantity(line), 0);
      return receivedForSku ? { ...product, availableQuantity: Math.max(0, availableStock(product) - receivedForSku) } : product;
    }));
    setPurchases((current) => current.filter((item) => item.id !== purchase.id));
    logActivity("Deleted purchase order and reversed received inventory", "Purchase Orders", `${purchase.id} · ${totalReceived} unit(s) reversed`);
    queueGoogleSheetLiveBackup();
    flash(`${purchase.id} permanently deleted. Its received stock was reversed from Product / SKUs.`);
  };
  const fetchProductPurchaseOrders = async () => {
    if (!session?.access_token || productPoLoading) return;
    setProductPoLoading(true);
    try {
      const response = await fetch("/api/import/google-product-purchase-orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Could not fetch Product POs.");
      if (Array.isArray(result?.purchases)) setPurchases(result.purchases as PurchaseOrder[]);
      const unmatched = Array.isArray(result?.unmatched) ? result.unmatched : [];
      const imported = Number(result?.imported || 0);
      const updated = Number(result?.updated || 0);
      if (imported > 0 || updated > 0) {
        logActivity("Fetched Product POs from Google Sheet", "Purchase Orders", `${imported} new PO(s) · ${updated} updated PO(s)${unmatched.length ? ` · ${unmatched.length} unmatched SKU(s)` : ""}`);
        flash(`${imported ? `${imported} Product PO${imported === 1 ? "" : "s"} imported` : ""}${imported && updated ? "; " : ""}${updated ? `${updated} existing draft PO${updated === 1 ? "" : "s"} updated` : ""}.${unmatched.length ? ` ${unmatched.length} SKU${unmatched.length === 1 ? "" : "s"} need mapping.` : ""}`);
      } else {
        flash(`No new Product POs found.${unmatched.length ? ` Unmatched SKUs: ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? "…" : ""}` : ""}`);
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not fetch Product POs.");
    } finally {
      setProductPoLoading(false);
    }
  };
  const cancelOrder = async (order: Order) => {
    if (!window.confirm(`Cancel ${order.id}? Its allocated stock will be released back to available inventory.`)) return;
    const isAdvance = order.status === "Advance order";
    const primaryId = isAdvance ? order.id.replace(/^ADV-/, "") : order.id;
    const advanceId = `ADV-${primaryId}`;
    const primaryOrder = orders.find((item) => item.id === primaryId);
    const advanceOrder = orders.find((item) => item.id === advanceId);
    const confirmedLines = !isAdvance && primaryOrder?.status === "Confirmed" ? (primaryOrder.approvedProducts || linesFor(primaryOrder)) : [];
    const committedLines = !isAdvance && primaryOrder?.inventoryCommitted ? (primaryOrder.dispatchStockLines?.length ? primaryOrder.dispatchStockLines : linesFor(primaryOrder)) : [];
    if (!isAdvance && primaryOrder?.inventoryCommitted) {
      const dispatchTransactionId = primaryOrder.inventoryDispatchTransactionId;
      if (!dispatchTransactionId) { flash(`${primaryOrder.id} was dispatched before the inventory ledger was installed, so it cannot be safely cancelled automatically.`); return; }
      try {
        await applyInventoryLedgerTransaction({
          transactionId: `cancel-reversal:${dispatchTransactionId}`,
          referenceTransactionId: dispatchTransactionId,
          order: primaryOrder,
          transactionType: "Reversal",
          lines: committedLines,
        });
      } catch (error) {
        flash(error instanceof Error ? error.message : "Stock could not be returned. The order was not cancelled.");
        return;
      }
    }
    setCatalogue((current) => current.map((product) => {
      const reserved = confirmedLines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((sum, line) => sum + line.quantity, 0);
      if (!reserved) return product;
      return { ...product, reservedStock: Math.max(0, (product.reservedStock || 0) - reserved) };
    }));
    const cancelledIds = isAdvance ? [order.id] : [primaryId, advanceId];
    setOrders((current) => current.map((item) => {
      if (isAdvance && item.id === primaryId && !isFulfilmentOrder(primaryOrder)) {
        // Until the main order reaches fulfilment, its saved shortage mirror
        // must disappear when the linked backorder is cancelled.
        return { ...item, backorders: [] };
      }
      if (!cancelledIds.includes(item.id)) return item;
      const cancelledFromStage = ["Draft", "Confirmed", "Dispatch plan", "Sent to customer", "Received by customer"].includes(item.status) ? item.status as NonNullable<Order["cancelledFromStage"]> : item.cancelledFromStage;
      return { ...item, status: "Cancelled", cancelledFromDispatch: ["Dispatch plan", "Sent to customer", "Received by customer"].includes(item.status), cancelledFromStage, inventoryCommitted: item.id === primaryId && item.inventoryCommitted ? false : item.inventoryCommitted, inventoryReversalTransactionId: item.id === primaryId && item.inventoryDispatchTransactionId ? `cancel-reversal:${item.inventoryDispatchTransactionId}` : item.inventoryReversalTransactionId, dispatchReversedAt: item.id === primaryId && item.inventoryCommitted ? new Date().toISOString() : item.dispatchReversedAt };
    }));
    setInvoices((current) => current.map((invoice) => cancelledIds.includes(invoice.order) ? { ...invoice, status: "Cancelled" } : invoice));
    logActivity("Cancelled order and released stock", "Orders", cancelledIds.join(", "));
    flash(`Cancelled ${order.id}; stock allocation released.`);
  };
  const removeOrders = async (ids: string[]) => {
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
    // A dispatched order has already changed physical stock.  Reverse that
    // exact saved dispatch snapshot through the ledger before removing the
    // record, so Dispatch Plan and Fulfilment deletes can never strand stock.
    const dispatchedOrders = [...primaryIds]
      .map((id) => orders.find((item) => item.id === id))
      .filter((order): order is Order => Boolean(order?.inventoryCommitted));
    try {
      for (const order of dispatchedOrders) {
        const dispatchTransactionId = order.inventoryDispatchTransactionId;
        if (!dispatchTransactionId) throw new Error(`${order.id} was dispatched before the inventory ledger was installed, so it cannot be safely deleted automatically.`);
        const dispatchedLines = order.dispatchStockLines?.length ? order.dispatchStockLines : linesFor(order);
        if (!dispatchedLines.length) throw new Error(`${order.id} has no saved dispatch quantities to restore.`);
        await applyInventoryLedgerTransaction({
          transactionId: `delete-reversal:${dispatchTransactionId}`,
          referenceTransactionId: dispatchTransactionId,
          order,
          transactionType: "Reversal",
          lines: dispatchedLines,
        });
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : "Stock could not be returned. The order was not deleted.");
      return;
    }
    markForCloudDeletion("crm_orders", [...removedIds]);
    markForCloudDeletion("crm_invoices", invoices.filter((invoice) => removedIds.has(invoice.order)).map((invoice) => invoice.id));
    markForCloudDeletion("crm_tasks", tasks.filter((task) => task.relatedTo && removedIds.has(task.relatedTo)).map((task) => task.id));
    const activeBackorderParents = new Set([...advanceIds]
      .map((id) => id.replace(/^ADV-/, ""))
      .filter((id) => !primaryIds.has(id) && !isFulfilmentOrder(orders.find((item) => item.id === id))));
    const confirmedLines = [...primaryIds].flatMap((id) => {
      const order = orders.find((item) => item.id === id);
      return order?.status === "Confirmed" ? (order.approvedProducts || linesFor(order)) : [];
    });
    const committedLines = [...primaryIds].flatMap((id) => {
      const order = orders.find((item) => item.id === id);
      return order?.inventoryCommitted ? (order.dispatchStockLines?.length ? order.dispatchStockLines : linesFor(order)) : [];
    });
    setCatalogue((current) => current.map((product) => {
      const reserved = confirmedLines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((sum, line) => sum + line.quantity, 0);
      // Physical stock was restored above by the SKU ledger.  Only a still
      // confirmed order has a reservation left to release locally.
      if (!reserved) return product;
      return { ...product, reservedStock: Math.max(0, (product.reservedStock || 0) - reserved) };
    }));
    setOrders((current) => current
      .filter((item) => !removedIds.has(item.id))
      .map((item) => activeBackorderParents.has(item.id) ? { ...item, backorders: [] } : item));
    setInvoices((current) => current.filter((invoice) => !removedIds.has(invoice.order)));
    setTasks((current) => current.filter((task) => !task.relatedTo || !removedIds.has(task.relatedTo)));
    // A hard delete means the order must disappear from every audit view too:
    // order timeline, product history, stock movement history and notifications.
    // Do not create a replacement activity row containing its ID.
    const historyIds = [...removedIds];
    void deleteOrderHistory(historyIds);
    // Include an audit insert that may still be completing from the same UI
    // action (for example a bulk Sheet hard-delete activity entry).
    window.setTimeout(() => { void deleteOrderHistory(historyIds); }, 1200);
    queueGoogleSheetLiveBackup();
    flash(`${ids.length} order${ids.length === 1 ? "" : "s"} removed; linked backorders, invoices and stock allocations were removed safely too.`);
  };
  const returnConfirmedToOrders = (order: Order) => {
    if (order.status !== "Confirmed") return;
    if (!window.confirm(`Return ${order.id} to Orders? Its reserved inventory and any backorder allocation will be released.`)) return;
    const advanceId = `ADV-${order.id}`;
    const shortageLines = order.backorders?.length ? order.backorders : (orders.find((item) => item.id === advanceId)?.products || []);
    const confirmedLines = linesFor(order);
    // Current confirmations retain the original customer requirement
    // separately, so returning to Draft restores it without duplicating any
    // line that was manually over-allocated. Keep the fallback for older
    // records created before requestedProducts existed.
    const restoredLines = order.requestedProducts?.length ? order.requestedProducts : (order.confirmedIncludesBackorderQuantity ? confirmedLines : [...confirmedLines, ...shortageLines]);
    const advanceInvoiceIds = invoices.filter((invoice) => invoice.order === advanceId).map((invoice) => invoice.id);
    const advanceTaskIds = tasks.filter((task) => task.relatedTo === advanceId).map((task) => task.id);
    // Returning the main order to Draft absorbs its shortage lines back into
    // that draft. The linked ADV record is no longer a separate business
    // record, so remove it from the cloud as well as the current screen.
    markForCloudDeletion("crm_orders", [advanceId]);
    markForCloudDeletion("crm_invoices", advanceInvoiceIds);
    markForCloudDeletion("crm_tasks", advanceTaskIds);
    setCatalogue((current) => current.map((product) => {
      const released = confirmedLines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((sum, line) => sum + line.quantity, 0);
      return !released ? product : { ...product, reservedStock: Math.max(0, (product.reservedStock || 0) - released) };
    }));
    const first = restoredLines[0] || { product: "", sku: "", quantity: 0, unitPrice: 0 };
    setOrders((current) => current.filter((item) => item.id !== advanceId).map((item) => item.id === order.id ? { ...item, ...first, products: restoredLines, requestedProducts: restoredLines, approvedProducts: undefined, backorders: undefined, confirmedIncludesBackorderQuantity: undefined, clientApproval: undefined, status: "Draft", inventoryCommitted: false } : item));
    setInvoices((current) => current.filter((invoice) => invoice.order !== advanceId));
    setTasks((current) => current.filter((task) => task.relatedTo !== advanceId));
    const confirmationReference = order.confirmationSequence ? `Confirmation #${order.confirmationSequence}` : "No confirmation number";
    logActivity("Confirmed order returned to Draft", "Orders", `${order.id} · ${confirmationReference} sent back to Orders`);
    flash(`${order.id} (${confirmationReference}) returned to Orders. Its linked backorder and related records were removed, and all stock reservation was released.`);
  };
  const applyInventoryLedgerTransaction = async ({
    transactionId,
    referenceTransactionId,
    order,
    transactionType,
    lines,
    allowNegativeSkus = [],
  }: {
    transactionId: string;
    referenceTransactionId?: string;
    order: Order;
    transactionType: "Dispatch" | "Reversal";
    lines: ProductLine[];
    allowNegativeSkus?: string[];
  }) => {
    if (!session?.access_token) throw new Error("Sign in again before moving inventory.");
    const grouped = new Map<string, ProductLine>();
    canonicaliseCatalogueOrderLines(lines, catalogue).forEach((line) => {
      // Ledger identity is intentionally exact apart from case/outer spaces:
      // AB 204, AB 204 1 and AB-204-1 can never share a balance.
      const sku = line.sku.trim().toUpperCase();
      const prior = grouped.get(sku);
      grouped.set(sku, prior ? { ...prior, quantity: prior.quantity + line.quantity } : { ...line, sku });
    });
    const response = await fetch("/api/inventory/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        transactionId,
        referenceTransactionId,
        orderId: order.id,
        transactionType,
        lines: [...grouped.values()].map((line) => ({ sku: line.sku, quantity: line.quantity })),
        allowNegativeSkus: allowNegativeSkus.map((sku) => sku.trim().toUpperCase()),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Inventory movement could not be recorded.");
    const products = (result.products || []) as CatalogueItem[];
    // Ledger and CRM stock are committed before this response. The Stock
    // Master mirror is now a durable background task, so Dispatch/Return is
    // not held up by Google Sheets but still exposes any pending Sheet sync.
    if (products.length) {
      const byId = new Map(products.map((product) => [String(product.id), product]));
      products.forEach((product) => inventorySnapshots.current.set(String(product.id), JSON.stringify({ availableQuantity: availableStock(product), reservedStock: product.reservedStock || 0 })));
      setCatalogue((current) => current.map((product) => byId.has(String(product.id)) ? { ...product, ...byId.get(String(product.id)) } : product));
    }
    const movements = (result.movements || []) as InventoryLedgerEntry[];
    if (movements.length) {
      setInventoryLedger((current) => {
        const next = new Map(current.map((entry) => [String(entry.id), entry]));
        movements.forEach((entry) => next.set(String(entry.id), entry));
        return [...next.values()].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id - b.id);
      });
    }
    return movements;
  };
  const returnDispatchToConfirmed = async (order: Order) => {
    if (order.status !== "Dispatch plan") return;
    if (order.dispatchReversedAt) { flash(`${order.id} has already had its dispatch stock returned once. No stock was changed.`); return; }
    if (!window.confirm(`Return ${order.id} to Confirmed Orders? Its dispatched quantity will be restored to available stock and reserved again.`)) return;
    const lines = linesFor(order);
    // Never infer a reversal from freshly synced stock or from an editable
    // order line. Restore only the exact quantities deducted at dispatch.
    const dispatchedSnapshot = order.dispatchStockLines?.length ? order.dispatchStockLines : lines;
    const first = lines[0] || { product: "", sku: "", quantity: 0, unitPrice: 0 };
    const restoredBySku = new Map<string, ProductLine>();
    dispatchedSnapshot.forEach((line) => { const key = skuKey(line.sku); const prior = restoredBySku.get(key); restoredBySku.set(key, prior ? { ...prior, quantity: prior.quantity + line.quantity } : { ...line }); });
    const dispatchTransactionId = order.inventoryDispatchTransactionId;
    if (order.inventoryCommitted && !dispatchTransactionId) {
      flash(`${order.id} was dispatched before the new SKU ledger started. Its current balance is the opening balance, so it cannot be automatically reversed. Review it once and create a new confirmed order if stock must be moved.`);
      return;
    }
    if (!beginOrderTransition("reverse", order.id)) { flash(`${order.id} is already returning to Confirmed Orders. Please wait.`); return; }
    updateStageTransitionJob(order.id, "DtoC", "running", "Returning from Dispatch Plan to Confirmed Orders");
    flash(`${order.id}: reversing inventory and updating Stock Master…`);
    const reversalTransactionId = order.inventoryReversalTransactionId || `reversal:${dispatchTransactionId}`;
    try {
      if (order.inventoryCommitted) await applyInventoryLedgerTransaction({
        transactionId: reversalTransactionId,
        referenceTransactionId: dispatchTransactionId,
        order,
        transactionType: "Reversal",
        lines: [...restoredBySku.values()],
      });
    } catch (error) {
      endOrderTransition("reverse", order.id);
      updateStageTransitionJob(order.id, "DtoC", "error", error instanceof Error ? error.message : "Could not return order. It remains in Dispatch Plan.");
      flash(error instanceof Error ? error.message : "Dispatch reversal could not be saved.");
      return;
    }
    const restoredQuantity = dispatchedSnapshot.reduce((sum, line) => sum + line.quantity, 0);
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, ...first, products: lines, approvedProducts: lines, status: "Confirmed", inventoryCommitted: false, inventoryReversalTransactionId: reversalTransactionId, dispatchReversedAt: new Date().toISOString() } : item));
    logActivity("Returned dispatch order to Confirmed Orders", "Dispatch Plan", `${order.id} · restored ${restoredQuantity.toLocaleString("en-IN")} unit(s) from saved dispatch quantity`);
    endOrderTransition("reverse", order.id);
    updateStageTransitionJob(order.id, "DtoC", "success", "Returned to Confirmed Orders");
    flash(`${order.id} returned to Confirmed Orders. Exactly ${restoredQuantity.toLocaleString("en-IN")} dispatched unit(s) were added back through the SKU ledger.`);
  };
  const markOrderSentToCustomer = (order: Order) => {
    if (order.status !== "Dispatch plan") return;
    if (!window.confirm(`Mark ${order.id} as sent to ${order.client}?`)) return;
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: "Sent to customer" } : item));
    logActivity("Order sent to customer", "Fulfilment", `${order.id} · ${order.client}`);
    flash(`${order.id} is now marked as sent to customer.`);
  };
  const initialiseOpeningStock = async (quantity = 10000) => {
    if (!supabase || !session) return;
    const response = await fetch("/api/admin/initialize-opening-stock", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ quantity }) });
    const result = await response.json() as { ok?: boolean; updated?: number; error?: string };
    if (!response.ok || !result.ok) { flash(result.error || "Opening stock could not be updated."); return; }
    setCatalogue((current) => current.map((item) => ({ ...item, availableQuantity: quantity, openingStock: 0, purchasedStock: 0, orderedStock: 0, damagedStock: 0, reservedStock: 0 })));
    window.localStorage.setItem(`geebee-available-stock-${quantity}-v3`, "true");
    logActivity("Reset demo inventory", "Catalogue", `${result.updated || 0} products set to ${quantity.toLocaleString("en-IN")} available units`);
    flash(`Demo inventory reset: ${result.updated || 0} products now have ${quantity.toLocaleString("en-IN")} available units.`);
  };
  const releaseAllReservations = () => {
    if (!window.confirm("Release all Product / SKU reservations? Use this only after confirming there are no active reservations.")) return;
    setCatalogue((current) => current.map((product) => ({ ...product, reservedStock: 0 })));
    logActivity("Released all product reservations", "Products", "Admin reset after stock review");
    flash("All Product / SKU reservations were released. Available Stock was not changed.");
  };
  const confirmOrder = (order: Order) => {
    if (order.status !== "Draft" || isBackorderRecord(order)) return;
    if (!catalogueHydrated) { flash("Product / SKU inventory is still loading. Please wait a moment, then confirm the order again."); return; }
    const mixExpansion = expandNumberCandleMixLines(linesFor(order), catalogue);
    if (mixExpansion.error) { flash(mixExpansion.error); return; }
    const requestedLines = canonicaliseCatalogueOrderLines(mixExpansion.lines, catalogue);
    if (!requestedLines.length) { flash("Add at least one product line before confirming this order."); return; }
    const missingSkus = [...new Set(requestedLines.filter((line) => !catalogue.some((product) => skuKey(product.sku) === skuKey(line.sku))).map((line) => line.sku || line.product))];
    if (missingSkus.length) { flash(`Cannot confirm ${order.id}: ${missingSkus.join(", ")} is not in Product / SKUs. Add it to the Stock Master first.`); return; }
    if (!window.confirm(`Confirm ${order.id}? CRM will reserve Sheet stock now and shortages will be made into backorders.`)) return;
    if (!beginOrderTransition("confirm", order.id)) { flash(`${order.id} is already being confirmed. Please wait.`); return; }
    const editedQuantityKeys = new Set(order.draftEditedQuantityKeys || (order.sourceSheetOrderId ? [] : requestedLines.map(draftQuantityLineKey)));
    const { confirmed: confirmedLines, shortages } = confirmationAllocationFor(requestedLines, order.id, orders, catalogue, editedQuantityKeys);
    const firstDispatch = confirmedLines[0] || requestedLines[0] || { product: order.product, sku: order.sku, quantity: 0, unitPrice: order.unitPrice };
    const advanceOrder = shortages.length ? { ...order, id: `ADV-${order.id}`, product: shortages[0].product, sku: shortages[0].sku, quantity: shortages[0].quantity, unitPrice: shortages[0].unitPrice, products: shortages, status: "Advance order", payment: "Partial" } : null;
    setCatalogue((current) => current.map((product) => {
      const confirmedQuantity = confirmedLines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((sum, line) => sum + line.quantity, 0);
      // An unchanged sheet line reserves only actual free stock. A manually
      // edited Qty may reserve its whole new figure, intentionally showing a
      // negative Free balance for the matching backorder.
      if (!confirmedQuantity) return product;
      const liveReserved = confirmedReservationsForSku(orders, product.sku).reduce((total, entry) => total + entry.quantity, 0);
      return { ...product, reservedStock: liveReserved + confirmedQuantity };
    }));
    // Allocate a confirmation number once. If the order was returned to Draft,
    // reuse its earlier number instead of creating a second reference.
    const nextConfirmationSequence = order.confirmationSequence || (Math.max(0, ...orders.map((item) => item.confirmationSequence || 0)) + 1);
    const confirmedOrder: Order = { ...order, confirmationSequence: nextConfirmationSequence, product: firstDispatch.product, sku: firstDispatch.sku, quantity: firstDispatch.quantity, unitPrice: firstDispatch.unitPrice, products: confirmedLines, approvedProducts: confirmedLines, requestedProducts: requestedLines, status: "Confirmed", backorders: shortages, confirmedIncludesBackorderQuantity: confirmedLines.some((line) => editedQuantityKeys.has(draftQuantityLineKey(line))) };
    setOrders((current) => [...current.filter((item) => item.id !== order.id && item.id !== `ADV-${order.id}`), confirmedOrder, ...(advanceOrder ? [advanceOrder] : [])]);
    if (advanceOrder) {
      const advanceAmount = shortages.reduce((total, line) => total + line.quantity * line.unitPrice, 0);
      setInvoices((current) => [...current.filter((invoice) => invoice.order !== advanceOrder.id), { id: advanceOrder.id, client: order.client, order: advanceOrder.id, amount: money(advanceAmount), due: "Advance payment", status: "Partial" }]);
      setTasks((current) => [...current.filter((task) => task.relatedTo !== advanceOrder.id), { id: `TASK-${Date.now()}`, title: `Arrange future dispatch for advance order ${advanceOrder.id}`, time: "10:00", dueDate: new Date().toISOString().slice(0, 10), assignee: "Rahul", type: "Follow-up", status: "Open", relatedTo: advanceOrder.id }]);
    }
    // Confirmation is the start of the product-level order history. The
    // record stays with the SKU even after the order moves through Dispatch
    // Plan and Fulfilment, so the product card always explains its journey.
    logActivity("Recorded confirmed order product change", "Products", JSON.stringify({
      orderId: order.id,
      client: order.client,
      changes: confirmedLines.map((line) => ({ sku: line.sku, product: line.product, change: "Confirmed", before: 0, after: line.quantity })),
    }));
    logActivity("Confirmed order and reserved inventory", "Orders", shortages.length ? `${order.id} · Confirmation #${nextConfirmationSequence} · ${shortages.length} shortage line(s) moved to backorder` : `${order.id} · Confirmation #${nextConfirmationSequence}`);
    const fullyShortLines = shortages.filter((shortage) => shortage.quantity === (requestedLines.find((line) => skuKey(line.sku) === skuKey(shortage.sku))?.quantity || 0));
    endOrderTransition("confirm", order.id);
    flash(shortages.length ? `${order.id} confirmed; CRM reserved Sheet stock and created a backorder.${fullyShortLines.length ? ` No free stock was available for: ${fullyShortLines.map((line) => line.sku).join(", ")}.` : ""}` : `${order.id} confirmed and CRM stock reserved.`);
  };
  const pushToDispatchPlan = async (order: Order) => {
    if (order.status !== "Confirmed") return;
    // Current confirmations already store MIX orders as their component SKUs.
    // Re-expand here as well so an older confirmed order that still contains
    // AB-204 MIX / AB-205 MIX can never be sent to Dispatch as one virtual
    // SKU. Dispatch must always deduct AB-204-0…9 or AB-205-0…9 directly.
    const requestedExpansion = expandNumberCandleMixLines(linesFor(order), catalogue);
    if (requestedExpansion.error) {
      flash(requestedExpansion.error || "The MIX order could not be expanded into numbered candle SKUs.");
      return;
    }
    const requestedLines = canonicaliseCatalogueOrderLines(requestedExpansion.lines, catalogue);
    if (!requestedLines.length) { flash(`${order.id} has no stock allocated for dispatch. Its full quantity is currently in Backorders.`); return; }
    const approvedLines = requestedLines;
    // The final visible lines in Confirmed Orders are the only dispatch
    // source of truth. Do not compare them with an older approved snapshot:
    // that was able to send a prior quantity (E-486: 1,000) after the user
    // had correctly saved a later quantity (1,500).
    const dispatchLines = requestedLines.map((line) => ({ ...line }));
    const releasedLines: ProductLine[] = [];
    const summariseBySku = (lines: ProductLine[]) => {
      const summary = new Map<string, ProductLine>();
      lines.forEach((line) => {
        const key = skuKey(line.sku);
        const prior = summary.get(key);
        summary.set(key, prior ? { ...prior, quantity: prior.quantity + line.quantity } : { ...line });
      });
      return summary;
    };
    if (!window.confirm(`Send ${order.id} to Dispatch Plan? Any quantity reduced by Operations will be released from CRM reservation.`)) return;
    if (!beginOrderTransition("dispatch", order.id)) { flash(`${order.id} is already being sent to Dispatch Plan. Please wait.`); return; }
    updateStageTransitionJob(order.id, "CtoD", "running", "Moving from Confirmed to Dispatch Plan");
    flash(`${order.id}: recording inventory and updating Stock Master…`);
    const dispatchedBySku = summariseBySku(dispatchLines);
    const nextDispatchCycle = (order.inventoryDispatchCycle || 0) + 1;
    const dispatchTransactionId = order.inventoryDispatchTransactionId && !order.dispatchReversedAt
      ? order.inventoryDispatchTransactionId
      : `dispatch:${order.id}:${nextDispatchCycle}`;
    const editedKeys = new Set(order.draftEditedQuantityKeys || []);
    const allowNegativeSkus = dispatchLines.filter((line) => editedKeys.has(draftQuantityLineKey(line))).map((line) => line.sku);
    try {
      await applyInventoryLedgerTransaction({
        transactionId: dispatchTransactionId,
        order,
        transactionType: "Dispatch",
        lines: [...dispatchedBySku.values()],
        allowNegativeSkus,
      });
    } catch (error) {
      endOrderTransition("dispatch", order.id);
      updateStageTransitionJob(order.id, "CtoD", "error", error instanceof Error ? error.message : "Could not move order. It remains in Confirmed Orders.");
      flash(error instanceof Error ? error.message : "Dispatch stock movement could not be saved.");
      return;
    }
    // The ledger updates physical Available stock. Confirmed reservation is
    // released only after that atomic movement succeeds.
    setCatalogue((current) => current.map((product) => {
      const dispatched = dispatchLines.filter((line) => skuKey(line.sku) === skuKey(product.sku)).reduce((sum, line) => sum + line.quantity, 0);
      return dispatched ? { ...product, reservedStock: Math.max(0, (product.reservedStock || 0) - dispatched) } : product;
    }));
    const first = dispatchLines[0] || approvedLines[0];
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, product: first.product, sku: first.sku, quantity: first.quantity, unitPrice: first.unitPrice, products: dispatchLines, dispatchStockLines: dispatchLines.map((line) => ({ ...line })), inventoryDispatchTransactionId: dispatchTransactionId, inventoryDispatchCycle: nextDispatchCycle, inventoryReversalTransactionId: undefined, dispatchedAt: new Date().toISOString(), dispatchReversedAt: undefined, status: "Dispatch plan", inventoryCommitted: true } : item));
    logActivity("Sent confirmed order to Dispatch Plan", "Dispatch Plan", releasedLines.length ? `${order.id} · reduced CRM reservation released` : order.id);
    endOrderTransition("dispatch", order.id);
    updateStageTransitionJob(order.id, "CtoD", "success", "Sent to Dispatch Plan");
    flash(releasedLines.length ? `${order.id} sent to Dispatch Plan; reduced quantities were released from CRM reservation.` : `${order.id} sent to Dispatch Plan for Operations.`);
  };
  const navigationGroups = [
    { label: "Dashboard", module: "Dashboard" as CrmModule, icon: LayoutDashboard, items: [{ label: "Dashboard", section: "Overview" }] },
    { label: "Customers", module: "Customers" as CrmModule, icon: Users, items: [{ label: "All Customers", section: "Clients", count: String(clients.length) }, { label: "New Customers", section: "New Customers" }, { label: "Customer Groups", section: "Customer Groups" }, { label: "Customer Activity", section: "Customer Activity" }] },
    { label: "Enquiries", module: "Enquiries" as CrmModule, icon: Target, items: [{ label: "Enquiries", section: "Leads", count: String(leads.filter((lead) => lead.status !== "Lost" && lead.status !== "Order Created").length) }, { label: "Lost Leads", section: "Lost Leads" }] },
    { label: "Daily Tasks", module: "Daily Tasks" as CrmModule, icon: ClipboardList, items: [{ label: "Daily Tasks", section: "Follow-ups", count: String(activeTasks.length) }] },
    { label: "Sales", module: "Sales" as CrmModule, icon: BriefcaseBusiness, items: [{ label: "Orders", section: "Orders", count: String(orders.filter((order) => order.status === "Draft").length) }, { label: "Fetch Orders", section: "Fetch Orders" }, { label: "Confirmed Orders", section: "Confirmed Orders", count: String(orders.filter((order) => order.status === "Confirmed").length) }, { label: "Backorders", section: "Backorders", count: String(orders.filter(isVisibleBackorder).length) }, { label: "Returns", section: "Returns" }] },
    { label: "Products", module: "Products" as CrmModule, icon: Boxes, items: [{ label: "Products / SKUs", section: "Product Stock Inventory" }, { label: "Categories", section: "Categories" }, { label: "Price Lists", section: "Price Lists" }] },
    { label: "Inventory", module: "Inventory" as CrmModule, icon: Warehouse, items: [{ label: "Stock Overview", section: "Stock Overview" }, { label: "Stock Movements", section: "Stock Movements" }, { label: "Low Stock", section: "Low Stock" }, { label: "Reserved Stock", section: "Reserved Stock" }, { label: "Warehouses", section: "Warehouses" }] },
    { label: "Operations", module: "Operations" as CrmModule, icon: Truck, items: [{ label: "Dispatch Plan", section: "Dispatch Plan", count: String(orders.filter((order) => order.status === "Dispatch plan").length) }, { label: "Transporters", section: "Transporters", count: String(transporters.length) }, { label: "Picking", section: "Picking" }, { label: "Packing", section: "Packing" }] },
    { label: "Fulfilment", module: "Fulfilment" as CrmModule, icon: Truck, items: [{ label: "Sent to Customer", section: "Sent to Customer", count: String(orders.filter((order) => order.status === "Sent to customer").length) }] },
    { label: "Billing", module: "Billing" as CrmModule, icon: ReceiptText, items: [{ label: "Invoices", section: "Invoices", count: String(invoices.filter((i) => i.status !== "Paid").length) }, { label: "Payments", section: "Payments", count: "2" }, { label: "Outstanding", section: "Outstanding" }, { label: "Ageing", section: "Ageing" }] },
    { label: "Imports", module: "Imports" as CrmModule, icon: ShipWheel, items: [{ label: "Suppliers", section: "Suppliers", count: String(suppliers.length) }, { label: "Purchase Orders", section: "Purchase Orders", count: String(purchases.filter((purchase) => !["Delivered", "Cancelled"].includes(purchase.status)).length) }, { label: "Shipments", section: "Shipments" }, { label: "Containers", section: "Containers" }, { label: "Landed Cost", section: "Landed Cost" }] },
    { label: "Reports", module: "Reports" as CrmModule, icon: ChartNoAxesCombined, items: [{ label: "Sales", section: "Sales Report" }, { label: "Customers", section: "Customer Report" }, { label: "Products", section: "Product Report" }, { label: "Inventory", section: "Inventory Report" }, { label: "Payments", section: "Payment Report" }, { label: "Sales Team", section: "Sales Team Report" }] },
    { label: "Automation", module: "Automation" as CrmModule, icon: Bot, items: [{ label: "Rules", section: "Rules" }, { label: "Notifications", section: "Notifications" }, { label: "Templates", section: "Templates" }] },
    { label: "Settings", module: "Settings" as CrmModule, icon: Settings, items: [{ label: "Users", section: "Settings" }, { label: "Roles", section: "Settings" }, { label: "Import / Export", section: "Data Transfer" }, { label: "Data recovery", section: "Recovery" }, { label: "GST", section: "GST" }, { label: "Warehouses", section: "Warehouses" }, { label: "WhatsApp", section: "WhatsApp" }, { label: "Integrations", section: "Integrations" }] },
  ];
  const notifications = [
    // Order returns are operationally important and must not be pushed out of
    // the bell by a long list of low-stock alerts.
    ...auditEvents.filter((event) => event.action === "Confirmed order returned to Draft").slice(0, 2).map((event) => ({ title: event.action, detail: `${event.details} · ${event.actor_email}`, time: new Date(event.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) })),
    ...negativeStockProducts.map((product) => ({ title: `Negative stock: ${catalogueName(product)}`, detail: `${catalogueSku(product)} · ${availableStock(product).toLocaleString("en-IN")} available · needs stock correction`, time: "Urgent stock review" })),
    ...lowStockProducts.filter((product) => availableStock(product) >= 0).map((product) => ({ title: `Low stock: ${catalogueName(product)}`, detail: `${catalogueSku(product)} · ${availableStock(product).toLocaleString("en-IN")} available / alert at ${(product.reorderThreshold || 0).toLocaleString("en-IN")}`, time: "Create a purchase order" })),
    ...auditEvents.filter((event) => event.action !== "Confirmed order returned to Draft").slice(0, 4).map((event) => ({ title: event.action, detail: `${event.actor_email} · ${event.module}`, time: new Date(event.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) })),
    ...invoices.filter((invoice) => invoice.status !== "Paid").slice(0, 2).map((invoice) => ({ title: `${invoice.status} invoice ${invoice.id}`, detail: `${invoice.client} · ${displayMoney(invoice.amount)} due ${invoice.due}`, time: "Needs attention" })),
  ].slice(0, 6);
  const liveSections = new Set(["Overview", "Clients", "Leads", "Follow-ups", "Lost Leads", "Quotations", "Orders", "Confirmed Orders", "Dispatch Plan", "Sent to Customer", "Backorders", "Invoices", "Catalogue", "Categories", "Product Stock Inventory", "Fetch Orders", "Transporters", "Suppliers", "Purchase Orders", "Notifications", "Sales Team Report", "Sales Report", "Customer Report", "Product Report", "Inventory Report", "Payment Report", "Settings", "Recovery", "Data Transfer"]);
  const activeModule = navigationGroups.find((group) => group.items.some((item) => item.section === section))?.module || "Dashboard";
  const currentModuleAccess = isAdmin ? "edit" : memberModuleAccess(allowedModules, activeModule);
  const isViewOnly = currentModuleAccess === "view";
  const blockViewOnlyChange = (event: React.SyntheticEvent<HTMLElement>) => {
    if (!isViewOnly) return;
    const target = event.target as HTMLElement;
    if (target.closest(".search")) return;
    if (target.closest("[data-view-action]")) return;
    if (target.closest("button, input, select, textarea")) { event.preventDefault(); event.stopPropagation(); flash("You have view-only access to this module. Ask an administrator for edit access."); }
  };
  if (!authReady) return <div className="auth-screen"><div className="auth-card"><b>Opening secure workspace…</b></div></div>;
  if (!supabase) return <div className="auth-screen"><div className="auth-card"><span className="overline">GEEBEE CRM</span><h1>Cloud connection needed</h1><p>Add the Supabase environment settings to open this private workspace.</p></div></div>;
  if (session && !workspaceAccessReady) return <div className="auth-screen"><div className="auth-card"><b>Checking workspace access…</b><p>Your account is being securely verified.</p></div></div>;
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
            const permitted = group.items.filter((item) => liveSections.has(item.section) && (isAdmin || Boolean(memberModuleAccess(allowedModules, group.module))));
            if (!permitted.length) return null;
            const Icon = group.icon;
            const active = permitted.some((item) => section === item.section);
            return <div className={`nav-group ${active ? "has-active" : ""}`} key={group.label}><button className="nav-group-title" type="button" onClick={() => setExpandedGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}><Icon size={16}/><span>{group.label}</span><ChevronDown size={14} className={expandedGroups[group.label] ? "open" : ""}/></button>{expandedGroups[group.label] && <div className="nav-children">{permitted.map((item) => { const count = (item as { count?: string }).count; return <button key={`${group.label}-${item.label}`} className={section === item.section ? "active" : ""} type="button" onClick={() => setSection(item.section)}><span>{item.label}</span>{count && <em>{count}</em>}</button>; })}</div>}</div>;
          })}
        </nav>
        <div className="side-bottom">
          <div className="profile">
            <div className="avatar">{initials(signedInName)}</div>
            <div>
              <b>{signedInName}</b>
              <span>{session.user.email}</span>
              <span>{cloudReady ? "Cloud workspace synced" : "Connecting to cloud…"}</span>
            </div>
            <button className="sign-out" type="button" onClick={() => supabase?.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </aside>
      <section className="content" onClickCapture={blockViewOnlyChange} onKeyDownCapture={blockViewOnlyChange}>
        <header>
          <div className="mobile-brand">GeeBee</div>
          <div className="search">
            <Search size={18} />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${section === "Catalogue" ? "SKU or product" : section === "Clients" ? "customers" : section === "Orders" || section === "Confirmed Orders" || section === "Dispatch Plan" ? "orders" : section.toLowerCase()}...`}
            />
          </div>
          <button className="shortcut-trigger" type="button" aria-label="Open keyboard shortcuts" onClick={() => setShortcutsOpen((current) => !current)}>
            <Keyboard size={17}/><span>Shortcuts</span>
          </button>
          {(["Confirmed Orders", "Dispatch Plan"] as string[]).includes(section) && stageTransitionJobs.some((job) => job.direction === (section === "Confirmed Orders" ? "CtoD" : "DtoC")) && <button className="transfer-status-trigger" type="button" onClick={() => setTransitionStatusOpen((current) => !current)} aria-expanded={transitionStatusOpen}>
            Transfers <em>{stageTransitionJobs.filter((job) => job.direction === (section === "Confirmed Orders" ? "CtoD" : "DtoC")).length}</em>
          </button>}
          {transitionStatusOpen && (["Confirmed Orders", "Dispatch Plan"] as string[]).includes(section) && (() => {
            const direction: StageTransitionJob["direction"] = section === "Confirmed Orders" ? "CtoD" : "DtoC";
            const jobs = stageTransitionJobs.filter((job) => job.direction === direction).slice(0, 5);
            if (!jobs.length) return null;
            return <section className="stage-transition-status" aria-live="polite" aria-label="Order transfer status">
              <b>{direction === "CtoD" ? "Confirmed → Dispatch" : "Dispatch → Confirmed"}</b>
              {jobs.map((job) => {
                const completed = job.state !== "running";
                const colour = job.state === "error" ? "#c44755" : job.state === "success" ? "#24865f" : "#9b263f";
                return <div className="stage-transition-job" key={`${job.direction}-${job.id}`}>
                  <div><strong>{job.id}</strong><span>{job.state === "success" ? "Success" : job.state === "error" ? "Needs attention" : "Processing…"}</span></div>
                  <small title={job.message}>{job.message}</small>
                  <i><em style={{ width: completed ? "100%" : "62%", background: colour }} /></i>
                </div>;
              })}
            </section>;
          })()}
          <button className="icon-btn" type="button" aria-label="Refresh panel" title="Refresh panel" onClick={refreshPanel}>
            <RotateCcw size={18} />
          </button>
          <button className="icon-btn" type="button" aria-label="Open notifications" onClick={() => setNotificationsOpen((current) => !current)}>
            <Bell size={19} />
            {notifications.length > 0 && <i />}
          </button>
          {notificationsOpen && <section className="notification-popover"><div className="notification-head"><div><b>Notifications</b><span>Latest workspace updates</span></div><button type="button" onClick={() => setNotificationsOpen(false)}>Close</button></div>{notifications.length ? notifications.map((notification, index) => <article className="notification-item" key={`${notification.title}-${index}`}><span className="notification-dot"/><div><b>{notification.title}</b><p>{notification.detail}</p><small>{notification.time}</small></div></article>) : <p className="notification-empty">You are all caught up.</p>}</section>}
          {shortcutsOpen && <section className="shortcuts-popover" aria-label="Keyboard shortcuts"><div><b>Quick shortcuts</b><button type="button" onClick={() => setShortcutsOpen(false)} aria-label="Close shortcuts"><X size={16}/></button></div><p><kbd>⌘/Ctrl</kbd><kbd>K</kbd><span>Search this section</span></p><p><kbd>Alt</kbd><kbd>O</kbd><span>New order</span></p><p><kbd>Alt</kbd><kbd>C</kbd><span>New customer</span></p><p><kbd>Alt</kbd><kbd>T</kbd><span>New daily task</span></p><p><kbd>Esc</kbd><span>Close any open window</span></p><small>Shortcuts do not run while you are typing in a field.</small></section>}
          <div className="header-avatar" title={session.user.email}>{initials(signedInName)}</div>
        </header>
        {cloudError && <div className="cloud-warning">{cloudError}</div>}
        {isViewOnly && <div className="cloud-warning">View-only access: you can review this module, but only an administrator can grant permission to make changes.</div>}
        {(activeTasks.length > 0 || negativeStockProducts.length > 0 || lowStockProducts.length > 0 || incompleteCatalogueProducts.length > 0) && <div className="crm-alert-strip" role="status">{activeTasks.length > 0 && <button type="button" onClick={() => setSection("Follow-ups")}><ClipboardList size={15}/><b>{activeTasks.length} active task{activeTasks.length === 1 ? "" : "s"}</b><span>Review today’s work</span></button>}{negativeStockProducts.length > 0 && <button type="button" onClick={() => setSection("Product Stock Inventory")}><PackageCheck size={15}/><b>{negativeStockProducts.length} negative-stock SKU{negativeStockProducts.length === 1 ? "" : "s"}</b><span>Needs immediate correction</span></button>}{lowStockProducts.length > 0 && <button type="button" onClick={() => setSection("Product Stock Inventory")}><PackageCheck size={15}/><b>{lowStockProducts.length} low-stock item{lowStockProducts.length === 1 ? "" : "s"}</b><span>Review Stock Master</span></button>}{incompleteCatalogueProducts.length > 0 && <button type="button" onClick={() => { setSearch(""); setCatalogueAttentionOnly(true); setSection("Catalogue"); }}><PackageCheck size={15}/><b>{incompleteCatalogueProducts.length} incomplete product{incompleteCatalogueProducts.length === 1 ? "" : "s"}</b><span>Complete SKU details</span></button>}</div>}
        <div className="page-head">
          <div>
            <div className="eyebrow">MONDAY, 15 SEPTEMBER 2026</div>
            <h1>{section === "Overview" ? `${dashboardGreeting}, ${signedInName}` : section}</h1>
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
          {["Leads", "Lost Leads"].includes(section) && <button className="primary" onClick={() => show("lead")}><Plus size={18}/> New enquiry</button>}
          {section === "Follow-ups" && <button className="primary" onClick={() => show("task")}><Plus size={18}/> New task</button>}
          {section === "Quotations" && <button className="primary" onClick={() => show("quote")}><Plus size={18}/> New quotation</button>}
          {section === "Suppliers" && <button className="primary" onClick={() => show("supplier")}><Plus size={18}/> Add supplier</button>}
          {section === "Purchase Orders" && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {isAdmin && <button className="outline" type="button" disabled={productPoLoading} onClick={fetchProductPurchaseOrders}><Download size={17}/>{productPoLoading ? "Fetching…" : "Fetch Product POs"}</button>}
            <button className="primary" onClick={() => show("purchase")}><Plus size={18}/> New purchase order</button>
          </div>}
        </div>
        {section === "Overview" && (cloudReady ? <Overview orders={orders} clients={clients} invoices={invoices} edit={(o) => show("order", o)} all={() => setSection("Orders")} flash={flash} /> : <section className="panel empty"><b>{cloudError ? "Live CRM data could not be loaded." : "Loading live CRM data…"}</b><p>{cloudError ? "Refresh the panel after resolving the cloud connection warning above." : "Dashboard figures will appear only after the real workspace records are loaded."}</p></section>)}{" "}
        {section === "Orders" && <Orders orders={shown.filter((order) => order.status === "Draft")} cancelledOrders={shown.filter((order) => order.status === "Cancelled" && order.cancelledFromStage === "Draft")} clients={clients} edit={(o) => show("order", o)} cancel={cancelOrder} remove={isAdmin ? removeOrders : undefined} confirm={confirmOrder} />}{" "}
        {section === "Confirmed Orders" && <Orders orders={shown.filter((order) => order.status === "Confirmed" && !stageTransitionJobs.some((job) => job.id === order.id && job.direction === "CtoD" && job.state === "running"))} cancelledOrders={shown.filter((order) => order.status === "Cancelled" && order.cancelledFromStage === "Confirmed")} clients={clients} edit={(o) => show("order", o)} cancel={cancelOrder} remove={isAdmin ? removeOrders : undefined} returnToOrders={returnConfirmedToOrders} pushToDispatch={pushToDispatchPlan} sendWhatsApp={(order) => { const client = clients.find((item) => item.name.trim().toLowerCase() === order.client.trim().toLowerCase()); const groupLink = client?.whatsappGroupLink?.trim(); if (groupLink) { try { const url = new URL(groupLink); if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "chat.whatsapp.com") throw new Error("invalid"); window.open(url.toString(), "_blank", "noopener,noreferrer"); logActivity("Opened customer WhatsApp group", "Confirmed Orders", `${order.id} · ${client?.name || order.client}`); return; } catch { window.alert("The saved WhatsApp group link is not valid. Use a link beginning with https://chat.whatsapp.com/ in the customer profile."); return; } } window.open(`https://wa.me/?text=${encodeURIComponent(dispatchWhatsAppText(order))}`, "_blank", "noopener,noreferrer"); logActivity("Opened WhatsApp approval", "Confirmed Orders", `${order.id} · no customer group link saved`); }} updateApproval={(id, clientApproval) => { setOrders((current) => current.map((order) => order.id === id ? { ...order, clientApproval } : order)); logActivity("Updated client approval", "Confirmed Orders", `${id} · ${clientApproval}`); }} confirmed />}{" "}
        {section === "Dispatch Plan" && <DispatchPlanPanel orders={orders.filter((order) => (order.status === "Dispatch plan" && !stageTransitionJobs.some((job) => job.id === order.id && job.direction === "DtoC" && job.state === "running")) || (order.status === "Cancelled" && order.cancelledFromDispatch))} view={(o) => show("orderView", o)} cancel={cancelOrder} returnToConfirmed={returnDispatchToConfirmed} markSent={markOrderSentToCustomer} />}{" "}
        {section === "Sent to Customer" && <FulfilmentPanel title="Sent to customer" description="These dispatched orders have been sent to the customer. This is the final fulfilment stage in the CRM." orders={orders.filter((order) => order.status === "Sent to customer" || order.status === "Received by customer")} edit={(o) => show("order", o)} cancel={cancelOrder} remove={isAdmin ? removeOrders : undefined} />}{" "}
        {section === "Clients" && (
          <Clients
            clients={clients.filter((c) =>
              `${c.name} ${c.city} ${c.contact}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )}
            edit={(c) => show("client", c)}
            view={(c) => setClientProfile(c)}
            importCustomers={async (file) => { if (!file) return; try { const rows = await readCsv(file); const now = Date.now(); const incoming = rows.filter((row) => row["business name"]).map((row, index) => ({ id: now + index, customerId: row["customer id"] || `GB-C${now + index}`, name: row["business name"], city: row.city || "", phone: row.phone || "", contact: row["contact person"] || "", whatsappGroupLink: row["whatsapp group link"] || "", credit: row["payment threshold"] || "", paymentTerms: row["payment terms"] || "", customerStatus: row.status || "Active", avatar: initials(row["business name"]), specialRates: [] } as Client)); setClients((current) => { const incomingByName = new Map(incoming.map((client) => [client.name.toLowerCase(), client])); const existing = new Set(current.map((client) => client.name.toLowerCase())); return [...current.map((client) => incomingByName.has(client.name.toLowerCase()) ? { ...client, ...incomingByName.get(client.name.toLowerCase())!, id: client.id } : client), ...incoming.filter((client) => !existing.has(client.name.toLowerCase()))]; }); logActivity("Imported customer sheet", "Customers", `${incoming.length} customer row(s)`); flash(`${incoming.length} customer row${incoming.length === 1 ? "" : "s"} imported.`); } catch { flash("Customer import failed. Use the downloaded CSV template and keep the column headings unchanged."); } }}
            remove={(ids) => { markForCloudDeletion("crm_clients", ids); setClients((current) => current.filter((item) => !ids.includes(item.id))); logActivity("Removed client", "Clients", ids.join(", ")); syncGoogleSheetAfterDelete(); flash(`${ids.length} client${ids.length === 1 ? "" : "s"} removed`); }}
          />
        )}{" "}
        {["Leads", "Lost Leads"].includes(section) && <LeadsPanel leads={leads.filter((lead) => section === "Lost Leads" ? lead.status === "Lost" : lead.status !== "Lost").filter((lead) => `${lead.id} ${lead.company} ${lead.contact} ${lead.city}`.toLowerCase().includes(search.toLowerCase()))} edit={(lead) => show("lead", lead)} updateStage={updateLeadStage} remove={(id) => { markForCloudDeletion("crm_leads", [id]); setLeads((current) => current.filter((lead) => lead.id !== id)); logActivity("Removed enquiry", "Enquiries", id); syncGoogleSheetAfterDelete(); flash("Enquiry removed"); }} />}{" "}
        {section === "Follow-ups" && <TasksDashboard tasks={visibleTasks} leads={leads} quotes={quotes} invoices={invoices} orders={orders} toggle={(id) => { setTasks((current) => current.map((task) => task.id === id ? { ...task, status: task.status === "Done" ? "Open" : "Done" } : task)); logActivity("Updated task", "Daily Tasks", id); }} edit={(task) => show("task", task)} remove={(id) => { if (!window.confirm("Delete this task permanently?")) return; markForCloudDeletion("crm_tasks", [id]); setTasks((current) => current.filter((task) => task.id !== id)); logActivity("Deleted task", "Daily Tasks", id); flash("Task deleted."); }} />}{" "}
        {section === "Sales Team Report" && <SalesTeamDashboard leads={leads} quotes={quotes} orders={orders} invoices={invoices} />}{" "}
        {["Sales Report", "Customer Report", "Product Report", "Inventory Report", "Payment Report"].includes(section) && <ReportsDashboard report={section} orders={orders} clients={clients} catalogue={catalogue} leads={leads} quotes={quotes} invoices={invoices} />}{" "}
        {section === "Quotations" && <QuotesPanel quotes={quotes.filter((quote) => `${quote.id} ${quote.customer}`.toLowerCase().includes(search.toLowerCase()))} edit={(quote) => show("quote", quote)} remove={(id) => { markForCloudDeletion("crm_quotes", [id]); setQuotes((current) => current.filter((quote) => quote.id !== id)); logActivity("Removed quotation", "Quotations", id); flash("Quotation removed"); }} convert={(quote) => { const customer = clients.find((client) => client.name === quote.customer); const first = quote.products[0] || { product: "", sku: "", quantity: 0, unitPrice: 0, discount: 0 }; const products = quote.products.map(({ discount: _discount, ...product }) => product); const order: Order = { id: `GB-${String(Date.now()).slice(-5)}`, client: quote.customer, city: customer?.city || "", product: first.product, sku: first.sku, quantity: first.quantity, unitPrice: first.unitPrice * (1 - first.discount / 100), products, eta: "", status: "Draft", payment: "Partial", avatar: customer?.avatar || initials(quote.customer) }; setOrders((current) => [...current, order]); setQuotes((current) => current.map((item) => item.id === quote.id ? { ...item, status: "Converted" } : item)); logActivity("Converted quotation to order", "Quotations", `${quote.id} → ${order.id}`); flash(`Draft order ${order.id} created from ${quote.id}`); }} />}{" "}
        {section === "Backorders" && <BackordersPanel orders={orders.filter(isVisibleBackorder)} clients={clients} edit={(order) => show("order", order)} cancel={cancelOrder} remove={isAdmin ? removeOrders : undefined} />}{" "}
        {section === "Invoices" && (
          <Invoices
            invoices={invoices.filter((i) =>
              `${i.id} ${i.client} ${i.order}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )}
            clients={clients}
            edit={(i) => show("invoice", i)}
            remove={(ids) => { markForCloudDeletion("crm_invoices", ids); setInvoices((current) => current.filter((item) => !ids.includes(item.id))); logActivity("Removed invoice", "Invoices", ids.join(", ")); syncGoogleSheetAfterDelete(); flash(`${ids.length} invoice${ids.length === 1 ? "" : "s"} removed`); }}
          />
        )}{" "}
        {section === "Catalogue" && (
          <CataloguePanel
            items={catalogue.filter((item) => (!catalogueAttentionOnly || isProductProfileIncomplete(item)) && (`${catalogueName(item)} ${item.sku} ${item.category}`.toLowerCase().includes(search.toLowerCase()) || skuKey(item.sku).includes(skuKey(search))))}
            attentionOnly={catalogueAttentionOnly}
            showAll={() => setCatalogueAttentionOnly(false)}
            edit={(item) => show("catalogue", item)}
            duplicate={(item) => show("catalogue", { ...item, id: Date.now(), sku: "", name: `${catalogueName(item)} (Copy)`, availableQuantity: 10000, openingStock: 0, purchasedStock: 0, orderedStock: 0, damagedStock: 0, reservedStock: 0, duplicateFromId: item.id })}
            addDrafts={(drafts) => { const categorised = drafts.map((item) => ({ ...item, category: categoriseProduct(item) })); setCatalogue((current) => { const incoming = new Map(categorised.map((item) => [skuKey(item.sku), item])); const existing = new Set(current.map((item) => skuKey(item.sku))); return [...current.map((item) => { const replacement = incoming.get(skuKey(item.sku)); return replacement ? { ...item, ...replacement, id: item.id } : item; }), ...categorised.filter((item) => !existing.has(skuKey(item.sku)) )]; }); logActivity("Imported catalogue products", "Catalogue", `${drafts.length} SKU record(s) reconciled`); flash("Catalogue PDF processed: matching SKUs updated and missing SKUs added."); }}
            setAllOpeningStock={(quantity) => { if (window.confirm(`Reset demo inventory for all ${catalogue.length} products to ${quantity.toLocaleString("en-IN")} available units? Existing stock allocations will be cleared.`)) initialiseOpeningStock(quantity); }}
            remove={(ids) => { setCatalogue((current) => current.filter((item) => !ids.includes(item.id))); logActivity("Removed catalogue product", "Catalogue", ids.join(", ")); syncGoogleSheetAfterDelete(); flash(`${ids.length} product${ids.length === 1 ? "" : "s"} removed from catalogue`); }}
          />
        )}{" "}
        {section === "Product Stock Inventory" && <ProductStockInventoryPanel session={session} canApply={isAdmin} auditEvents={auditEvents} inventoryLedger={inventoryLedger} orders={orders} releaseAllReservations={releaseAllReservations} onAudit={logActivity} query={search} onProductsSynced={setCatalogue} onLiveBackup={queueGoogleSheetLiveBackup} />}{" "}
        {section === "Categories" && <ProductStockCategoriesPanel session={session} query={search} openCategory={(category) => { setSection("Product Stock Inventory"); setSectionSearches((current) => ({ ...current, "Product Stock Inventory": category })); }} />}{" "}
        {section === "Fetch Orders" && <GoogleSheetOrderFetch existingOrders={orders} addOrders={setOrders} onAudit={logActivity} showDraftOrders={() => { setSectionSearches((current) => ({ ...current, Orders: "" })); setSection("Orders"); }} />}{" "}
        {section === "Transporters" && <TransportersPanel transporters={transporters.filter((item) => `${item.name} ${item.contact} ${item.phone} ${item.city || ""} ${item.area || ""}`.toLowerCase().includes(search.toLowerCase()))} edit={(item) => show("transporter", item)} add={() => show("transporter")} remove={(ids) => { markForCloudDeletion("crm_transporters", ids); setTransporters((current) => current.filter((item) => !ids.includes(item.id))); logActivity("Removed transporter", "Transporters", ids.join(", ")); syncGoogleSheetAfterDelete(); flash(`${ids.length} transporter${ids.length === 1 ? "" : "s"} removed`); }} />}{" "}
        {section === "Suppliers" && <SuppliersPanel suppliers={suppliers.filter((item) => `${item.name} ${item.contact} ${item.phone} ${item.city || ""} ${item.country || ""}`.toLowerCase().includes(search.toLowerCase()))} edit={(item) => show("supplier", item)} add={() => show("supplier")} remove={(ids) => { setSuppliers((current) => current.filter((item) => !ids.includes(item.id))); logActivity("Removed supplier", "Suppliers", ids.join(", ")); syncGoogleSheetAfterDelete(); flash(`${ids.length} supplier${ids.length === 1 ? "" : "s"} removed`); }} />}{" "}
        {section === "Settings" && <TeamAccess members={members} requests={accessRequests} workspaceOwnerId={workspaceOwnerId} canManage={isAdmin} onChange={setMembers} onRequestsChange={setAccessRequests} onAudit={logActivity} auditEvents={auditEvents} />}{" "}
        {section === "Data Transfer" && <DataTransferPanel catalogue={catalogue} clients={clients} orders={orders} invoices={invoices} leads={leads} quotes={quotes} tasks={tasks} transporters={transporters} setCatalogue={setCatalogue} setClients={setClients} setOrders={setOrders} setInvoices={setInvoices} setLeads={setLeads} setQuotes={setQuotes} setTasks={setTasks} setTransporters={setTransporters} onAudit={logActivity} canHardDelete={isAdmin} hardDelete={(scope, ids) => { const wanted = new Set(ids.map((id) => id.trim().toLowerCase()).filter(Boolean)); if (!wanted.size) return 0; if (scope === "Customers") { const removed = clients.filter((client) => wanted.has((client.customerId || "").toLowerCase()) || wanted.has(client.name.toLowerCase())); setClients((current) => current.filter((client) => !removed.some((item) => item.id === client.id))); logActivity("Hard deleted customers from sheet", "Import / Export", removed.map((item) => item.name).join(", ")); return removed.length; } const stage = scope === "Orders" ? "Draft" : scope === "Approved Orders" ? "Confirmed" : "Dispatch plan"; const targetIds = orders.filter((order) => order.status === stage && wanted.has(order.id.toLowerCase())).map((order) => order.id); if (!targetIds.length) return 0; removeOrders(targetIds); logActivity("Hard deleted orders from sheet", "Import / Export", `${scope}: ${targetIds.join(", ")}`); return targetIds.length; }} />}{" "}
        {section === "Recovery" && <RecoveryPanel canManage={isAdmin} session={session} clearBusinessData={() => { markForCloudDeletion("crm_clients", clients.map((client) => client.id)); markForCloudDeletion("crm_orders", orders.map((order) => order.id)); markForCloudDeletion("crm_invoices", invoices.map((invoice) => invoice.id)); markForCloudDeletion("crm_leads", leads.map((lead) => lead.id)); markForCloudDeletion("crm_quotes", quotes.map((quote) => quote.id)); markForCloudDeletion("crm_tasks", tasks.map((task) => task.id)); markForCloudDeletion("crm_transporters", transporters.map((transporter) => transporter.id)); setOrders([]); setClients([]); setInvoices([]); setLeads([]); setQuotes([]); setTasks([]); setTransporters([]); setPurchases([]); flash("Business records have been permanently cleared. SKU catalogue was preserved."); }} applyRestore={(data) => { setOrders(data.orders); setClients(data.clients); setInvoices(data.invoices); setCatalogue(data.catalogue); setLeads(data.leads); setQuotes(data.quotes); setTasks(data.tasks); setTransporters(data.transporters || []); logActivity("Applied Google Sheets recovery", "Data recovery", "Recovery snapshot created before restore"); flash("Backup restored. Your previous CRM state is saved as a recovery snapshot."); }} />}{" "}
        {section === "Purchase Orders" && <PurchaseOrdersPanel purchases={purchases.filter((purchase) => `${purchase.id} ${purchase.supplier} ${purchase.lines.map((line) => `${line.sku} ${line.product}`).join(" ")}`.toLowerCase().includes(search.toLowerCase()))} catalogue={catalogue} lowStockProducts={lowStockProducts} add={(product) => show("purchase", product ? { lines: [{ sku: product.sku, product: catalogueName(product), quantity: Math.max(1, (product.reorderThreshold || 0) * 2 - availableStock(product)), receivedQuantity: 0 }], supplier: product.supplier || "" } : null)} edit={(purchase) => show("purchase", purchase)} receive={receivePurchase} cancel={(purchase) => { if (!window.confirm(`Cancel purchase order ${purchase.id}? No stock will be changed.`)) return; setPurchases((current) => current.map((item) => item.id === purchase.id ? { ...item, status: "Cancelled" } : item)); logActivity("Cancelled purchase order", "Purchase Orders", purchase.id); flash("Purchase order cancelled."); }} remove={deletePurchase} />} {" "}
        {section === "Notifications" && <AutomationPanel />}{" "}
        {!(["Overview", "Orders", "Confirmed Orders", "Dispatch Plan", "Clients", "Leads", "Enquiries", "Follow-ups", "Lost Leads", "Quotations", "Backorders", "Invoices", "Catalogue", "Product Stock Inventory", "Categories", "Fetch Orders", "Transporters", "Suppliers", "Purchase Orders", "Settings", "Recovery", "Data Transfer", "Notifications", "Sales Team Report", "Sales Report", "Customer Report", "Product Report", "Inventory Report", "Payment Report"].includes(section)) && (
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
          createTransporter={(transporter) => {
            setTransporters((current) => current.some((item) => skuKey(item.name) === skuKey(transporter.name)) ? current : [...current, transporter]);
            logActivity("Created incomplete transporter from order sheet", "Transporters", transporter.name);
            flash(`${transporter.name} was added to Transporters. Complete its details when available.`);
          }}
          close={() => setModal(null)}
          save={(o) => {
            const requestedId = o.id.trim();
            if (!requestedId) { flash("Enter an order ID before saving."); return; }
            if (orders.some((item) => item.id !== editing?.id && skuKey(item.id) === skuKey(requestedId))) { flash(`Order ID ${requestedId} is already in use. Choose a unique ID.`); return; }
            // Creating an order only records the customer's request. Inventory
            // is intentionally untouched until the user moves it to Dispatch Plan.
            let savedOrder: Order = editing ? { ...o, id: requestedId, status: editing.status } : { ...o, id: requestedId, status: "Draft", backorders: [] };
            const enteredLines = o.products?.length ? o.products : [{ product: o.product, sku: o.sku, quantity: o.quantity, unitPrice: o.unitPrice }];
            if (enteredLines.some((line) => !line.product.trim())) { flash("Choose every product from Product / SKU. If it is missing, add it in Stock Master first."); return; }
            // Keep an imported/manual rate and quantity exactly as entered,
            // but repair a line's SKU from its unambiguous catalogue label.
            // This prevents a green selected product from failing Save merely
            // because an older import kept a stale SKU value behind the label.
            const orderedLines = enteredLines.map((line) => {
              if (numberCandleMixSeries(line)) return line;
              const matched = catalogueMatchForOrderLine(line, catalogue);
              return matched ? { ...line, sku: matched.sku, product: `${matched.sku} · ${catalogueName(matched)}`, review: { ...line.review, product: false } } : line;
            });
            // AB-204 MIX and AB-205 MIX are recipe lines: on confirmation they
            // are safely expanded into their numbered components. A separate
            // MIX stock card is therefore not required.
            const missingLines = orderedLines.filter((line) => !numberCandleMixSeries(line) && !catalogue.some((product) => skuKey(product.sku) === skuKey(line.sku)));
            if (missingLines.length) { flash(`${missingLines.length} product line${missingLines.length === 1 ? " is" : "s are"} not in Product / SKU (${missingLines.map((line) => line.sku || line.product).join(", ")}). Add it in Stock Master, sync, then save this order.`); return; }
            savedOrder = orderWithLines(savedOrder, orderedLines);
            if (!editing) savedOrder = { ...savedOrder, requestedProducts: orderedLines, draftEditedQuantityKeys: savedOrder.sourceSheetOrderId ? [] : orderedLines.map(draftQuantityLineKey) };
            if (editing?.status === "Draft") {
              const changedKeys = editedDraftQuantityKeys(linesFor(editing), orderedLines);
              savedOrder = { ...savedOrder, requestedProducts: orderedLines, draftEditedQuantityKeys: changedKeys.length ? [...new Set([...(editing.draftEditedQuantityKeys || []), ...changedKeys])] : editing.draftEditedQuantityKeys || [] };
            }
            const editingBackorder = Boolean(editing && isBackorderRecord(editing));
            const primaryId = editingBackorder ? editing!.id.replace(/^ADV-/, "") : editing?.id || "";
            const primaryOrder = editingBackorder ? orders.find((item) => item.id === primaryId) : editing;
            const linkedBackorder = editingBackorder ? editing : orders.find((item) => item.id === `ADV-${editing?.id}`);
            const linkedBackorderIsLive = Boolean(editing && linkedBackorder && !isFulfilmentOrder(primaryOrder));
            let syncedBackorder: Order | null | undefined;
            if (editing && linkedBackorderIsLive && !editingBackorder) {
              const nextSkuKeys = new Set(orderedLines.map((line) => skuKey(line.sku)));
              const removedSkuKeys = new Set(linesFor(editing).filter((line) => !nextSkuKeys.has(skuKey(line.sku))).map((line) => skuKey(line.sku)));
              if (removedSkuKeys.size) {
                const remaining = linesFor(linkedBackorder!).filter((line) => !removedSkuKeys.has(skuKey(line.sku)));
                syncedBackorder = remaining.length ? orderWithLines(linkedBackorder!, remaining) : null;
                savedOrder = { ...savedOrder, backorders: remaining };
              }
            }
            if (editing && linkedBackorderIsLive && editingBackorder) savedOrder = orderWithLines(savedOrder, orderedLines);
            // A manual confirmed-order edit is an intentional allocation
            // decision. Keep those exact lines as the confirmed reservation,
            // even if the resulting free balance is negative; the shortage's
            // linked backorder remains separately visible and actionable.
            if (editing?.status === "Confirmed" && !editingBackorder) {
              const recalculatedBackorders = backorderLinesFor(orderedLines, editing.id, orders, catalogue);
              savedOrder = { ...savedOrder, products: orderedLines, requestedProducts: orderedLines, approvedProducts: orderedLines, backorders: recalculatedBackorders, confirmedIncludesBackorderQuantity: true };
              const existingAdvance = orders.find((item) => item.id === `ADV-${editing.id}`);
              syncedBackorder = recalculatedBackorders.length
                ? {
                    ...(existingAdvance || savedOrder),
                    id: `ADV-${requestedId}`,
                    product: recalculatedBackorders[0].product,
                    sku: recalculatedBackorders[0].sku,
                    quantity: recalculatedBackorders[0].quantity,
                    unitPrice: recalculatedBackorders[0].unitPrice,
                    products: recalculatedBackorders,
                    status: "Advance order",
                    payment: "Partial",
                    inventoryCommitted: false,
                  }
                : null;
            }
            const confirmedChangeSummary = editing?.status === "Confirmed" ? describeConfirmedOrderChanges(editing, savedOrder) : [];
            const draftChangeSummary = editing?.status === "Draft" ? describeConfirmedOrderChanges(editing, savedOrder) : [];
            const confirmedProductChanges = editing?.status === "Confirmed" && !editingBackorder
              ? confirmedOrderProductChanges(linesFor(editing), orderedLines)
              : [];
            if (confirmedProductChanges.length) {
              const reservationDeltaBySku = new Map<string, number>();
              confirmedProductChanges.forEach((change) => reservationDeltaBySku.set(skuKey(change.sku), (reservationDeltaBySku.get(skuKey(change.sku)) || 0) + change.after - change.before));
              setCatalogue((current) => current.map((product) => {
                const delta = reservationDeltaBySku.get(skuKey(product.sku)) || 0;
                return delta ? { ...product, reservedStock: Math.max(0, (product.reservedStock || 0) + delta) } : product;
              }));
            }
            setClients((current) => current.map((client) => client.name.trim().toLowerCase() === savedOrder.client.trim().toLowerCase() ? { ...client, customerStatus: "Active" } : client));
            setOrders((current) => {
              if (!editing) return [...current, savedOrder];
              const previousAdvanceId = `ADV-${editing.id}`;
              const nextAdvanceId = `ADV-${requestedId}`;
              let next = current.map((item) => item.id === editing.id ? savedOrder : item.id === previousAdvanceId && requestedId !== editing.id ? { ...item, id: nextAdvanceId } : item);
              if (linkedBackorderIsLive && editingBackorder) next = next.map((item) => item.id === primaryId ? { ...item, backorders: orderedLines } : item);
              if (syncedBackorder !== undefined) {
                const priorAdvanceId = linkedBackorder?.id || `ADV-${editing.id}`;
                if (syncedBackorder) {
                  const hasAdvance = next.some((item) => item.id === priorAdvanceId || item.id === syncedBackorder!.id);
                  next = hasAdvance
                    ? next.map((item) => item.id === priorAdvanceId || item.id === syncedBackorder!.id ? syncedBackorder! : item)
                    : [...next, syncedBackorder];
                } else next = next.filter((item) => item.id !== priorAdvanceId);
              }
              return next;
            });
            if (editing) setInvoices((current) => {
              let next = current.map((invoice) => requestedId !== editing.id && (invoice.order === editing.id || invoice.order === `ADV-${editing.id}`) ? { ...invoice, order: invoice.order === editing.id ? requestedId : `ADV-${requestedId}` } : invoice);
              if (linkedBackorderIsLive && editingBackorder) next = next.map((invoice) => invoice.order === editing.id ? { ...invoice, amount: money(orderTotal(savedOrder)) } : invoice);
              if (syncedBackorder !== undefined) {
                const priorAdvanceId = linkedBackorder?.id || `ADV-${editing.id}`;
                next = next.filter((invoice) => invoice.order !== priorAdvanceId);
                if (syncedBackorder) next.push({ id: syncedBackorder.id, client: savedOrder.client, order: syncedBackorder.id, amount: money(orderTotal(syncedBackorder)), due: "Advance payment", status: "Partial" });
              }
              return next;
            });
            if (syncedBackorder !== undefined) setTasks((current) => {
              const priorAdvanceId = linkedBackorder?.id || `ADV-${editing!.id}`;
              const next = current.filter((task) => task.relatedTo !== priorAdvanceId);
              return syncedBackorder ? [...next, { id: `TASK-${Date.now()}`, title: `Arrange future dispatch for advance order ${syncedBackorder.id}`, time: "10:00", dueDate: new Date().toISOString().slice(0, 10), assignee: "Rahul", type: "Follow-up", status: "Open", relatedTo: syncedBackorder.id }] : next;
            });
            setModal(null);
            logActivity(editing ? (editing.status === "Confirmed" ? "Updated confirmed order" : "Updated order") : "Created order", editing?.status === "Confirmed" ? "Confirmed Orders" : "Orders", editing?.status === "Confirmed" ? `${requestedId} · ${confirmedChangeSummary.join(" | ") || "Order details saved"}` : editing?.status === "Draft" ? `${requestedId} · ${draftChangeSummary.join(" | ") || "Order details saved"}` : requestedId);
            if (confirmedProductChanges.length) {
              logActivity("Recorded confirmed order product change", "Products", JSON.stringify({ orderId: requestedId, client: savedOrder.client, changes: confirmedProductChanges }));
            }
            flash(editing ? "Order updated successfully" : "Draft order created. Confirm it to reserve available stock and create any backorder.");
          }}
        />
      )}
      {modal === "orderView" && editing && <OrderViewModal order={editing as Order} close={() => setModal(null)} />}
      {modal === "orderDetails" && editing && <OrderDetailsModal order={editing as Order} auditEvents={auditEvents} close={() => setModal(null)} />}
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
            setCatalogue((current) => editing && !editing.duplicateFromId ? current.map((existing) => existing.id === editing.id ? item : existing) : [...current, item]);
            setModal(null);
            logActivity(editing && !editing.duplicateFromId ? "Updated catalogue product" : "Created catalogue product", "Catalogue", item.sku || item.name);
            flash(editing && !editing.duplicateFromId ? "Catalogue product updated" : "Catalogue product added");
          }}
        />
      )}
      {modal === "lead" && <LeadModal lead={editing} close={() => setModal(null)} save={(lead) => { setLeads((current) => editing ? current.map((item) => item.id === editing.id ? lead : item) : [...current, lead]); setModal(null); logActivity(editing ? "Updated lead" : "Created lead", "Leads", `${lead.id} · ${lead.company}`); flash(editing ? "Lead updated" : "New lead created"); }} />}
      {modal === "quote" && <QuoteModal quote={editing} clients={clients} catalogue={catalogue} close={() => setModal(null)} save={(quote) => { setQuotes((current) => editing ? current.map((item) => item.id === editing.id ? quote : item) : [...current, quote]); setModal(null); logActivity(editing ? "Updated quotation" : "Created quotation", "Quotations", `${quote.id} · ${quote.customer}`); flash(editing ? "Quotation updated" : "Quotation created"); }} />}
      {modal === "task" && <TaskModal task={editing} owner={session.user.email || signedInName} close={() => setModal(null)} save={(task) => { const savedTask = editing ? task : { ...task, assignee: session.user.email || signedInName }; setTasks((current) => editing ? current.map((item) => item.id === editing.id ? savedTask : item) : [...current, savedTask]); setModal(null); logActivity(editing ? "Updated task" : "Created task", "Daily Tasks", savedTask.title); flash(editing ? "Task updated" : "Task created"); }} />}
      {modal === "transporter" && <TransporterModal transporter={editing} close={() => setModal(null)} save={(transporter) => { setTransporters((current) => editing ? current.map((item) => item.id === editing.id ? transporter : item) : [...current, transporter]); setModal(null); logActivity(editing ? "Updated transporter" : "Added transporter", "Transporters", transporter.name); flash(editing ? "Transporter updated" : "Transporter added"); }} />}
      {modal === "supplier" && <SupplierModal supplier={editing} close={() => setModal(null)} save={(supplier) => { setSuppliers((current) => editing ? current.map((item) => item.id === editing.id ? supplier : item) : [...current, supplier]); setModal(null); logActivity(editing ? "Updated supplier" : "Added supplier", "Suppliers", supplier.name); flash(editing ? "Supplier updated" : "Supplier added"); }} />}
      {modal === "purchase" && <PurchaseOrderModal purchase={editing?.id ? editing as PurchaseOrder : null} draft={editing?.lines ? editing : null} purchases={purchases} catalogue={catalogue} suppliers={suppliers} close={() => setModal(null)} save={(purchase) => { if (purchase.supplier.trim()) setSuppliers((current) => current.some((supplier) => supplier.name.trim().toLowerCase() === purchase.supplier.trim().toLowerCase()) ? current : [...current, { id: Date.now(), name: purchase.supplier.trim(), contact: "", phone: "", email: "", city: "", country: "", gstin: "", paymentTerms: "", notes: "", status: "Active" }]); setPurchases((current) => editing?.id ? current.map((item) => item.id === purchase.id ? purchase : item) : [...current, purchase]); setModal(null); logActivity(editing?.id ? "Updated purchase order" : "Created purchase order", "Purchase Orders", purchase.id); flash(editing?.id ? "Purchase order updated." : "Purchase order created. Stock will change only when it is received."); }} />}
      {modal === "purchaseView" && editing?.id && <PurchaseOrderViewModal purchase={editing as PurchaseOrder} close={() => setModal(null)} />}
      {modal === "purchaseReceive" && editing?.id && <PurchaseReceiptModal purchase={editing as PurchaseOrder} close={() => { setModal(null); setEditing(null); }} save={(quantities) => { savePurchaseReceipt(editing as PurchaseOrder, quantities); setModal(null); setEditing(null); }}/>} 
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
  const draftOrders = normalOrders.filter((order) => order.status === "Draft").length;
  const approvedOrders = normalOrders.filter((order) => order.status === "Confirmed").length;
  const dispatchPlanOrders = normalOrders.filter((order) => order.status === "Dispatch plan").length;
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
        <Metric label="Draft orders" value={String(draftOrders)} change="Awaiting approval" icon={<FileText />} kind="gold" />
        <Metric label="Approved orders" value={String(approvedOrders)} change="Ready for dispatch" icon={<PackageCheck />} kind="violet" />
        <Metric label="Dispatch plan" value={String(dispatchPlanOrders)} change="In operations" icon={<ShipWheel />} kind="burgundy" />
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
function PurchaseOrdersPanel({ purchases, catalogue, lowStockProducts, add, edit, receive, cancel, remove }: { purchases: PurchaseOrder[]; catalogue: CatalogueItem[]; lowStockProducts: CatalogueItem[]; add: (product?: CatalogueItem) => void; edit: (purchase: PurchaseOrder) => void; receive: (purchase: PurchaseOrder) => void; cancel: (purchase: PurchaseOrder) => void; remove: (purchase: PurchaseOrder) => void }) {
  const open = purchases.filter((purchase) => !["Delivered", "Cancelled"].includes(purchase.status));
  const pendingUnits = open.reduce((total, purchase) => total + purchase.lines.reduce((lineTotal, line) => lineTotal + Math.max(0, line.quantity - receivedPurchaseQuantity(line)), 0), 0);
  useEffect(() => {
    const header = Array.from(document.querySelectorAll<HTMLTableCellElement>(".purchase-panel th")).find((cell) => cell.textContent?.trim() === "EXPECTED");
    const table = header?.closest("table");
    if (!header || !table) return;
    const column = Array.from(header.parentElement?.children || []).indexOf(header);
    const cells = Array.from(table.querySelectorAll("tr")).flatMap((row) => Array.from(row.children)[column] ? [Array.from(row.children)[column] as HTMLElement] : []);
    cells.forEach((cell) => { cell.style.display = "none"; });
    return () => cells.forEach((cell) => { cell.style.display = ""; });
  }, [purchases]);
  useEffect(() => {
    // Keep the register focused: active replenishment work is separate from
    // fully received or cancelled PO history.
    const title = Array.from(document.querySelectorAll<HTMLElement>(".purchase-panel h2")).find((heading) => heading.textContent?.trim() === "Purchase order register");
    const panel = title?.closest<HTMLElement>(".purchase-panel");
    const table = panel?.querySelector("table");
    if (!title || !panel || !table) return;
    const tabs = document.createElement("div");
    tabs.className = "purchase-register-tabs";
    const ongoing = document.createElement("button");
    const filled = document.createElement("button");
    ongoing.type = "button"; filled.type = "button";
    ongoing.textContent = `Ongoing (${purchases.filter((purchase) => !["Delivered", "Cancelled"].includes(purchase.status)).length})`;
    filled.textContent = `Filled (${purchases.filter((purchase) => ["Delivered", "Cancelled"].includes(purchase.status)).length})`;
    tabs.append(ongoing, filled);
    title.parentElement?.append(tabs);
    const show = (mode: "ongoing" | "filled") => {
      ongoing.classList.toggle("active", mode === "ongoing");
      filled.classList.toggle("active", mode === "filled");
      Array.from(table.querySelectorAll("tbody tr")).forEach((row) => {
        const status = row.children[6]?.textContent?.trim() || "";
        const isFilled = ["Delivered", "Cancelled"].includes(status);
        (row as HTMLElement).style.display = (mode === "filled") === isFilled ? "" : "none";
      });
    };
    ongoing.onclick = () => show("ongoing");
    filled.onclick = () => show("filled");
    show("ongoing");
    return () => tabs.remove();
  }, [purchases]);
  useEffect(() => {
    const title = Array.from(document.querySelectorAll<HTMLElement>(".purchase-panel h2")).find((heading) => heading.textContent?.trim() === "Purchase order register");
    const table = title?.closest<HTMLElement>(".purchase-panel")?.querySelector("table");
    if (!table) return;
    const buttons = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")).map((row, index) => {
      const purchase = purchases[index];
      const actions = row.querySelector<HTMLElement>(".purchase-actions");
      if (!purchase || !actions) return null;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-btn";
      button.textContent = "View";
      button.dataset.viewAction = "";
      button.onclick = () => window.dispatchEvent(new CustomEvent("geebee:view-purchase", { detail: purchase }));
      actions.prepend(button);
      return button;
    });
    return () => buttons.forEach((button) => button?.remove());
  }, [purchases]);
  return <section className="purchasing-page"><div className="purchase-metrics"><article><span>LOW STOCK ALERTS</span><b>{lowStockProducts.length}</b><small>SKU(s) at or below threshold</small></article><article><span>OPEN PURCHASE ORDERS</span><b>{open.length}</b><small>{pendingUnits.toLocaleString("en-IN")} units awaiting delivery</small></article><article><span>CATALOGUE COVERAGE</span><b>{catalogue.filter((product) => (product.reorderThreshold || 0) > 0).length}</b><small>SKU(s) with reorder limits</small></article></div><section className="panel purchase-panel"><div className="panel-head"><div><span className="overline">REORDER QUEUE</span><h2>Low-stock products</h2><p>Set the required quantity and create a supplier purchase order before stock runs out.</p></div><button className="outline purchase-new" onClick={() => add()}><Plus size={15}/> New purchase order</button></div>{lowStockProducts.length ? <div className="table-wrap"><table><thead><tr><th>PRODUCT / SKU</th><th>SUPPLIER</th><th>AVAILABLE</th><th>ALERT AT</th><th>RECOMMENDED ORDER</th><th></th></tr></thead><tbody>{lowStockProducts.map((product) => <tr key={product.id}><td><b>{catalogueName(product)}</b><small className="purchase-sku">{catalogueSku(product)}</small></td><td>{product.supplier || "Supplier not set"}</td><td className="purchase-danger">{availableStock(product).toLocaleString("en-IN")}</td><td>{(product.reorderThreshold || 0).toLocaleString("en-IN")}</td><td>{Math.max(1, (product.reorderThreshold || 0) * 2 - availableStock(product)).toLocaleString("en-IN")}</td><td><button className="text-btn" onClick={() => add(product)}>Create PO <span>→</span></button></td></tr>)}</tbody></table></div> : <div className="purchase-empty"><PackageCheck size={23}/><b>Inventory is healthy</b><span>Products with a threshold will appear here when stock reaches that limit.</span></div>}</section><section className="panel purchase-panel"><div className="panel-head"><div><span className="overline">PURCHASING</span><h2>Purchase order register</h2><p>Stock is added only after you mark a delivery as received.</p></div></div>{purchases.length ? <div className="table-wrap"><table><thead><tr><th>PO NUMBER</th><th>SUPPLIER</th><th>PRODUCTS</th><th>ORDERED</th><th>RECEIVED</th><th>EXPECTED</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{purchases.map((purchase) => { const ordered = purchase.lines.reduce((sum, line) => sum + line.quantity, 0); const received = purchase.lines.reduce((sum, line) => sum + receivedPurchaseQuantity(line), 0); return <tr key={purchase.id}><td><b>{purchase.id}</b></td><td>{purchase.supplier || "Not assigned"}</td><td>{purchase.lines.map((line) => line.sku).join(", ")}</td><td>{ordered.toLocaleString("en-IN")}</td><td>{received.toLocaleString("en-IN")}</td><td>{purchase.expectedDate || "—"}</td><td><Pill value={purchase.status}/></td><td className="purchase-actions"><button className="text-btn" onClick={() => edit(purchase)}>Edit</button>{!["Delivered", "Cancelled"].includes(purchase.status) && <button className="text-btn" onClick={() => receive(purchase)}>Receive</button>}{purchase.status === "Draft" && <button className="text-btn" onClick={() => cancel(purchase)}>Cancel</button>}<button className="row-delete" type="button" onClick={() => remove(purchase)} aria-label={`Delete ${purchase.id}`}><Trash2 size={14}/> Delete</button><button className="whatsapp-action" type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`GeeBee Purchase Order ${purchase.id}\nSupplier: ${purchase.supplier || "Not assigned"}\nProducts: ${purchase.lines.map((line) => `${line.sku} × ${line.quantity}`).join(", ")}`)}`, "_blank", "noopener,noreferrer")}>WA</button></td></tr>; })}</tbody></table></div> : <div className="purchase-empty"><ClipboardList size={23}/><b>No purchase orders yet</b><span>Create one from a low-stock alert or use New purchase order.</span></div>}</section></section>;
}
function PurchaseOrderModal({ purchase, draft, purchases, catalogue, suppliers, close, save }: { purchase: PurchaseOrder | null; draft: Partial<PurchaseOrder> | null; purchases: PurchaseOrder[]; catalogue: CatalogueItem[]; suppliers: Supplier[]; close: () => void; save: (purchase: PurchaseOrder) => void }) {
  const initial: PurchaseOrder = purchase || { id: nextPurchaseOrderNumber(purchases), supplier: draft?.supplier || "", status: "Draft", expectedDate: "", createdAt: new Date().toISOString().slice(0, 10), notes: "", lines: draft?.lines || [{ sku: "", product: "", quantity: 0, receivedQuantity: 0 }] };
  const [form, setForm] = useState<PurchaseOrder>(initial);
  const [queries, setQueries] = useState(() => initial.lines.map((line) => line.sku && line.product ? `${line.sku} · ${line.product}` : line.sku || line.product || ""));
  const supplierNames = [...new Set([...suppliers.map((supplier) => supplier.name), ...catalogue.map((product) => product.supplier || "")].filter(Boolean))];
  const updateLine = (index: number, patch: Partial<PurchaseLine>) => setForm((current) => ({ ...current, lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) }));
  const searchProduct = (index: number, value: string) => {
    setQueries((current) => current.map((query, lineIndex) => lineIndex === index ? value : query));
    const typed = value.trim().toLowerCase();
    const product = catalogue.find((item) => [catalogueSku(item), catalogueName(item), `${catalogueSku(item)} · ${catalogueName(item)}`, `${catalogueName(item)} · ${catalogueSku(item)}`].some((label) => label.toLowerCase() === typed));
    if (!product) return;
    setQueries((current) => current.map((query, lineIndex) => lineIndex === index ? `${catalogueSku(product)} · ${catalogueName(product)}` : query));
    setForm((current) => ({ ...current, supplier: current.supplier || product.supplier || "", lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, sku: product.sku, product: catalogueName(product) } : line) }));
  };
  const addLine = () => { setForm((current) => ({ ...current, lines: [...current.lines, { sku: "", product: "", quantity: 0, receivedQuantity: 0 }] })); setQueries((current) => [...current, ""]); };
  const removeLine = (index: number) => { setForm((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) })); setQueries((current) => current.filter((_, lineIndex) => lineIndex !== index)); };
  const savePurchase = () => {
    const lines = form.lines.filter((line) => line.sku && line.product && line.quantity > 0);
    if (!lines.length || lines.length !== form.lines.length) { window.alert("Select a valid Product / SKU for every PO line and enter its quantity."); return; }
    save({ ...form, lines });
  };
  return <Shell close={close}>
    <div className="order-modal-head"><div className="modal-mark"><ShipWheel size={22}/></div><div><span className="overline">PURCHASING</span><h2>{purchase ? "Edit purchase order" : "New purchase order"}</h2><p>Plan supplier replenishment. Stock is updated from the Stock Master Sheet.</p></div></div>
    <div className="form-row"><label>PO number<input value={form.id} readOnly title="Generated automatically as date-month-sequence"/></label></div>
    <label>Supplier<input list="purchase-suppliers" value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} placeholder="Select or type supplier"/><datalist id="purchase-suppliers">{supplierNames.map((supplier) => <option key={supplier} value={supplier}/>)}</datalist></label>
    <div className="modal-section-title">Products to order</div>
    <div className="purchase-lines">{form.lines.map((line, index) => <div className="purchase-line" key={`${line.sku}-${index}`}><span>{index + 1}</span><label>Product / SKU<input list="purchase-products" value={queries[index] || ""} onChange={(event) => searchProduct(index, event.target.value)} placeholder="Type SKU or product name" autoComplete="off"/></label><label>Qty to order<input type="number" min="1" value={line.quantity || ""} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })}/></label><button type="button" className="line-remove" onClick={() => removeLine(index)}><X size={15}/></button></div>)}</div>
    <datalist id="purchase-products">{catalogue.map((product) => <option key={product.id} value={`${catalogueSku(product)} · ${catalogueName(product)}`}/>)}</datalist>
    <button type="button" className="text-btn" onClick={addLine}>+ Add product line</button>
    <label>Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Supplier reference, freight notes or delivery instructions"/></label>
    <button className="primary modal-submit" type="button" onClick={savePurchase}>Save purchase order</button>
  </Shell>;
}
function PurchaseReceiptModal({ purchase, close, save }: { purchase: PurchaseOrder; close: () => void; save: (quantities: number[]) => void }) {
  const [received, setReceived] = useState<string[]>(() => purchase.lines.map(() => ""));
  const update = (index: number, value: string) => setReceived((current) => current.map((quantity, lineIndex) => lineIndex === index ? value : quantity));
  const submit = () => {
    try {
      const quantities = purchase.lines.map((line, index) => {
        const raw = received[index]?.trim() || "0";
        const amount = Number(raw);
        const outstanding = Math.max(0, line.quantity - receivedPurchaseQuantity(line));
        if (!Number.isFinite(amount) || amount < 0 || amount > outstanding) throw new Error(`${line.sku}: enter a quantity from 0 to ${outstanding.toLocaleString("en-IN")}.`);
        return amount;
      });
      if (!quantities.some(Boolean)) { window.alert("Enter the quantity received for at least one product."); return; }
      save(quantities);
    } catch (error) { window.alert(error instanceof Error ? error.message : "Check the received quantities."); }
  };
  return <Shell close={close}>
    <div className="order-modal-head"><div className="modal-mark"><PackageCheck size={22}/></div><div><span className="overline">GOODS RECEIPT</span><h2>Receive purchase order {purchase.id}</h2><p>Enter the received quantity for each product separately. Remaining quantities will become a new backorder PO.</p></div></div>
    <div className="purchase-receipt-lines">
      {purchase.lines.map((line, index) => { const alreadyReceived = receivedPurchaseQuantity(line); const outstanding = Math.max(0, line.quantity - alreadyReceived); return <div className="purchase-receipt-line" key={`${line.sku}-${index}`}><div><b>{line.sku} · {line.product}</b><small>Ordered {line.quantity.toLocaleString("en-IN")} · previously received {alreadyReceived.toLocaleString("en-IN")} · remaining {outstanding.toLocaleString("en-IN")}</small></div><label>Receive now<input type="number" min="0" max={outstanding} value={received[index] || ""} onChange={(event) => update(index, event.target.value)} placeholder="0" disabled={outstanding === 0}/></label></div>; })}
    </div>
    <button className="primary modal-submit" type="button" onClick={submit}>Save individual receipt</button>
  </Shell>;
}
function TransportersPanel({ transporters, edit, add, remove }: { transporters: Transporter[]; edit: (item: Transporter) => void; add: () => void; remove: (ids: number[]) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const removeSelected = () => { if (!selected.length || !window.confirm(`Remove ${selected.length} transporter${selected.length === 1 ? "" : "s"}?`)) return; remove(selected); setSelected([]); };
  return <section className="panel transporter-panel"><div className="panel-head"><div><span className="overline">OPERATIONS DIRECTORY</span><h2>Transport vendors</h2><p>Add approved transporters once, then assign the right vendor to every order.</p></div><button className="primary" type="button" onClick={add}><Plus size={16}/> Add transporter</button></div>{transporters.length ? <><div className="record-bulk-bar"><span>Select vendors to manage them together.</span>{selected.length > 0 && <button type="button" className="bulk-delete" onClick={removeSelected}><Trash2 size={14}/> Remove {selected.length}</button>}</div><div className="table-wrap"><table className="records"><thead><tr><th><input className="record-check" type="checkbox" checked={transporters.length > 0 && selected.length === transporters.length} onChange={() => setSelected(selected.length === transporters.length ? [] : transporters.map((item) => item.id))} aria-label="Select all transporters"/></th><th>TRANSPORTER</th><th>CONTACT</th><th>PHONE</th><th>CITY</th><th>AREA</th><th>SERVICE</th><th/></tr></thead><tbody>{transporters.map((item) => <tr key={item.id}><td><input className="record-check" type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} aria-label={`Select ${item.name}`}/></td><td><b>{item.name}</b>{item.gstin && <small className="transporter-gstin">GSTIN: {item.gstin}</small>}</td><td>{item.contact || "—"}</td><td>{item.phone || "—"}</td><td>{item.city || "—"}</td><td>{item.area || "—"}</td><td><span className="transporter-service">{item.serviceType || "General"}</span></td><td><div className="record-actions"><button className="edit-btn" type="button" onClick={() => edit(item)}><Pencil size={14}/> Edit</button><button className="row-delete" type="button" onClick={() => window.confirm(`Permanently delete ${item.name}?`) && remove([item.id])}><Trash2 size={14}/> Delete</button></div></td></tr>)}</tbody></table></div></> : <div className="transporter-empty"><Truck size={25}/><h3>No transporters added</h3><p>Add your transport vendors to select them while creating an order.</p><button className="primary" type="button" onClick={add}>Add first transporter</button></div>}</section>;
}
function TransporterModal({ transporter, close, save }: { transporter: Transporter | null; close: () => void; save: (item: Transporter) => void }) {
  const [form, setForm] = useState<Transporter>(transporter || { id: Date.now(), name: "", contact: "", phone: "", email: "", city: "", area: "", gstin: "", serviceType: "Road transport", notes: "" });
  const update = (key: keyof Transporter, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const areas = transporterCityAreas[Object.keys(transporterCityAreas).find((city) => city.toLowerCase() === (form.city || "").trim().toLowerCase()) || ""] || [];
  return <Shell close={close}><div className="order-modal-head"><div className="modal-mark"><Truck size={22}/></div><div><span className="overline">TRANSPORT VENDOR</span><h2>{transporter ? "Edit transporter" : "Add transporter"}</h2><p>Save vendor information for quick assignment on orders.</p></div></div><div className="form-row"><label>Transporter name<input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Vendor / transport company" required/></label><label>Contact person<input value={form.contact} onChange={(event) => update("contact", event.target.value)} placeholder="Contact person"/></label></div><div className="form-row"><label>Phone<input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+91 98765 43210" required/></label><label>Email<input type="email" value={form.email || ""} onChange={(event) => update("email", event.target.value)} placeholder="operations@vendor.com"/></label></div><div className="form-row"><label>City<input list="transporter-city-options" value={form.city || ""} onChange={(event) => update("city", event.target.value)} placeholder="Select or type a city"/><datalist id="transporter-city-options">{Object.keys(transporterCityAreas).map((city) => <option key={city} value={city}/>)}</datalist></label><label>Area<input list="transporter-area-options" value={form.area || ""} onChange={(event) => update("area", event.target.value)} placeholder={areas.length ? "Select or type an area" : "Type an area"}/><datalist id="transporter-area-options">{areas.map((area) => <option key={area} value={area}/>)}</datalist></label></div><label>Service type<select value={form.serviceType || "Road transport"} onChange={(event) => update("serviceType", event.target.value)}>{["Road transport", "Courier", "Air cargo", "Rail freight", "Local delivery", "Other"].map((value) => <option key={value}>{value}</option>)}</select></label><label>GSTIN<input value={form.gstin || ""} onChange={(event) => update("gstin", event.target.value.toUpperCase())} placeholder="GSTIN, if applicable"/></label><label>Notes<textarea value={form.notes || ""} onChange={(event) => update("notes", event.target.value)} placeholder="Service areas, payment terms, or other notes"/></label><button className="primary modal-submit" type="button" disabled={!form.name.trim() || !form.phone.trim()} onClick={() => save({ ...form, name: form.name.trim(), contact: form.contact.trim(), phone: form.phone.trim() })}>Save transporter</button></Shell>;
}
function SuppliersPanel({ suppliers, edit, add, remove }: { suppliers: Supplier[]; edit: (item: Supplier) => void; add: () => void; remove: (ids: number[]) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  return <section className="panel transporter-panel"><div className="panel-head"><div><span className="overline">IMPORTS DIRECTORY</span><h2>Suppliers</h2><p>Maintain supplier details and reuse them while creating purchase orders.</p></div><button className="primary" type="button" onClick={add}><Plus size={16}/> Add supplier</button></div>{suppliers.length ? <><div className="record-bulk-bar"><span>Select suppliers to manage them together.</span>{selected.length > 0 && <button type="button" className="bulk-delete" onClick={() => { if (window.confirm(`Remove ${selected.length} supplier${selected.length === 1 ? "" : "s"}?`)) { remove(selected); setSelected([]); } }}><Trash2 size={14}/> Remove {selected.length}</button>}</div><div className="table-wrap"><table className="records"><thead><tr><th><input className="record-check" type="checkbox" checked={suppliers.length > 0 && selected.length === suppliers.length} onChange={() => setSelected(selected.length === suppliers.length ? [] : suppliers.map((item) => item.id))} aria-label="Select all suppliers"/></th><th>SUPPLIER</th><th>CONTACT</th><th>PHONE</th><th>CITY / COUNTRY</th><th>PAYMENT TERMS</th><th>STATUS</th><th/></tr></thead><tbody>{suppliers.map((item) => <tr key={item.id}><td><input className="record-check" type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} aria-label={`Select ${item.name}`}/></td><td><b>{item.name}</b>{item.gstin && <small className="transporter-gstin">GSTIN: {item.gstin}</small>}</td><td>{item.contact || "—"}</td><td>{item.phone || "—"}</td><td>{[item.city, item.country].filter(Boolean).join(", ") || "—"}</td><td>{item.paymentTerms || "—"}</td><td><span className="transporter-service">{item.status || "Active"}</span></td><td><div className="record-actions"><button className="edit-btn" type="button" onClick={() => edit(item)}><Pencil size={14}/> Edit</button><button className="row-delete" type="button" onClick={() => window.confirm(`Permanently delete ${item.name}?`) && remove([item.id])}><Trash2 size={14}/> Delete</button></div></td></tr>)}</tbody></table></div></> : <div className="transporter-empty"><ShipWheel size={25}/><h3>No suppliers added</h3><p>Add a supplier manually, or create a purchase order and its supplier will be saved here automatically.</p><button className="primary" type="button" onClick={add}>Add first supplier</button></div>}</section>;
}
function SupplierModal({ supplier, close, save }: { supplier: Supplier | null; close: () => void; save: (item: Supplier) => void }) {
  const [form, setForm] = useState<Supplier>(supplier || { id: Date.now(), name: "", contact: "", phone: "", email: "", city: "", country: "India", gstin: "", paymentTerms: "", notes: "", status: "Active" });
  const update = (key: keyof Supplier, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <Shell close={close}><div className="order-modal-head"><div className="modal-mark"><ShipWheel size={22}/></div><div><span className="overline">IMPORT SUPPLIER</span><h2>{supplier ? "Edit supplier" : "Add supplier"}</h2><p>Keep supplier contact, commercial and import details in one place.</p></div></div><div className="form-row"><label>Supplier name<input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Company name" required/></label><label>Contact person<input value={form.contact} onChange={(event) => update("contact", event.target.value)} placeholder="Contact person"/></label></div><div className="form-row"><label>Phone<input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="Phone or WhatsApp"/></label><label>Email<input type="email" value={form.email || ""} onChange={(event) => update("email", event.target.value)} placeholder="supplier@example.com"/></label></div><div className="form-row"><label>City<input value={form.city || ""} onChange={(event) => update("city", event.target.value)} placeholder="City"/></label><label>Country<input value={form.country || ""} onChange={(event) => update("country", event.target.value)} placeholder="Country"/></label></div><div className="form-row"><label>GSTIN<input value={form.gstin || ""} onChange={(event) => update("gstin", event.target.value.toUpperCase())} placeholder="GSTIN, if applicable"/></label><label>Payment terms<input value={form.paymentTerms || ""} onChange={(event) => update("paymentTerms", event.target.value)} placeholder="e.g. 30 days / advance"/></label></div><label>Status<select value={form.status || "Active"} onChange={(event) => update("status", event.target.value)}><option>Active</option><option>Inactive</option></select></label><label>Notes<textarea value={form.notes || ""} onChange={(event) => update("notes", event.target.value)} placeholder="Products supplied, lead time, bank details, or notes"/></label><button className="primary modal-submit" type="button" disabled={!form.name.trim()} onClick={() => save({ ...form, name: form.name.trim(), contact: form.contact.trim(), phone: form.phone.trim() })}>Save supplier</button></Shell>;
}
function Orders({
  orders,
  cancelledOrders = [],
  clients,
  edit,
  cancel,
  remove,
  returnToOrders,
  returnLabel = "Return to Orders",
  pushToDispatch,
  confirm,
  sendWhatsApp,
  updateApproval,
  confirmed = false,
}: {
  orders: Order[];
  cancelledOrders?: Order[];
  clients: Client[];
  edit: (o: Order) => void;
  cancel: (order: Order) => void;
  remove?: (ids: string[]) => void;
  returnToOrders?: (order: Order) => void;
  returnLabel?: string;
  pushToDispatch?: (order: Order) => void;
  confirm?: (order: Order) => void;
  sendWhatsApp?: (order: Order) => void;
  updateApproval?: (id: string, approval: NonNullable<Order["clientApproval"]>) => void;
  confirmed?: boolean;
}) {
  const [showCancelled, setShowCancelled] = useState(false);
  const [showApprovalControls, setShowApprovalControls] = useState(false);
  // Linked advance/backorder records can be cancelled automatically when the
  // main order returns to Draft. They are internal stock records, not a
  // cancelled customer order, so keep them out of this customer-facing list.
  const visibleCancelledOrders = cancelledOrders.filter((order) => !isBackorderRecord(order));
  return (
    <section className="panel record-panel">
      <div className="panel-head">
        <div>
          <h2>{confirmed ? "Confirmed orders" : "Order register"}</h2>
          <p>{confirmed ? "Reserved stock · approval required before dispatch." : "Orders are rough drafts. Confirm an order to reserve available stock and automatically create any backorder."}</p>
        </div>
      </div>
      <OrderTable orders={orders} edit={edit} cancel={cancel} remove={remove} returnToOrders={returnToOrders} returnLabel={returnLabel} pushToDispatch={pushToDispatch} confirm={confirm} sendWhatsApp={sendWhatsApp} whatsAppLabel={confirmed ? "WhatsApp approval" : undefined} />
      {confirmed && updateApproval && orders.length > 0 && <section className="dispatch-cancelled"><button type="button" onClick={() => setShowApprovalControls((current) => !current)}><span>{showApprovalControls ? "⌄" : "›"}</span> Client approval controls <b>{orders.length}</b></button>{showApprovalControls && <section className="dispatch-approval-list">{orders.map((order) => <article key={order.id}><div><b>{order.id} · {order.client}</b><small>{order.clientApproval || "Approval pending"}</small></div><div><button className="outline" type="button" onClick={() => updateApproval(order.id, "Approval requested")}>Mark sent</button><label>Approval<select value={order.clientApproval || "Approval pending"} onChange={(event) => updateApproval(order.id, event.target.value as NonNullable<Order["clientApproval"]>)}><option>Approval pending</option><option>Approval requested</option><option>Approved</option><option>Changes requested</option><option>Rejected</option></select></label></div></article>)}</section>}</section>}
      {visibleCancelledOrders.length > 0 && <section className="dispatch-cancelled"><button type="button" onClick={() => setShowCancelled((current) => !current)}><span>{showCancelled ? "⌄" : "›"}</span> Cancelled {confirmed ? "Confirmed Orders" : "Orders"} <b>{visibleCancelledOrders.length}</b></button>{showCancelled && <OrderTable orders={visibleCancelledOrders} edit={edit} cancel={cancel} remove={remove} />}</section>}
    </section>
  );
}
function OrderTable({
  orders,
  edit,
  view,
  readOnly = false,
  cancel,
  remove,
  sendWhatsApp,
  whatsAppLabel,
  pushToDispatch,
  returnToOrders,
  returnLabel = "Return to Orders",
  confirm,
  advance,
  advanceLabel,
  compact = false,
  showDispatchDetails = false,
  hidePrint = false,
}: {
  orders: Order[];
  edit: (o: Order) => void;
  view?: (o: Order) => void;
  readOnly?: boolean;
  cancel?: (order: Order) => void;
  remove?: (ids: string[]) => void;
  sendWhatsApp?: (order: Order) => void;
  whatsAppLabel?: string;
  pushToDispatch?: (order: Order) => void;
  returnToOrders?: (order: Order) => void;
  returnLabel?: string;
  confirm?: (order: Order) => void;
  advance?: (order: Order) => void;
  advanceLabel?: string;
  compact?: boolean;
  showDispatchDetails?: boolean;
  hidePrint?: boolean;
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
            <th>VALUE</th>
            <th>ETA</th>
            <th>STATUS</th>
            <th>PAYMENT</th>
            {!compact && <th>PACKING</th>}
            {showDispatchDetails && <th>REMARKS</th>}
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
              {!compact && <td><span className="order-entry-source" title="Packing instructions">{packingInstructions(o) || "—"}</span></td>}
              {showDispatchDetails && <td><span className="order-entry-source" title="Product remarks">{linesFor(o).map((line) => line.remarks?.trim()).filter(Boolean).join(" · ") || "—"}</span></td>}
              <td>
                <div className="record-actions">{view ? <button className="outline" type="button" data-view-action onClick={() => view(o)}>View</button> : <button className="outline" type="button" data-view-action onClick={() => window.dispatchEvent(new CustomEvent("geebee:view-order", { detail: o }))}>View</button>}{confirm && o.status === "Draft" && <button className="dispatch-action" type="button" onClick={() => confirm(o)}>Confirm order</button>}{returnToOrders && (o.status === "Confirmed" || o.status === "Dispatch plan") && <button className="outline" type="button" onClick={() => returnToOrders(o)}>{returnLabel}</button>}{pushToDispatch && o.status === "Confirmed" && <button className="dispatch-action" type="button" onClick={() => pushToDispatch(o)}>Dispatch plan</button>}{advance && <button className="dispatch-action" type="button" onClick={() => advance(o)}>{advanceLabel || "Continue"}</button>}{sendWhatsApp && <button className="whatsapp-action" type="button" onClick={() => sendWhatsApp(o)} aria-label={`Send WhatsApp confirmation for ${o.id}`}>{whatsAppLabel || "WA"}</button>}{readOnly && !hidePrint && <button className="outline" type="button" onClick={() => window.print()}>Print</button>}{!readOnly && <button className="edit-btn" onClick={() => edit(o)} aria-label={`Edit ${o.id}`}><Pencil size={14} /></button>}{!readOnly && cancel && o.status !== "Cancelled" && <button className="row-delete" type="button" onClick={() => cancel(o)} aria-label={`Cancel ${o.id}`}>Cancel</button>}{!readOnly && selectable && <button className="row-delete" type="button" onClick={() => removeOne(o)} aria-label={`Remove ${o.id}`}><Trash2 size={14}/></button>}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!orders.length && <div className="empty">No matching orders found.</div>}
    </div></>
  );
}
function OrderViewModal({ order, close }: { order: Order; close: () => void }) {
  const lines = linesFor(order);
  return <Shell close={close} printDocument><section className="dispatch-print-document"><div className="order-modal-head"><div className="modal-mark"><PackageCheck size={22}/></div><div><span className="overline">DISPATCH ORDER · {order.id}</span><h2 className="dispatch-customer-name">{order.client}</h2><p>{order.city || "—"}{order.transporter ? ` · ${order.transporter}` : ""}</p></div></div><div className="panel-head"><div><h3>Products to pack</h3></div><button className="outline dispatch-print-button" type="button" onClick={() => window.print()}>Print</button></div><div className="table-wrap"><table className="records dispatch-print-table"><thead><tr><th>SKU</th><th>PRODUCT</th><th>QTY</th><th>REMARKS</th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.sku}-${index}`}><td><b>{line.sku}</b></td><td>{line.product}</td><td><b>{line.quantity.toLocaleString("en-IN")}</b></td><td>{line.remarks?.trim() || "—"}</td></tr>)}</tbody></table></div>{packingInstructions(order) && <p className="profile-empty dispatch-packing-note"><b>Packing:</b> {packingInstructions(order)}</p>}</section></Shell>;
}
function OrderDetailsModal({ order, auditEvents, close }: { order: Order; auditEvents: AuditEvent[]; close: () => void }) {
  const lines = linesFor(order);
  const isConfirmed = order.status === "Confirmed";
  const showOrderHistory = order.status === "Draft" || isConfirmed;
  // Product-level JSON audits belong in the SKU history. The order view keeps
  // the readable order-edit trail, including added/removed products and qty
  // increases/reductions.
  const orderHistory = showOrderHistory ? auditEvents.filter((event) => event.details.toLowerCase().includes(order.id.toLowerCase()) && !["Recorded confirmed order product change", "Recorded Product / SKU stock movement"].includes(event.action)).slice(0, 20) : [];
  const readableOrderHistory = orderHistory.map((event) => ({ ...event, readableDetails: readableOrderHistoryDetails(event.details) }));
  return <Shell close={close} wide printDocument={isConfirmed}>
    <section className={isConfirmed ? "confirmed-order-print-document" : ""}>
      <div className="order-modal-head"><div className="modal-mark"><ClipboardList size={22}/></div><div>{isConfirmed && <span className="overline">CONFIRMATION NO. {order.confirmationSequence || "—"}</span>}<span className="overline">{order.status.toUpperCase()} ORDER · {order.id}</span><h2 className="dispatch-customer-name">{order.client || "Customer not assigned"}</h2><p>{[order.city, order.transporter].filter(Boolean).join(" · ") || "No city or transporter assigned"}</p></div></div>
      {isConfirmed && <div className="confirmed-order-print-actions"><button className="outline confirmed-order-print-button" type="button" onClick={() => window.print()}>Print packing copy</button></div>}
      <div className="form-row"><div className="profile-empty"><b>Status</b><br/><Pill value={order.status}/></div><div className="profile-empty"><b>Payment</b><br/><Pill value={order.payment}/></div><div className="profile-empty"><b>Expected arrival</b><br/>{order.eta ? new Date(order.eta).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</div></div>
      <div className="modal-section-title">Order products</div><div className="table-wrap"><table className="records"><thead><tr><th>SKU</th><th>PRODUCT</th><th>QTY</th><th className="financial-column">UNIT PRICE</th><th className="financial-column">AMOUNT</th><th>REMARKS</th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.sku}-${index}`}><td><b>{line.sku || "—"}</b></td><td>{line.product || "—"}</td><td><b>{line.quantity.toLocaleString("en-IN")}</b></td><td className="financial-column">{money(line.unitPrice)}</td><td className="financial-column"><b>{money(line.quantity * line.unitPrice)}</b></td><td>{line.remarks?.trim() || "—"}</td></tr>)}</tbody></table></div><div className="order-total financial-column"><span>Order total</span><b>{money(orderTotal(order))}</b></div>{packingInstructions(order) && <div className="profile-empty"><b>Packing</b><br/>{packingInstructions(order)}</div>}
      {showOrderHistory && <section className="confirmed-order-history"><div><span className="overline">{isConfirmed ? "CONFIRMED" : "DRAFT"} ORDER HISTORY</span><h3>Changes to this order</h3><p>Who changed what, with the recorded time.</p></div>{readableOrderHistory.length ? readableOrderHistory.map((event) => <article className={/\b(added|increased)\b/i.test(event.readableDetails) ? "history-positive" : /\b(removed|reduced)\b/i.test(event.readableDetails) ? "history-negative" : ""} key={event.id}><div><b>{event.action}</b><span>{event.actor_email}{event.readableDetails ? ` · ${event.readableDetails}` : ""}</span></div><time>{new Date(event.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></article>) : <p className="profile-empty">No order changes recorded yet.</p>}</section>}
    </section>
  </Shell>;
}
function PurchaseOrderViewModal({ purchase, close }: { purchase: PurchaseOrder; close: () => void }) {
  const ordered = purchase.lines.reduce((sum, line) => sum + line.quantity, 0);
  const received = purchase.lines.reduce((sum, line) => sum + receivedPurchaseQuantity(line), 0);
  return <Shell close={close} wide><div className="order-modal-head"><div className="modal-mark"><ShipWheel size={22}/></div><div><span className="overline">PURCHASE ORDER · {purchase.id}</span><h2>{purchase.supplier || "Supplier not assigned"}</h2><p>Created {purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</p></div></div><div className="form-row"><div className="profile-empty"><b>Status</b><br/><Pill value={purchase.status}/></div><div className="profile-empty"><b>Ordered quantity</b><br/>{ordered.toLocaleString("en-IN")}</div><div className="profile-empty"><b>Received quantity</b><br/>{received.toLocaleString("en-IN")}</div></div><div className="modal-section-title">Products to receive</div><div className="table-wrap"><table className="records"><thead><tr><th>SKU</th><th>PRODUCT</th><th>ORDERED</th><th>RECEIVED</th><th>REMAINING</th></tr></thead><tbody>{purchase.lines.map((line, index) => { const lineReceived = receivedPurchaseQuantity(line); return <tr key={`${line.sku}-${index}`}><td><b>{line.sku || "—"}</b></td><td>{line.product || "—"}</td><td>{line.quantity.toLocaleString("en-IN")}</td><td>{lineReceived.toLocaleString("en-IN")}</td><td><b>{Math.max(0, line.quantity - lineReceived).toLocaleString("en-IN")}</b></td></tr>; })}</tbody></table></div>{purchase.notes && <div className="profile-empty"><b>Notes</b><br/>{purchase.notes}</div>}</Shell>;
}
function Clients({
  clients,
  edit,
  view,
  importCustomers,
  remove,
}: {
  clients: Client[];
  edit: (c: Client) => void;
  view: (c: Client) => void;
  importCustomers: (file?: File) => void;
  remove: (ids: number[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const importRef = useRef<HTMLInputElement>(null);
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
        <div className="panel-head-actions"><button className="outline" type="button" onClick={() => csvDownload("geebee-customers-template.csv", ["Customer ID", "Business Name", "Contact Person", "City", "Phone", "WhatsApp Group Link", "Payment Terms", "Payment Threshold", "Status"], [["GB-C001", "Example Party Store", "Amit Shah", "Delhi", "9876543210", "https://chat.whatsapp.com/example", "30 days", "50000", "Active"]])}>Download customer template</button><button className="outline" type="button" onClick={() => csvDownload("geebee-customers-export.csv", ["Customer ID", "Business Name", "Contact Person", "City", "Phone", "WhatsApp Group Link", "Payment Terms", "Payment Threshold", "Status"], clients.map((client) => [client.customerId || "", client.name, client.contact || "", client.city || "", client.phone || "", client.whatsappGroupLink || "", client.paymentTerms || "", client.credit || "", client.customerStatus || "Active"]))}>Export customers</button><button className="outline" type="button" onClick={() => importRef.current?.click()}>Import customer sheet</button><input ref={importRef} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={(event) => { importCustomers(event.target.files?.[0]); event.currentTarget.value = ""; }}/></div>
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
const leadStages: LeadStage[] = ["New", "Contacted", "Requirement Received", "Quotation Sent", "Negotiation", "Order Created", "Lost"];
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
const shareDispatchApprovalSheet = async (order: Order, whatsappWindow?: Window | null) => { const { jsPDF } = await import("jspdf"); const pdf = new jsPDF("p", "mm", "a4"); const left = 14, top = 22, width = 182, row = 9, columns = [0, 45, 80, 112, 150, 182]; const lines = linesFor(order); pdf.setFillColor(199, 226, 237); pdf.rect(left, top, width, row, "F"); pdf.rect(left, top + row, width, row, "F"); pdf.setTextColor(20, 34, 40); pdf.setFontSize(11); pdf.text(`DATE- ${new Date().toLocaleDateString("en-GB").replaceAll("/", ".")}`, 105, top + 6, { align: "center" }); pdf.setFontSize(12); pdf.text(order.client.toUpperCase(), 105, top + 15, { align: "center" }); pdf.setFillColor(255, 239, 0); pdf.rect(left, top + row * 2, width, row, "F"); pdf.setFontSize(8.5); ["ITEM", "QUANTITY", "PRICE", "VALUE", "REMARKS"].forEach((label, index) => pdf.text(label, left + (columns[index] + columns[index + 1]) / 2, top + row * 2 + 6, { align: "center" })); lines.forEach((line, index) => { const y = top + row * (3 + index); pdf.setDrawColor(75, 75, 75); pdf.rect(left, y, width, row); columns.slice(1, -1).forEach((offset) => pdf.line(left + offset, y, left + offset, y + row)); pdf.setTextColor(25, 25, 25); pdf.setFontSize(8); pdf.text(line.sku || line.product, left + 2, y + 5.8); pdf.text(String(line.quantity), left + 77, y + 5.8, { align: "right" }); pdf.text(String(line.unitPrice), left + 109, y + 5.8, { align: "right" }); pdf.text(String(Math.round(line.quantity * line.unitPrice)), left + 147, y + 5.8, { align: "right" }); }); const totalY = top + row * (3 + lines.length); pdf.setDrawColor(75, 75, 75); pdf.rect(left, totalY, width, row); columns.slice(1, -1).forEach((offset) => pdf.line(left + offset, totalY, left + offset, totalY + row)); pdf.setFontSize(9); pdf.text(order.transporter || "TRANSPORTER", left + 55, totalY + 6, { align: "center" }); pdf.text("TOTAL", left + 130, totalY + 6, { align: "center" }); pdf.text(String(Math.round(orderTotal(order))), left + 178, totalY + 6, { align: "right" }); pdf.setFontSize(9); pdf.setTextColor(104, 29, 43); pdf.text(`GeeBee dispatch client approval · Order ${order.id}`, left, totalY + 18); const filename = `GeeBee-dispatch-approval-${order.id}.pdf`; const blob = pdf.output("blob"); const file = new File([blob], filename, { type: "application/pdf" }); const message = `Dear ${order.client}, please approve the attached GeeBee dispatch order ${order.id}. Reply APPROVED or share any required changes.`; if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `GeeBee order ${order.id}`, text: message }); return "shared"; } pdf.save(filename); const target = whatsappWindow || window.open("about:blank", "_blank"); if (target) target.location.href = "https://web.whatsapp.com"; return "downloaded"; };
const dispatchWhatsAppText = (order: Order) => {
  const rows = linesFor(order);
  const date = new Date().toLocaleDateString("en-GB").replaceAll("/", ".");
  // WhatsApp controls font size on the receiving phone. A short monospaced
  // block gives the most room available while retaining one product per row.
  // A word-joiner after each digit keeps WhatsApp from recognising long
  // quantities, prices, and totals as tappable phone-number-like text.
  // It is invisible when displayed or copied by the recipient.
  const plainNumber = (value: number) => String(value).replace(/\d/g, (digit) => `${digit}\u2060`);
  const itemRows = rows.map((line) => {
    const item = (line.sku || line.product || "ITEM").replace(/[^a-z0-9]/gi, "").toUpperCase();
    const quantity = plainNumber(Number(line.quantity));
    const rate = plainNumber(Number(line.unitPrice));
    const amount = plainNumber(Math.round(line.quantity * line.unitPrice));
    return `${item} ${quantity} ${rate} ${amount}`;
  }).join("\n");
  return `*GeeBee Dispatch Approval · ${order.id}*\nDATE - ${date}\n*${order.client.toUpperCase()}*\n\n\`\`\`\nSKU | QTY | RATE | AMT\n${itemRows}\n\`\`\`\n\n*TOTAL Rs. ${plainNumber(Math.round(orderTotal(order)))}*\n\nReply *APPROVED* or share changes.`;
};
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
function TasksDashboard({ tasks, leads, quotes, invoices, orders, toggle, edit, remove }: { tasks: SalesTask[]; leads: Lead[]; quotes: Quote[]; invoices: Invoice[]; orders: Order[]; toggle: (id: string) => void; edit: (task: SalesTask) => void; remove: (id: string) => void }) {
  const today = new Date().toISOString().slice(0, 10); const dueTasks = tasks.filter((task) => (task.status === "Open" && task.dueDate <= today) || (task.status === "Done" && task.dueDate === today)); const openTaskCount = dueTasks.filter((task) => task.status === "Open").length; const reminders = [
    ...quotes.filter((quote) => quote.status === "Sent").map((quote) => `Follow up quotation ${quote.id} for ${quote.customer}`),
    ...invoices.filter((invoice) => invoice.status !== "Paid").map((invoice) => `Payment due: ${invoice.id} · ${invoice.client}`),
    ...leads.filter((lead) => ["New", "Contacted", "Requirement Received", "Quotation Sent", "Negotiation"].includes(lead.status)).map((lead) => `Enquiry pending: ${lead.id} · ${lead.company}`),
    ...orders.filter((order) => order.status === "In transit" || order.status === "Customs clearance").map((order) => `Track delivery: ${order.id} · ${order.client}`),
  ].slice(0, 6);
  return <section className="tasks-workspace"><div className="task-day-card"><div><span className="overline">DAILY TASKS</span><h2>My tasks & follow-ups</h2><p>These are your private tasks. Completed tasks stay visible today with a strike-through.</p></div><b>{openTaskCount} open</b></div><div className="tasks-grid"><section className="panel task-list"><h3>Today & overdue</h3>{dueTasks.sort((a, b) => `${a.dueDate}${a.time}`.localeCompare(`${b.dueDate}${b.time}`)).map((task) => <article key={task.id} className={task.status === "Done" ? "done" : ""}><time>{task.dueDate === today ? task.time : `${task.dueDate.slice(5)} ${task.time}`}</time><button type="button" className="task-check" onClick={() => toggle(task.id)}>{task.status === "Done" ? "✓" : ""}</button><div><b>{task.title}</b><span>{task.type}{task.relatedTo ? ` · ${task.relatedTo}` : ""}{task.description ? ` · ${task.description}` : ""}</span></div><button className="edit-btn" type="button" onClick={() => edit(task)}><Pencil size={14}/></button>{task.status !== "Done" && <button className="row-delete" type="button" onClick={() => remove(task.id)} aria-label={`Delete ${task.title}`}><Trash2 size={14}/></button>}</article>)}{!dueTasks.length && <p className="profile-empty">No active tasks for today.</p>}</section><section className="panel reminder-list"><h3>Automatic reminders</h3><p>Generated from CRM records needing attention.</p>{reminders.map((reminder) => <article key={reminder}><span>!</span>{reminder}</article>)}{!reminders.length && <p className="profile-empty">No reminders need attention.</p>}</section></div></section>;
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
    {report === "Payment Report" && <><section className="panel"><h3>Outstanding invoices</h3><div className="report-list">{openInvoices.sort((a, b) => amount(b.amount) - amount(a.amount)).slice(0, 8).map((invoice) => <article key={invoice.id}><span>{invoice.id} · {invoice.client}</span><b>{displayMoney(invoice.amount)}</b></article>)}{!openInvoices.length && <p className="profile-empty">No outstanding invoices.</p>}</div></section><section className="panel"><h3>Recent collections</h3><div className="report-list">{invoices.filter((invoice) => invoice.status === "Paid").slice(0, 8).map((invoice) => <article key={invoice.id}><span>{invoice.id} · {invoice.client}</span><b>{displayMoney(invoice.amount)}</b></article>)}{!invoices.some((invoice) => invoice.status === "Paid") && <p className="profile-empty">No paid invoices recorded yet.</p>}</div></section></>}
  </div></section>;
}
function DispatchPlanPanel({ orders, view, cancel, returnToConfirmed, markSent }: { orders: Order[]; view: (order: Order) => void; cancel: (order: Order) => void; returnToConfirmed: (order: Order) => void; markSent: (order: Order) => void }) {
  const [showCancelled, setShowCancelled] = useState(false); const active = orders.filter((order) => order.status === "Dispatch plan"); const cancelled = orders.filter((order) => order.status === "Cancelled" && order.cancelledFromDispatch);
  return <section className="panel record-panel dispatch-plan-panel"><div className="panel-head"><div><span className="overline">OPERATIONS HANDOFF</span><h2>Dispatch Plan</h2><p>Orders reach this stage after customer approval has been sent and recorded in Confirmed Orders. Operations can now prepare, pack and dispatch them.</p></div></div><OrderTable orders={active} edit={view} view={view} readOnly cancel={cancel} returnToOrders={returnToConfirmed} returnLabel="Return to Confirmed" advance={markSent} advanceLabel="Mark sent to customer" showDispatchDetails hidePrint />{cancelled.length > 0 && <section className="dispatch-cancelled"><button type="button" onClick={() => setShowCancelled((current) => !current)}><span>{showCancelled ? "⌄" : "›"}</span> Cancelled from Dispatch Plan <b>{cancelled.length}</b></button>{showCancelled && <OrderTable orders={cancelled} edit={view} view={view} readOnly showDispatchDetails hidePrint />}</section>}</section>;
}
function FulfilmentPanel({ title, description, orders, edit, cancel, remove, advance, advanceLabel }: { title: string; description: string; orders: Order[]; edit: (order: Order) => void; cancel: (order: Order) => void; remove?: (ids: string[]) => void; advance?: (order: Order) => void; advanceLabel?: string }) {
  return <section className="panel record-panel dispatch-plan-panel"><div className="panel-head"><div><span className="overline">FULFILMENT TRACKING</span><h2>{title}</h2><p>{description}</p></div></div><OrderTable orders={orders} edit={edit} cancel={cancel} remove={remove} advance={advance} advanceLabel={advanceLabel} /></section>;
}
function BackordersPanel({ orders, clients, edit, cancel, remove }: { orders: Order[]; clients: Client[]; edit: (order: Order) => void; cancel: (order: Order) => void; remove?: (ids: string[]) => void }) {
  return <section className="panel record-panel"><div className="panel-head"><div><span className="overline">BACKORDER & ADVANCE ORDER</span><h2>Advance order register</h2><p>Only quantities unavailable in free stock appear here. Each advance order is editable and has its own PDF.</p></div></div><OrderTable orders={orders} edit={edit} cancel={cancel} remove={remove} sendWhatsApp={(order) => { const client = clients.find((item) => item.name === order.client); openWhatsApp(client?.whatsapp || client?.phone || "", `Dear ${order.client}, your GeeBee advance order #${order.id} is pending future dispatch. Advance value: ${money(orderTotal(order))}.`); }} /></section>;
}
function LeadsPanel({ leads, edit, updateStage, remove }: { leads: Lead[]; edit: (lead: Lead) => void; updateStage: (id: string, status: LeadStage) => void; remove: (id: string) => void }) {
  return <section className="panel record-panel leads-panel"><div className="panel-head"><div><span className="overline">ENQUIRY → QUOTE → ORDER</span><h2>Enquiry pipeline</h2><p>Move an enquiry forward directly from its stage. A lost reason is requested immediately; active-stage changes create follow-up tasks.</p></div><div className="lead-stage-summary">{leadStages.slice(0, 6).map((stage) => <span key={stage}><b>{leads.filter((lead) => lead.status === stage).length}</b>{stage}</span>)}</div></div><div className="table-wrap"><table className="records"><thead><tr><th>ENQUIRY</th><th>COMPANY / CONTACT</th><th>SOURCE</th><th>REQUIREMENT</th><th>EXPECTED VALUE</th><th>OWNER</th><th>EXPECTED DATE</th><th>STAGE</th><th/></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} className={lead.status === "Order Created" ? "lead-converted" : undefined}><td><b>{lead.id}</b></td><td><div><b>{lead.company}</b><small className="table-subtext">{lead.contact} · {lead.mobile} · {lead.city}</small></div></td><td>{lead.source}</td><td className="lead-requirement">{lead.requirement}</td><td><b>{lead.expectedValue || "—"}</b></td><td>{lead.salesperson || "—"}</td><td>{lead.expectedDate ? new Date(lead.expectedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td><td><select className="lead-stage-select" value={lead.status} onChange={(event) => updateStage(lead.id, event.target.value as LeadStage)}>{leadStages.map((stage) => <option key={stage}>{stage}</option>)}</select>{lead.status === "Lost" && <small className="table-subtext">{lead.lostReason || "Reason needed"}</small>}</td><td><div className="record-actions"><button className="edit-btn" type="button" onClick={() => edit(lead)} aria-label={`Edit ${lead.id}`}><Pencil size={14}/></button><button className="row-delete" type="button" onClick={() => window.confirm(`Remove ${lead.id}?`) && remove(lead.id)} aria-label={`Remove ${lead.id}`}><Trash2 size={14}/></button></div></td></tr>)}</tbody></table>{!leads.length && <div className="empty">No enquiries in this view. Create one to start the sales pipeline.</div>}</div></section>;
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
    <div className="client-contact-grid"><div><span>Customer ID</span><b>{client.customerId || `GB-C${String(client.id).padStart(4, "0")}`}</b></div><div><span>Primary contact</span><b>{client.contact || "—"}</b></div><div><span>Mobile</span><b>{client.phone || "—"}</b></div><div><span>WhatsApp</span><b>{client.whatsapp || client.phone || "—"}</b></div><div><span>WhatsApp group</span>{client.whatsappGroupLink ? <a href={client.whatsappGroupLink} target="_blank" rel="noreferrer">Open group</a> : <b>—</b>}</div><div><span>Email</span><b>{client.email || "—"}</b></div><div><span>Customer category</span><b>{client.customerCategory || "—"}</b></div></div>
    <section className="profile-section"><div className="profile-section-head"><h3>Business information</h3><span>{client.customerStatus || "Active"}</span></div><div className="customer-details-grid"><div><span>Business type</span><b>{client.businessType || "—"}</b></div><div><span>GSTIN</span><b>{client.gstin || "—"}</b></div><div><span>PAN</span><b>{client.pan || "—"}</b></div><div><span>State</span><b>{client.state || "—"}</b></div><div><span>City</span><b>{client.city || "—"}</b></div><div><span>Pincode</span><b>{client.pincode || "—"}</b></div><div className="customer-address"><span>Address</span><b>{client.address || "—"}</b></div></div></section>
    <div className="client-stat-grid"><div><span>Total billing</span><b>{money(billed)}</b><small>{clientInvoices.length} invoice{clientInvoices.length === 1 ? "" : "s"}</small></div><div><span>Paid</span><b>{money(paid)}</b><small>{clientInvoices.filter((invoice) => invoice.status === "Paid").length} settled</small></div><div><span>Outstanding</span><b className={outstanding ? "attention" : ""}>{money(outstanding)}</b><small>{clientInvoices.filter((invoice) => invoice.status !== "Paid").length} open invoice{clientInvoices.filter((invoice) => invoice.status !== "Paid").length === 1 ? "" : "s"}</small></div><div><span>Total order value</span><b>{money(clientOrders.reduce((total, order) => total + orderTotal(order), 0))}</b><small>{clientOrders.length} order{clientOrders.length === 1 ? "" : "s"}</small></div></div>
    <section className="profile-section"><div className="profile-section-head"><h3>Commercial information</h3><span>{client.assignedSalesperson || "No salesperson assigned"}</span></div><div className="customer-details-grid"><div><span>Credit limit</span><b>{client.credit || "—"}</b></div><div><span>Payment terms</span><b>{client.paymentTerms || "—"}</b></div><div><span>Average order value</span><b>{money(averageOrder)}</b></div><div><span>Last order date</span><b>{lastOrder ? new Date(lastOrder.eta).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</b></div><div><span>Assigned salesperson</span><b>{client.assignedSalesperson || "—"}</b></div><div><span>Customer status</span><b>{client.customerStatus || "Active"}</b></div></div></section>
    <section className="profile-section"><div className="profile-section-head"><h3>Special SKU rates</h3><span>{client.specialRates?.length || 0} negotiated</span></div>{client.specialRates?.length ? <div className="profile-rates">{client.specialRates.map((rate) => <article key={rate.sku}><div><b>{rate.sku}</b><span>{rateName(rate.sku)}</span></div><strong>{money(rate.rate)}</strong></article>)}</div> : <p className="profile-empty">No special rates set. Standard catalogue pricing applies.</p>}</section>
    <section className="profile-section"><div className="profile-section-head"><h3>Invoices & payment status</h3><span>{clientInvoices.length} records</span></div>{clientInvoices.length ? <div className="profile-list">{clientInvoices.map((invoice) => <article key={invoice.id}><div><b>{invoice.id}</b><span>Order {invoice.order} · Due {invoice.due}</span></div><strong>{displayMoney(invoice.amount)}</strong><Pill value={invoice.status}/></article>)}</div> : <p className="profile-empty">No invoices have been recorded for this client.</p>}</section>
    <section className="profile-section"><div className="profile-section-head"><h3>Related orders</h3><span>{clientOrders.length} records</span></div>{clientOrders.length ? <div className="profile-list">{clientOrders.map((order) => <article key={order.id}><div><b>{order.id}</b><span>{order.product}{order.products && order.products.length > 1 ? ` +${order.products.length - 1} products` : ""} · ETA {order.eta}</span></div><strong>{money(orderTotal(order))}</strong><Pill value={order.payment}/></article>)}</div> : <p className="profile-empty">No orders have been recorded for this client.</p>}</section>
    <section className="profile-section"><div className="profile-section-head"><h3>Customer timeline</h3><span>Latest activity</span></div><div className="customer-timeline">{timelineEvents.map((event) => <article key={event.id}><span className="timeline-dot"/><div><b>{event.action}</b><p>{event.actor_email} · {event.module}</p></div><time>{new Date(event.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></article>)}{clientInvoices.slice(0, 3).map((invoice) => <article key={`invoice-${invoice.id}`}><span className="timeline-dot invoice"/><div><b>Invoice {invoice.id} is {invoice.status.toLowerCase()}</b><p>{displayMoney(invoice.amount)} · Due {invoice.due}</p></div></article>)}{clientOrders.slice(0, 3).map((order) => <article key={`order-${order.id}`}><span className="timeline-dot order"/><div><b>Order {order.id}</b><p>{order.product} · {money(orderTotal(order))}</p></div></article>)}{!timelineEvents.length && !clientInvoices.length && !clientOrders.length && <p className="profile-empty">Activity will appear here as this customer is engaged.</p>}</div></section>
  </Shell>;
}
function GoogleSheetOrderFetch({ existingOrders, addOrders, onAudit, showDraftOrders }: { existingOrders: Order[]; addOrders: React.Dispatch<React.SetStateAction<Order[]>>; onAudit: (action: string, module: string, details: string) => void; showDraftOrders: () => void }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const fetchOrders = async () => {
    if (!supabase) return;
    setLoading(true); setMessage(""); setDetails([]);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in again before fetching orders.");
      const response = await fetch("/api/import/google-sheet-orders", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Connected Sheet could not be fetched.");
      const importedOrders = (result.orders || []) as Order[];
      const updatedOrders = (result.updated || []) as Order[];
      const cloudDrafts = (result.draftOrders || [...updatedOrders, ...importedOrders]) as Order[];
      // Use the live state inside each setter.  Props can be a moment behind
      // after a cloud refresh, and customer master data must always merge —
      // never be replaced — when Sheet orders are fetched.
      addOrders((current) => {
        const refreshed = new Map(cloudDrafts.map((order) => [order.id.trim().toLowerCase(), order]));
        const merged = current.map((order) => refreshed.get(order.id.trim().toLowerCase()) || order);
        const known = new Set(current.map((order) => order.id.trim().toLowerCase()));
        return [...merged, ...cloudDrafts.filter((order) => !known.has(order.id.trim().toLowerCase()))];
      });
      onAudit("Fetched connected Google Sheet orders", "Orders", `${importedOrders.length} new; ${updatedOrders.length} draft order(s) refreshed`);
      setMessage(importedOrders.length || updatedOrders.length ? `${importedOrders.length ? `${importedOrders.length} new draft order${importedOrders.length === 1 ? "" : "s"} imported` : ""}${importedOrders.length && updatedOrders.length ? "; " : ""}${updatedOrders.length ? `${updatedOrders.length} existing draft order${updatedOrders.length === 1 ? " was" : "s were"} refreshed from the Sheet` : ""}. New customer names remain only on the draft order and become customer profiles after Save order.` : cloudDrafts.length ? `No new orders were added. ${cloudDrafts.length} existing Draft order${cloudDrafts.length === 1 ? " was" : "s were"} reloaded from the CRM cloud.` : "No new orders found. Existing order IDs were skipped; your customer list was unchanged.");
      setDetails((result.skipped || []).slice(0, 12));
      if (cloudDrafts.length) window.setTimeout(showDraftOrders, 350);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connected Sheet could not be fetched."); }
    finally { setLoading(false); }
  };
  return <section className="panel transfer-panel"><div className="panel-head"><div><span className="overline">CONNECTED ORDER SHEET</span><h2>Fetch new orders from Google Sheets</h2><p>Reads your existing order tabs, such as <b>E-404 SHYAM BALLOON PATNA</b> or <b>E-269 (OR) SHYAM BALLOON STORE, PATNA</b>. Only order IDs not already in the CRM are imported, always as Draft orders. Unmatched customer names stay on the draft only until it is saved.</p></div><button className="primary" type="button" onClick={fetchOrders} disabled={loading}>{loading ? "Fetching orders…" : "Fetch new orders"}</button></div>{message && <p className="transfer-message">{message}</p>}{details.length > 0 && <div className="transfer-fields"><b>Skipped tabs</b><br/>{details.join(" · ")}</div>}</section>;
}

function ProductStockItemHistory({ sku, auditEvents, orders, currentAvailable, ledger = [] }: { sku: string; auditEvents: AuditEvent[]; orders: Order[]; currentAvailable: number; ledger?: InventoryLedgerEntry[] }) {
  type RecordedMovement = ProductStockMovement & { actor: string; createdAt: string; auditId?: number; derivedFromOrder?: boolean };
  type RecordedOrderChange = ConfirmedOrderProductChange & { orderId: string; client: string; actor: string; createdAt: string };
  // The ledger is the sole source of truth after the SKU ledger cutover. It
  // never mixes legacy audit estimates with current movements.
  const exactSku = sku.trim().toUpperCase();
  const ledgerRows = ledger.filter((entry) => entry.sku_id.trim().toUpperCase() === exactSku)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id - b.id);
  if (ledgerRows.length) {
    const opening = ledgerRows[0].previous_available;
    return <section className="product-stock-history"><div><span className="overline">THIS SKU · TRANSACTION LEDGER</span><h3>Inventory transaction history</h3><p>Opening balance: <b>{Number(opening).toLocaleString("en-IN")}</b> · Current available: <b>{currentAvailable.toLocaleString("en-IN")}</b>. Every row is processed in this exact order.</p></div><div className="table-wrap"><table className="records"><thead><tr><th>TIME / SEQ.</th><th>ORDER</th><th>TYPE</th><th>CHANGE</th><th>PREVIOUS</th><th>AVAILABLE</th><th>REFERENCE</th></tr></thead><tbody>{ledgerRows.map((entry) => <tr key={entry.id}><td><b>#{entry.id}</b><small className="table-subtext">{new Date(entry.occurred_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small></td><td><b>{entry.order_id}</b></td><td>{entry.transaction_type}</td><td className={entry.signed_quantity < 0 ? "product-history-change negative" : "product-history-change positive"}><b>{entry.signed_quantity < 0 ? "−" : "+"}{Math.abs(Number(entry.quantity)).toLocaleString("en-IN")}</b></td><td>{Number(entry.previous_available).toLocaleString("en-IN")}</td><td><b>{Number(entry.new_available).toLocaleString("en-IN")}</b></td><td>{entry.reference_transaction_id || "—"}</td></tr>)}</tbody></table></div></section>;
  }
  const clientByOrder = new Map(orders.map((order) => [order.id, order.client]));
  const auditedMovements = auditEvents.flatMap((event) => {
    if (event.action !== "Recorded Product / SKU stock movement") return [] as RecordedMovement[];
    try {
      const parsed = JSON.parse(event.details) as { orderId?: string; direction?: ProductStockMovement["direction"]; lines?: ProductStockMovement[] };
      if (!Array.isArray(parsed.lines) || !parsed.orderId || (parsed.direction !== "Dispatch" && parsed.direction !== "Return")) return [];
      return parsed.lines.filter((line) => line && line.sku).map((line) => ({ ...line, orderId: parsed.orderId || line.orderId, client: line.client || clientByOrder.get(parsed.orderId || line.orderId) || "Previous / unknown client", direction: parsed.direction || line.direction, actor: event.actor_email, createdAt: event.created_at, auditId: event.id }));
    } catch { return []; }
  });
  // Audit logging is useful, but a dispatch snapshot on the order is the
  // authoritative record. Include it when an older/failed audit write is
  // absent so every active Dispatch Plan order (including E-485) is visible.
  const auditedDispatchKeys = new Set(auditedMovements.filter((movement) => movement.direction === "Dispatch").map((movement) => `${movement.orderId}::${skuKey(movement.sku)}`));
  const activeDispatchStatuses = new Set(["Dispatch plan", "Sent to customer", "Received by customer"]);
  const snapshotMovements = orders
    .filter((order) => order.inventoryCommitted && activeDispatchStatuses.has(order.status))
    .flatMap((order) => (order.dispatchStockLines?.length ? order.dispatchStockLines : linesFor(order)).map((line) => ({ order, line })))
    .filter(({ order, line }) => skuKey(line.sku) === skuKey(sku) && !auditedDispatchKeys.has(`${order.id}::${skuKey(line.sku)}`))
    .map(({ order, line }) => ({ orderId: order.id, client: order.client, direction: "Dispatch" as const, sku: line.sku, product: line.product, quantity: line.quantity, before: 0, after: 0, actor: "Recovered from saved dispatch order", createdAt: order.dispatchedAt || "", derivedFromOrder: true }));
  const movements = [...auditedMovements, ...snapshotMovements].filter((movement) => skuKey(movement.sku) === skuKey(sku));
  const orderChanges = auditEvents.flatMap((event) => {
    if (event.action !== "Recorded confirmed order product change") return [] as RecordedOrderChange[];
    try {
      const parsed = JSON.parse(event.details) as { orderId?: string; client?: string; changes?: ConfirmedOrderProductChange[] };
      if (!parsed.orderId || !Array.isArray(parsed.changes)) return [];
      return parsed.changes.filter((change) => change && change.sku).map((change) => ({ ...change, orderId: parsed.orderId!, client: parsed.client || clientByOrder.get(parsed.orderId!) || "Previous / unknown client", actor: event.actor_email, createdAt: event.created_at }));
    } catch { return []; }
  }).filter((change) => skuKey(change.sku) === skuKey(sku)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const changeClass = (change: ConfirmedOrderProductChange["change"]) => {
    if (change === "Added" || change === "Quantity increased") return "product-history-change positive";
    if (change === "Removed" || change === "Quantity reduced") return "product-history-change negative";
    return "product-history-change";
  };
  const grouped = new Map<string, { client: string; orderId: string; dispatch?: RecordedMovement; returned?: RecordedMovement; first: string; latest: string }>();
  movements.filter((movement) => skuKey(movement.sku) === skuKey(sku)).forEach((movement) => {
    const key = movement.orderId;
    const current = grouped.get(key) || { client: movement.client || "Previous / unknown client", orderId: movement.orderId, first: movement.createdAt, latest: movement.createdAt };
    if (movement.direction === "Dispatch" && (!current.dispatch || movement.createdAt > current.dispatch.createdAt)) current.dispatch = movement;
    if (movement.direction === "Return" && (!current.returned || movement.createdAt > current.returned.createdAt)) current.returned = movement;
    if (movement.createdAt < current.first) current.first = movement.createdAt;
    if (movement.createdAt > current.latest) current.latest = movement.createdAt;
    grouped.set(key, current);
  });
  const rows = [...grouped.values()].sort((a, b) => a.first.localeCompare(b.first));
  const { startingBalance, runningBalance, balances } = stockMovementBalances(movements);
  const calculatedRows = rows.map((row) => ({ ...row,
    afterDispatch: row.dispatch ? balances.get(row.dispatch) : undefined,
    afterReturn: row.returned ? balances.get(row.returned) : undefined,
  }));
  return <section className="product-stock-history"><div><span className="overline">THIS SKU · ORDER HISTORY</span><h3>Order and stock history</h3><p>{startingBalance === undefined ? "Actual stock movements are shown below. A reliable opening balance was not recorded for the older history." : <>Tracked balance began at <b>{startingBalance.toLocaleString("en-IN")}</b>; order-history balance is <b>{(runningBalance ?? startingBalance).toLocaleString("en-IN")}</b>; current CRM available balance is <b>{currentAvailable.toLocaleString("en-IN")}</b>.</>}</p></div>{orderChanges.length > 0 && <><h4>Confirmed-order changes</h4><div className="table-wrap"><table className="records"><thead><tr><th>ORDER</th><th>CLIENT</th><th>CHANGE</th><th>QTY</th><th>BY</th></tr></thead><tbody>{orderChanges.map((change, index) => <tr key={`${change.orderId}-${change.createdAt}-${index}`}><td><b>{change.orderId}</b><small className="table-subtext">{new Date(change.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small></td><td>{change.client}</td><td><span className={changeClass(change.change)}>{change.change}</span></td><td className={changeClass(change.change)}><b>{change.change === "Confirmed" ? change.after.toLocaleString("en-IN") : `${change.before.toLocaleString("en-IN")} → ${change.after.toLocaleString("en-IN")}`}</b></td><td>{change.actor}</td></tr>)}</tbody></table></div></>}{calculatedRows.length > 0 && <><h4>Actual stock movement</h4><div className="table-wrap"><table className="records"><thead><tr><th>ORDER</th><th>CLIENT</th><th>SUBTRACTED</th><th>REMAINING</th><th>REVERSED</th><th>REMAINING</th></tr></thead><tbody>{calculatedRows.map((row) => <tr key={row.orderId}><td><b>{row.orderId}</b>{row.dispatch?.derivedFromOrder && <small className="table-subtext">Recovered from saved Dispatch Plan</small>}</td><td>{row.client}</td><td>{row.dispatch ? <b>−{row.dispatch.quantity.toLocaleString("en-IN")}</b> : "—"}</td><td>{row.dispatch ? <><b>{row.afterDispatch?.toLocaleString("en-IN") ?? "—"}</b>{row.dispatch.createdAt && <small className="table-subtext">{new Date(row.dispatch.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small>}</> : "—"}</td><td>{row.returned ? <b>+{row.returned.quantity.toLocaleString("en-IN")}</b> : "—"}</td><td>{row.returned ? <><b>{row.afterReturn?.toLocaleString("en-IN") ?? "—"}</b><small className="table-subtext">{new Date(row.returned.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small></> : "—"}</td></tr>)}</tbody></table></div></>}</section>;
}

function ProductStockInventoryPanel({ session, canApply, auditEvents, inventoryLedger, orders, releaseAllReservations, onAudit, query, onProductsSynced, onLiveBackup }: { session: Session; canApply: boolean; auditEvents: AuditEvent[]; inventoryLedger: InventoryLedgerEntry[]; orders: Order[]; releaseAllReservations: () => void; onAudit: (action: string, module: string, details: string) => void; query: string; onProductsSynced: React.Dispatch<React.SetStateAction<CatalogueItem[]>>; onLiveBackup: () => void }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<CatalogueItem[]>(() => readProductStockCache(session.user.id));
  const [editing, setEditing] = useState<CatalogueItem | null>(null);
  const visibleItems = items.filter((item) => `${item.sku} ${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()) || skuKey(item.sku).includes(skuKey(query)));
  const replaceItems = (products: CatalogueItem[]) => {
    setItems(products);
    saveProductStockCache(session.user.id, products);
    onProductsSynced(products);
  };
  const load = async () => {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/import/google-product-master", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Product Stock Inventory could not be loaded.");
      replaceItems(result.products || []);
      setMessage("Showing the last saved CRM copy. If the Google Sheet has changed, press Sync Google Sheet now to update this inventory.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Product Stock Inventory could not be loaded."); }
    finally { setLoading(false); }
  };
  const sync = async (mode: "sync" | "setup", background = false) => {
    if (!background) { setLoading(true); setMessage(""); }
    try {
      const passcode = mode === "sync" && !background ? window.prompt("Stock Master sync passcode: GeeBee2026\n\nEnter it to update CRM data from the Google Sheet.") : "";
      if (mode === "sync" && !background && passcode === null) { setLoading(false); return; }
      // Ledger-managed stock already carries every dispatch exactly once, so
      // it never needs the older YES/NO active-dispatch adjustment prompt.
      const activeDispatchOrders = inventoryLedger.length ? [] : orders.filter((order) => order.inventoryCommitted && ["Dispatch plan", "Sent to customer", "Received by customer"].includes(order.status));
      const activeDispatchLines = activeDispatchOrders.flatMap((order) => (order.dispatchStockLines?.length ? order.dispatchStockLines : linesFor(order)).map((line) => ({ sku: line.sku, product: line.product, quantity: line.quantity })));
      let sheetIncludesActiveDispatch = true;
      if (mode === "sync" && !background) {
        if (activeDispatchLines.length) {
          const answer = window.prompt(
            `There ${activeDispatchOrders.length === 1 ? "is" : "are"} ${activeDispatchOrders.length} active Dispatch order${activeDispatchOrders.length === 1 ? "" : "s"}.\n\nDoes the Sheet Available Stock already include the dispatched quantities?\n\nType YES = Sheet already includes Dispatch (normal).\nType NO = Sheet does NOT include Dispatch; CRM will subtract those quantities once and correct the Sheet.\nPress Cancel = do not sync anything.`,
            "YES",
          );
          if (answer === null) { setMessage("Sync cancelled. CRM and Google Sheet were not changed."); return; }
          const choice = answer.trim().toUpperCase();
          if (choice !== "YES" && choice !== "NO") { setMessage("Sync cancelled. Type YES or NO when you are ready; no data was changed."); return; }
          sheetIncludesActiveDispatch = choice === "YES";
        } else if (!window.confirm("Sync Product / SKUs from the Google Sheet now? This updates CRM inventory from the current Sheet values. Click Cancel to make no changes.")) {
          setMessage("Sync cancelled. CRM and Google Sheet were not changed.");
          return;
        }
      }
      const response = await fetch("/api/import/google-product-master", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ mode, passcode, sheetIncludesActiveDispatch, activeDispatchLines }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Product Stock Inventory could not be updated.");
      if (mode === "setup") { setMessage(result.message || "Blank Sheet headers and test rows are ready."); await load(); return; }
      replaceItems(result.products || []);
      onLiveBackup();
      const skipped = Array.isArray(result.skippedRows) ? result.skippedRows.length : 0;
      if (!background) {
        setMessage(`${result.scanned || 0} Sheet SKU(s) processed: ${result.updated || 0} updated, ${result.added || 0} added to the separate test inventory.${result.activeDispatchBalancesApplied ? ` ${result.activeDispatchBalancesApplied} active Dispatch balance${result.activeDispatchBalancesApplied === 1 ? " was" : "s were"} subtracted and written safely to the Sheet.` : ""}${result.cleanedPlaceholders ? ` ${result.cleanedPlaceholders} old incomplete product card${result.cleanedPlaceholders === 1 ? " was" : "s were"} removed.` : ""}${skipped ? ` ${skipped} incomplete Sheet row${skipped === 1 ? " needs" : "s need"} a Product Name or SKU ID.` : ""}`);
        onAudit("Synced test Product Stock Inventory", "Products", `${result.updated || 0} updated · ${result.added || 0} added`);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Product Stock Inventory could not be updated."); }
    finally { if (!background) setLoading(false); }
  };
  // Opening this section reads only its saved CRM copy. Google Sheets is
  // deliberately refreshed only when an administrator presses Sync.
  useEffect(() => { void load(); }, [session.access_token]);
  const saveEdit = async (item: CatalogueItem) => {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/import/google-product-master", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ item }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Product could not be updated.");
      setItems((current) => {
        const next = current.map((entry) => entry.id === result.item.id ? result.item : entry);
        saveProductStockCache(session.user.id, next);
        return next;
      }); onProductsSynced((current) => current.map((entry) => entry.id === result.item.id ? result.item : entry)); onLiveBackup(); setEditing(null); setMessage(`${result.item.sku} updated. Available Stock remains controlled by the Google Sheet.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Product could not be updated."); }
    finally { setLoading(false); }
  };
  const pendingSheetSync = items.filter((item) => item.sheetSyncPending).length;
  return <><section className="catalogue-page"><div className="catalogue-top"><div><span className="overline">PRODUCT MASTER</span><h2>Products / SKUs</h2><p>Your Google Sheet inventory is the product master for this section. Sync it only when the sheet has changed.</p></div><div className="catalogue-count"><b>{items.length}</b><span>SKUs</span></div></div><section className="catalogue-actions"><div className="catalogue-tip"><b>Google Sheet product master</b><p>Fields: SKU ID, Product Name, Category, Unit, Inner Qty, Outer Qty, Selling Price, Available Stock, Low Stock Alert, Image URL.</p></div><div className="button-row">{canApply && <button className="outline" type="button" disabled={loading} onClick={() => sync("setup")}>Set up blank sheet + test rows</button>}{canApply && <button className="outline" type="button" disabled={loading} onClick={releaseAllReservations}>Release all reservations</button>}<span className="sync-stock-action"><button className="primary" type="button" disabled={loading} onClick={() => sync("sync")}>{loading ? "Syncing…" : "Sync Google Sheet"}</button><small>Update CRM from Sheet</small></span></div></section>{pendingSheetSync > 0 && <p className="inventory-recon-message">{pendingSheetSync} SKU{pendingSheetSync === 1 ? "" : "s"} waiting for Stock Master sync. CRM inventory is already updated.</p>}{message && <p className="inventory-recon-message success">{message}</p>}<section className="catalogue-grid">{visibleItems.map((item) => <article className="catalogue-card" key={item.id} onClick={() => canApply && setEditing(item)}><div className="catalogue-image">{item.image ? <img src={item.image} alt={item.name} onError={(event) => { event.currentTarget.style.display = "none"; }}/> : <PackageCheck size={27}/>}<span>{item.category || "Uncategorised"}</span></div><div className="catalogue-info"><small title={item.sku}>{item.sku}</small><h3 title={item.name}>{item.name}</h3><p>{item.unitPrice ? `${money(item.unitPrice)} / ${item.unit || "pc"}` : "Price to be added"}</p><p className={`catalogue-stock ${availableStock(item) < 0 ? "negative-stock" : ""}`}>Available: <b>{availableStock(item).toLocaleString("en-IN")}</b>{availableStock(item) < 0 && " · Stock issue"}</p>{item.sheetSyncPending && <p className="catalogue-stock">Stock Master: <b>{item.sheetSyncError ? "sync retry pending" : "syncing…"}</b></p>}<ProductReservationSummary product={item} orders={orders}/><p className="catalogue-stock">Low alert: <b>{item.reorderThreshold ?? 0}</b></p>{canApply && <button className="edit-product" type="button" onClick={(event) => { event.stopPropagation(); setEditing(item); }}><Pencil size={13}/> Edit product</button>}</div></article>)}{!loading && !visibleItems.length && <div className="empty">No products match your search. Sync Google Sheet if the product master has changed.</div>}</section></section>{editing && <StockInventoryModal item={editing} auditEvents={auditEvents} orders={orders} close={() => setEditing(null)} save={saveEdit}/>}</>;
}

function ProductStockCategoriesPanel({ session, query, openCategory }: { session: Session; query: string; openCategory: (category: string) => void }) {
  const [items, setItems] = useState<CatalogueItem[]>(() => readProductStockCache(session.user.id));
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/import/google-product-master", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load product categories.");
        const products = (result.products || []) as CatalogueItem[];
        setItems(products); saveProductStockCache(session.user.id, products);
      } catch { /* Keep the last saved local product master visible. */ }
      finally { setLoading(false); }
    };
    void load();
  }, [session.access_token, session.user.id]);
  const groups = Array.from(new Set(items.map((item) => item.category?.trim() || "Uncategorised"))).sort((a, b) => a.localeCompare(b)).map((category) => [category, items.filter((item) => (item.category?.trim() || "Uncategorised") === category)] as const)
    .filter(([category, products]) => `${category} ${products.map((product) => `${product.sku} ${product.name}`).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="catalogue-page"><div className="catalogue-top"><div><span className="overline">PRODUCT MASTER</span><h2>Categories</h2><p>Categories are read directly from your Product / SKU Google Sheet inventory.</p></div><div className="catalogue-count"><b>{groups.length}</b><span>categories</span></div></div><section className="catalogue-grid">{groups.map(([category, products]) => { const image = categoryImages[category as keyof typeof categoryImages]; return <article className="catalogue-card category-card" key={category}><div className="catalogue-image">{image ? <img src={image} alt={`${category} category`} /> : <PackageCheck size={27}/>}<span>{products.length} SKU{products.length === 1 ? "" : "s"}</span></div><div className="catalogue-info"><small>CATEGORY</small><h3>{category}</h3><p>{products.slice(0, 4).map((product) => `${product.sku} · ${product.name}`).join(" · ")}{products.length > 4 ? ` +${products.length - 4} more` : ""}</p><button className="edit-product" type="button" onClick={() => openCategory(category)}>View products</button></div></article>; })}{!loading && !groups.length && <div className="empty">No categories have been added to Product / SKUs yet.</div>}</section></section>;
}

function StockInventoryModal({ item, auditEvents, orders, close, save }: { item: CatalogueItem; auditEvents: AuditEvent[]; orders: Order[]; close: () => void; save: (item: CatalogueItem) => void }) {
  const [form, setForm] = useState(item);
  const [inventoryLedger, setInventoryLedger] = useState<InventoryLedgerEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase?.auth.getSession() || { data: { session: null } };
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/inventory/ledger?sku=${encodeURIComponent(item.sku)}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json().catch(() => ({}));
      if (!cancelled && response.ok) setInventoryLedger(Array.isArray(result.ledger) ? result.ledger : []);
    })();
    return () => { cancelled = true; };
  }, [item.sku]);
  const update = <K extends keyof CatalogueItem>(key: K, value: CatalogueItem[K]) => setForm((current) => ({ ...current, [key]: value }));
  return <Shell close={close}><div className="order-modal-head"><div className="modal-mark"><PackageCheck size={22}/></div><div><span className="overline">SKU INVENTORY</span><h2>Edit product details</h2><p>Available Stock changes only through the SKU transaction ledger after its opening balance is set.</p></div></div><div className="modal-section-title">Product details</div><div className="form-row"><label>Product name<input value={form.name} onChange={(event) => update("name", event.target.value)} required/></label><label>SKU ID<input value={form.sku} onChange={(event) => update("sku", event.target.value.toUpperCase())} required/></label></div><div className="form-row"><label>Category<input value={form.category} onChange={(event) => update("category", event.target.value)}/></label><label>Unit<input value={form.unit || ""} onChange={(event) => update("unit", event.target.value)} placeholder="Piece"/></label></div><div className="form-row"><label>Inner qty<input value={form.innerQty || ""} onChange={(event) => update("innerQty", event.target.value)} /></label><label>Outer qty<input value={form.outerQty || ""} onChange={(event) => update("outerQty", event.target.value)} /></label></div><div className="form-row"><label>Selling price (₹)<input type="number" min="0" value={form.unitPrice || ""} onChange={(event) => update("unitPrice", Number(event.target.value))}/></label><label>Low-stock alert<input type="number" min="0" value={form.reorderThreshold ?? ""} onChange={(event) => update("reorderThreshold", Number(event.target.value))}/></label></div><label>Image URL<input value={form.image || ""} onChange={(event) => update("image", event.target.value)} placeholder="https://…"/></label><div className="stock-calculation"><span>Available stock <b>{availableStock(item).toLocaleString("en-IN")}</b></span><span>Ledger controlled</span></div><ProductStockItemHistory sku={item.sku} auditEvents={auditEvents} orders={orders} currentAvailable={availableStock(item)} ledger={inventoryLedger}/><button className="primary modal-submit" type="button" onClick={() => save(form)}>Save product details</button></Shell>;
}

function InventoryReconciliationPanel({ catalogue, session, canApply, apply, syncMaster, onAudit }: { catalogue: CatalogueItem[]; session: Session; canApply: boolean; apply: (matches: InventoryReconciliation[]) => void; syncMaster: (products: CatalogueItem[]) => void; onAudit: (action: string, module: string, details: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [matches, setMatches] = useState<InventoryReconciliation[]>([]);
  const [panelOnly, setPanelOnly] = useState<Array<{ sku: string; name: string; currentAvailable: number }>>([]);
  const [masterMessage, setMasterMessage] = useState("");
  const [masterOnly, setMasterOnly] = useState<Array<{ sku: string; name: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const syncProductMaster = async (mode: "sync" | "setup") => {
    setLoading(true); setMasterMessage(""); setMasterOnly([]);
    try {
      const response = await fetch("/api/import/google-product-master", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ mode }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Product master could not be read.");
      if (mode === "setup") { setMasterMessage(result.message || "Product Stock Inventory sheet is ready. You can now edit the test rows and sync it."); return; }
      const products = (result.products || []) as CatalogueItem[];
      syncMaster(products); setMasterOnly(result.crmOnly || []);
      setMasterMessage(`${result.scanned || products.length} sheet SKU(s) checked: ${result.updated || 0} updated and ${result.added || 0} added. Available stock now comes from this Sheet.`);
      onAudit("Synced Product Stock Inventory", "Products", `${result.updated || 0} updated · ${result.added || 0} added from Google Sheet`);
    } catch (error) { setMasterMessage(error instanceof Error ? error.message : "Product master could not be read."); }
    finally { setLoading(false); }
  };
  const reconcile = async (file?: File) => {
    if (!file) return;
    setLoading(true); setMessage(""); setMatches([]); setPanelOnly([]);
    try {
      const form = new FormData(); form.append("file", file);
      form.append("catalogue", JSON.stringify(catalogue.map((product) => ({ sku: product.sku, name: catalogueName(product), availableQuantity: availableStock(product) }))));
      const response = await fetch("/api/inventory/reconcile", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Stock sheet could not be reconciled.");
      const resultMatches = (result.matches || []) as InventoryReconciliation[];
      setMatches(resultMatches); setPanelOnly(result.panelOnly || []);
      const matched = resultMatches.filter((item) => item.status === "matched").length;
      setMessage(`${matched} sheet row${matched === 1 ? "" : "s"} matched. Review unmatched rows before applying quantities.`);
      onAudit("Reviewed inventory stock sheet", "Inventory", `${matched} matched · ${resultMatches.filter((item) => item.status !== "matched").length} need review`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Stock sheet could not be reconciled."); }
    finally { setLoading(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const matched = matches.filter((item) => item.status === "matched");
  const unresolved = matches.filter((item) => item.status !== "matched");
  const applyQuantities = () => {
    if (!matched.length) return;
    if (!window.confirm(`Update available quantity for ${matched.length} matched SKU${matched.length === 1 ? "" : "s"}? Unmatched sheet rows will not change any CRM stock.`)) return;
    apply(matched); setMessage(`${matched.length} matched available quantities applied. Unmatched rows remain unchanged for manual review.`);
  };
  return <section className="inventory-reconciliation"><section className="panel inventory-recon-list"><div className="panel-head"><div><span className="overline">GOOGLE SHEET MASTER</span><h2>Product Stock Inventory</h2><p>Your shared Sheet is the stock master. Sync updates matching SKU data and stock, adds new valid SKUs, and never deletes CRM-only products.</p></div><div className="button-row">{canApply && <button className="outline" type="button" onClick={() => syncProductMaster("setup")} disabled={loading}>Set up blank sheet + test rows</button>}<button className="primary" type="button" onClick={() => syncProductMaster("sync")} disabled={loading}>{loading ? "Syncing…" : "Fetch product master"}</button></div></div><p className="inventory-recon-message">Required columns: SKU ID, Product Name, Category, Unit, Inner Qty, Outer Qty, Selling Price, Available Stock, Low Stock Alert, Image URL.</p>{masterMessage && <p className="inventory-recon-message success">{masterMessage}</p>}{masterOnly.length > 0 && <div className="table-wrap"><table><thead><tr><th>CRM-only SKU</th><th>Product</th></tr></thead><tbody>{masterOnly.slice(0, 200).map((item) => <tr key={item.sku}><td><b>{item.sku}</b></td><td>{item.name}</td></tr>)}</tbody></table></div>}</section><div className="inventory-recon-hero"><div><span className="overline">MANUAL FALLBACK</span><h2>Reconcile available inventory</h2><p>For a one-off Excel stock file, upload it here. Unmatched rows are shown for review and are never applied automatically.</p></div><button className="primary" type="button" onClick={() => inputRef.current?.click()} disabled={loading}>{loading ? "Reading stock sheet…" : "Upload stock sheet"}</button><input ref={inputRef} className="visually-hidden" type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => reconcile(event.target.files?.[0])}/></div>{message && <p className={`inventory-recon-message ${matches.length ? "success" : ""}`}>{message}</p>}{matches.length > 0 && <><div className="inventory-recon-summary"><article><b>{matched.length}</b><span>Matched rows</span></article><article><b>{unresolved.length}</b><span>Need review</span></article><article><b>{panelOnly.length}</b><span>CRM-only SKUs</span></article></div><section className="panel inventory-recon-list"><div className="panel-head"><div><h2>Matched inventory</h2><p>These rows update only the live available quantity.</p></div>{canApply && <button className="primary" type="button" onClick={applyQuantities}>Apply {matched.length} quantities</button>}</div><div className="table-wrap"><table><thead><tr><th>Sheet product</th><th>Matched SKU</th><th>CRM product</th><th>Sheet qty</th><th>Current qty</th></tr></thead><tbody>{matched.slice(0, 500).map((item, index) => <tr key={`${item.sourceLabel}-${index}`}><td>{item.sourceLabel}</td><td><b>{item.sku}</b></td><td>{item.name}</td><td><b>{item.quantity.toLocaleString("en-IN")}</b></td><td>{(item.currentAvailable || 0).toLocaleString("en-IN")}</td></tr>)}</tbody></table></div></section>{unresolved.length > 0 && <section className="panel inventory-recon-list warning"><div className="panel-head"><div><h2>Unmapped or unclear sheet rows</h2><p>These rows are excluded from the update. Match or add them in Products / SKUs, then upload the sheet again.</p></div></div><div className="table-wrap"><table><thead><tr><th>Sheet product</th><th>Quantity</th><th>Reason</th><th>Possible matches</th></tr></thead><tbody>{unresolved.map((item, index) => <tr key={`${item.sourceLabel}-${index}`}><td><b>{item.sourceLabel}</b></td><td>{item.quantity.toLocaleString("en-IN")}</td><td><Pill value={item.status === "ambiguous" ? "Multiple matches" : "Not in CRM"}/></td><td>{item.candidates?.join(" · ") || "Add or correct this SKU in Products / SKUs"}</td></tr>)}</tbody></table></div></section>}{panelOnly.length > 0 && <section className="panel inventory-recon-list muted"><div className="panel-head"><div><h2>Products in CRM but absent from this sheet</h2><p>These records will not be changed.</p></div></div><div className="table-wrap"><table><thead><tr><th>SKU</th><th>CRM product</th><th>Current available qty</th></tr></thead><tbody>{panelOnly.slice(0, 500).map((item) => <tr key={item.sku}><td><b>{item.sku}</b></td><td>{item.name}</td><td>{item.currentAvailable.toLocaleString("en-IN")}</td></tr>)}</tbody></table></div></section>}</>}</section>;
}

function DataTransferPanel({ catalogue, clients, orders, invoices, leads, quotes, tasks, transporters, setCatalogue, setClients, setOrders, setInvoices, setLeads, setQuotes, setTasks, setTransporters, onAudit, canHardDelete, hardDelete }: { catalogue: CatalogueItem[]; clients: Client[]; orders: Order[]; invoices: Invoice[]; leads: Lead[]; quotes: Quote[]; tasks: SalesTask[]; transporters: Transporter[]; setCatalogue: any; setClients: any; setOrders: any; setInvoices: any; setLeads: any; setQuotes: any; setTasks: any; setTransporters: any; onAudit: (action: string, module: string, details: string) => void; canHardDelete: boolean; hardDelete: (scope: "Customers" | "Orders" | "Approved Orders" | "Dispatch Plan", ids: string[]) => number }) {
  const [module, setModule] = useState("Products / SKUs"); const [message, setMessage] = useState(""); const inputRef = useRef<HTMLInputElement>(null); const hardDeleteInputRef = useRef<HTMLInputElement>(null); const [deleteScope, setDeleteScope] = useState<"Customers" | "Orders" | "Approved Orders" | "Dispatch Plan">("Customers");
  const configs: Record<string, { headers: string[]; rows: () => unknown[][]; example: unknown[] }> = {
    "Products / SKUs": { headers: ["SKU", "Product Name", "Category", "Description", "Selling Price", "Available Quantity", "Reorder Threshold", "Inner Qty", "Outer Qty", "Image URL"], rows: () => catalogue.map((item) => [item.sku, item.name, item.category, item.description, item.unitPrice, availableStock(item), item.reorderThreshold || "", item.innerQty || "", item.outerQty || item.cartonQty || "", item.image || ""]), example: ["GB-BAL-001", "Birthday Balloon Set", "Balloons", "Assorted party balloons", "25", "1000", "100", "12", "144", "https://example.com/product-image.jpg"] },
    Customers: { headers: ["Customer ID", "Business Name", "City", "Phone", "WhatsApp Group Link", "Payment Terms", "Payment Threshold", "Status"], rows: () => clients.map((item) => [item.customerId || "", item.name, item.city, item.phone || "", item.whatsappGroupLink || "", item.paymentTerms || "", item.credit || "", item.customerStatus || ""]), example: ["GB-C001", "Example Party Store", "Delhi", "9876543210", "https://chat.whatsapp.com/example", "30 days", "50000", "Active"] },
    Orders: { headers: ["Order ID", "Customer", "City", "SKU", "Product", "Quantity", "Unit Price", "ETA", "Status", "Payment Status", "Transporter", "Remarks"], rows: () => orders.flatMap((order) => linesFor(order).map((line) => [order.id, order.client, order.city, line.sku, line.product, line.quantity, line.unitPrice, order.eta, order.status, order.payment, order.transporter || "", order.remarks || ""])), example: ["GB-10001", "Example Party Store", "Delhi", "GB-BAL-001", "Birthday Balloon Set", "100", "25", "2026-10-20", "Draft", "Partial", "Example Transport", ""] },
    Invoices: { headers: ["Invoice Number", "Customer", "Order", "Amount", "Due", "Status"], rows: () => invoices.map((item) => [item.id, item.client, item.order, item.amount, item.due, item.status]), example: ["INV-1001", "Example Party Store", "GB-10001", "2500", "2026-10-30", "Pending"] },
    Enquiries: { headers: ["Lead ID", "Company", "Contact Person", "Mobile", "City", "Source", "Assigned Salesperson", "Requirement", "Expected Order Value", "Expected Order Date", "Status"], rows: () => leads.map((item) => [item.id, item.company, item.contact, item.mobile, item.city, item.source, item.salesperson, item.requirement, item.expectedValue, item.expectedDate, item.status]), example: ["LEAD-1001", "Example Party Store", "Amit Shah", "9876543210", "Delhi", "WhatsApp", "Rahul", "Balloons", "25000", "2026-10-20", "New"] },
    Quotations: { headers: ["Quote Number", "Customer", "Products JSON", "GST %", "Freight", "Validity", "Payment Terms", "Delivery Terms", "Status", "Created At"], rows: () => quotes.map((item) => [item.id, item.customer, JSON.stringify(item.products), item.gst, item.freight, item.validity, item.paymentTerms, item.deliveryTerms, item.status, item.createdAt]), example: ["Q-1001", "Example Party Store", '[{"product":"Birthday Balloon Set","sku":"GB-BAL-001","quantity":100,"unitPrice":25,"discount":0}]', "18", "0", "2026-10-30", "30 days", "Ex works", "Draft", "2026-10-12"] },
    "Daily Tasks": { headers: ["Task ID", "Title", "Time", "Due Date", "Assignee", "Type", "Status", "Related To"], rows: () => tasks.map((item) => [item.id, item.title, item.time, item.dueDate, item.assignee, item.type, item.status, item.relatedTo || ""]), example: ["TASK-1001", "Call Example Party Store", "10:00", "2026-10-13", "Rahul", "Follow-up", "Open", ""] },
    Transporters: { headers: ["Record ID", "Transporter Name", "Contact Person", "Phone", "Email", "City", "Area", "GSTIN", "Service Type", "Notes"], rows: () => transporters.map((item) => [item.id, item.name, item.contact, item.phone, item.email, item.city, item.area || "", item.gstin, item.serviceType, item.notes]), example: ["1", "Example Transport", "Ravi", "9876543210", "", "Delhi", "Bawana", "", "Road", ""] },
  };
  const config = configs[module];
  const download = (template = false) => csvDownload(`geebee-${module.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${template ? "template" : "export"}.csv`, config.headers, template ? [config.example] : config.rows());
  const importFile = async (file?: File) => { if (!file) return; try { const rows = await readCsv(file); if (!rows.length) throw new Error("The uploaded sheet has no data rows."); const now = Date.now(); if (module === "Products / SKUs") setCatalogue((current: CatalogueItem[]) => { const incoming = rows.filter((row) => row.sku).map((row, index) => ({ id: now + index, sku: row.sku, name: row["product name"] || "", category: row.category || "", description: row.description || "", unitPrice: csvNumber(row["selling price"]), availableQuantity: csvNumber(row["available quantity"]), reorderThreshold: csvNumber(row["reorder threshold"]), innerQty: row["inner qty"] || "", outerQty: row["outer qty"] || "", cartonQty: row["outer qty"] || "", image: row["image url"] || "" } as CatalogueItem)); const map = new Map(incoming.map((item) => [skuKey(item.sku), item])); const present = new Set(current.map((item) => skuKey(item.sku))); return [...current.map((item) => map.has(skuKey(item.sku)) ? { ...item, ...map.get(skuKey(item.sku))!, id: item.id } : item), ...incoming.filter((item) => !present.has(skuKey(item.sku)))]; });
      else if (module === "Customers") setClients((current: Client[]) => { const incoming = rows.filter((row) => row["business name"]).map((row, index) => ({ id: now + index, customerId: row["customer id"] || `GB-C${now + index}`, name: row["business name"], city: row.city || "", phone: row.phone || "", contact: "", whatsappGroupLink: row["whatsapp group link"] || "", credit: row["payment threshold"] || "", paymentTerms: row["payment terms"] || "", customerStatus: row.status || "Active", avatar: initials(row["business name"]), specialRates: [] } as Client)); const map = new Map(incoming.map((item) => [item.name.toLowerCase(), item])); const present = new Set(current.map((item) => item.name.toLowerCase())); return [...current.map((item) => map.has(item.name.toLowerCase()) ? { ...item, ...map.get(item.name.toLowerCase())!, id: item.id } : item), ...incoming.filter((item) => !present.has(item.name.toLowerCase()))]; });
      else if (module === "Orders") setOrders((current: Order[]) => { const grouped = new Map<string, typeof rows>(); rows.filter((row) => row["order id"]).forEach((row) => grouped.set(row["order id"], [...(grouped.get(row["order id"]) || []), row])); const incoming = [...grouped.entries()].map(([id, lines]) => { const first = lines[0]; const products = lines.map((row) => ({ sku: row.sku, product: row.product || `Product ${row.sku}`, quantity: csvNumber(row.quantity), unitPrice: csvNumber(row["unit price"]) })); return { id, client: first.customer || "Customer", city: first.city || "", product: products[0]?.product || "", sku: products[0]?.sku || "", quantity: products[0]?.quantity || 0, unitPrice: products[0]?.unitPrice || 0, products, eta: first.eta || "", status: first.status || "Draft", payment: first["payment status"] || "Partial", transporter: first.transporter || "", remarks: first.remarks || "", avatar: initials(first.customer || "Customer") } as Order; }); const map = new Map(incoming.map((item) => [item.id, item])); const present = new Set(current.map((item) => item.id)); return [...current.map((item) => map.get(item.id) || item), ...incoming.filter((item) => !present.has(item.id))]; });
      else if (module === "Invoices") setInvoices((current: Invoice[]) => { const incoming = rows.filter((row) => row["invoice number"]).map((row) => ({ id: row["invoice number"], client: row.customer || "", order: row.order || "", amount: row.amount || "0", due: row.due || "", status: row.status || "Pending" } as Invoice)); const map = new Map(incoming.map((item) => [item.id, item])); const present = new Set(current.map((item) => item.id)); return [...current.map((item) => map.get(item.id) || item), ...incoming.filter((item) => !present.has(item.id))]; });
      else if (module === "Enquiries") setLeads((current: Lead[]) => { const incoming = rows.filter((row) => row["lead id"]).map((row) => ({ id: row["lead id"], company: row.company || "", contact: row["contact person"] || "", mobile: row.mobile || "", city: row.city || "", source: row.source || "Other", salesperson: row["assigned salesperson"] || "", requirement: row.requirement || "", expectedValue: row["expected order value"] || "", expectedDate: row["expected order date"] || "", status: row.status || "New", createdAt: new Date().toISOString() } as Lead)); const map = new Map(incoming.map((item) => [item.id, item])); const present = new Set(current.map((item) => item.id)); return [...current.map((item) => map.get(item.id) || item), ...incoming.filter((item) => !present.has(item.id))]; });
      else if (module === "Quotations") setQuotes((current: Quote[]) => { const incoming = rows.filter((row) => row["quote number"]).map((row) => { let products: QuoteProduct[] = []; try { products = JSON.parse(row["products json"] || "[]"); } catch { /* User can correct the quoted JSON and re-import. */ } return { id: row["quote number"], customer: row.customer || "", products, gst: csvNumber(row["gst %"]), freight: csvNumber(row.freight), validity: row.validity || "", paymentTerms: row["payment terms"] || "", deliveryTerms: row["delivery terms"] || "", status: row.status || "Draft", createdAt: row["created at"] || new Date().toISOString() } as Quote; }); const map = new Map(incoming.map((item) => [item.id, item])); const present = new Set(current.map((item) => item.id)); return [...current.map((item) => map.get(item.id) || item), ...incoming.filter((item) => !present.has(item.id))]; });
      else if (module === "Daily Tasks") setTasks((current: SalesTask[]) => { const incoming = rows.filter((row) => row["task id"]).map((row) => ({ id: row["task id"], title: row.title || "", time: row.time || "", dueDate: row["due date"] || "", assignee: row.assignee || "", type: row.type || "Other", status: row.status || "Open", relatedTo: row["related to"] || "" } as SalesTask)); const map = new Map(incoming.map((item) => [item.id, item])); const present = new Set(current.map((item) => item.id)); return [...current.map((item) => map.get(item.id) || item), ...incoming.filter((item) => !present.has(item.id))]; });
      else setTransporters((current: Transporter[]) => { const incoming = rows.filter((row) => row["transporter name"]).map((row, index) => ({ id: Number(row["record id"]) || now + index, name: row["transporter name"], contact: row["contact person"] || "", phone: row.phone || "", email: row.email || "", city: row.city || "", area: row.area || "", gstin: row.gstin || "", serviceType: row["service type"] || "", notes: row.notes || "" } as Transporter)); const map = new Map(incoming.map((item) => [item.name.toLowerCase(), item])); const present = new Set(current.map((item) => item.name.toLowerCase())); return [...current.map((item) => map.has(item.name.toLowerCase()) ? { ...item, ...map.get(item.name.toLowerCase())!, id: item.id } : item), ...incoming.filter((item) => !present.has(item.name.toLowerCase()))]; });
      onAudit("Imported spreadsheet records", "Import / Export", `${module}: ${rows.length} row(s)`); setMessage(`${rows.length} row(s) imported. Existing matching IDs/SKUs were updated.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The sheet could not be imported."); } finally { if (inputRef.current) inputRef.current.value = ""; } };
  const downloadDeleteTemplate = () => csvDownload(`geebee-${deleteScope.toLowerCase().replaceAll(" ", "-")}-hard-delete.csv`, [deleteScope === "Customers" ? "Customer ID or Business Name" : "Order ID"], [[deleteScope === "Customers" ? "GB-C001" : "GB-10001"]]);
  const importDeleteSheet = async (file?: File) => { if (!file) return; try { const rows = await readCsv(file); const field = deleteScope === "Customers" ? "customer id or business name" : "order id"; const ids = rows.map((row) => row[field] || Object.values(row)[0] || "").map(String).map((value) => value.trim()).filter(Boolean); if (!ids.length) throw new Error("The delete sheet needs at least one record ID."); if (!window.confirm(`Permanently delete ${ids.length} ${deleteScope} record(s)? This cannot be undone from the CRM. Google Sheets backups remain your recovery option.`)) return; const removed = hardDelete(deleteScope, ids); setMessage(removed ? `${removed} ${deleteScope} record${removed === 1 ? "" : "s"} permanently deleted.` : `No ${deleteScope} records matched the IDs and stage in this delete sheet.`); } catch (error) { setMessage(error instanceof Error ? error.message : "The delete sheet could not be read."); } finally { if (hardDeleteInputRef.current) hardDeleteInputRef.current.value = ""; } };
  return <section className="panel transfer-panel"><div className="panel-head"><div><span className="overline">BULK DATA TRANSFER</span><h2>Import & export CRM data</h2><p>Use the downloaded CSV in Excel or Google Sheets. Keep its headers unchanged; imported matching IDs and SKUs update existing records.</p></div></div><div className="transfer-grid"><section><label>Module<select value={module} onChange={(event) => { setModule(event.target.value); setMessage(""); }}>{Object.keys(configs).map((name) => <option key={name}>{name}</option>)}</select></label><p className="transfer-fields"><b>Sheet fields</b><br/>{config.headers.join(" · ")}</p><div className="transfer-actions"><button className="outline" type="button" onClick={() => download(true)}>Download blank template</button><button className="outline" type="button" onClick={() => download(false)}>Export current data</button><button className="primary" type="button" onClick={() => inputRef.current?.click()}>Import completed sheet</button><input ref={inputRef} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={(event) => importFile(event.target.files?.[0])}/></div></section><aside><b>Product images by link</b><p>For Products / SKUs, paste a publicly reachable direct image URL into <b>Image URL</b>. The complete image will display in the catalogue without uploading each file manually.</p><p>For orders, use one row per product line and repeat the same Order ID for products belonging to one order.</p></aside></div>{canHardDelete && <section className="transfer-hard-delete"><div><span className="overline">ADMIN ONLY · PERMANENT</span><h3>Hard delete selected records from a sheet</h3><p>Download the one-column delete sheet, add only the IDs to remove, then import it. Orders are deleted only from the selected stage. Deleting a confirmed or dispatch order safely releases its inventory allocation.</p></div><label>Delete from<select value={deleteScope} onChange={(event) => setDeleteScope(event.target.value as typeof deleteScope)}><option>Customers</option><option>Orders</option><option>Approved Orders</option><option>Dispatch Plan</option></select></label><div className="transfer-actions"><button className="outline" type="button" onClick={downloadDeleteTemplate}>Download hard-delete sheet</button><button className="bulk-delete" type="button" onClick={() => hardDeleteInputRef.current?.click()}>Import and permanently delete</button><input ref={hardDeleteInputRef} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={(event) => importDeleteSheet(event.target.files?.[0])}/></div></section>}{message && <p className="transfer-message">{message}</p>}</section>;
}

function RecoveryPanel({ canManage, session, applyRestore, clearBusinessData }: { canManage: boolean; session: Session; applyRestore: (data: SavedCrmData) => void; clearBusinessData: () => void }) {
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
  const clear = async () => { if (confirm !== "DELETE ALL BUSINESS DATA") { setMessage("Type DELETE ALL BUSINESS DATA exactly to enable the permanent clear."); return; } if (!window.confirm("Permanently delete all business data from the CRM and Google Sheet? SKU catalogue records will remain. This cannot be recovered.")) return; setLoading(true); setMessage(""); try { const response = await fetch("/api/admin/purge-business-data", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not clear business data."); clearBusinessData(); setConfirm(""); setCounts(null); setMessage("Business data was permanently cleared from the CRM and Google Sheet. SKU catalogue preserved."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not clear business data."); } finally { setLoading(false); } };
  return <section className="recovery-workspace"><section className="recovery-hero"><div className="recovery-icon"><RotateCcw size={25}/></div><div><span className="overline">ADMIN-ONLY DATA PROTECTION</span><h2>Recover CRM data from Google Sheets</h2><p>Check the fixed GeeBee backup first. A protected server snapshot of current CRM data is saved immediately before recovery.</p></div></section><section className="panel recovery-card"><div><h3>1. Inspect the latest backup</h3><p>Reads your private Google Sheet without changing any live CRM data.</p></div><button className="outline recovery-preview" type="button" onClick={preview} disabled={loading}>{loading ? "Checking backup…" : "Check Google Sheet backup"}</button></section>{counts && <section className="panel recovery-counts"><div><h3>2. Review backup contents</h3><p>Only continue if these counts are what you expect to restore.</p></div><div className="recovery-count-grid">{Object.entries(counts).map(([tab, count]) => <article key={tab}><b>{count}</b><span>{tab}</span></article>)}</div><label>To replace the current CRM with this backup, type <b>RESTORE GEEBEE</b><input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="RESTORE GEEBEE" autoComplete="off"/></label><button className="primary recovery-restore" type="button" onClick={restore} disabled={loading || confirm !== "RESTORE GEEBEE"}>{loading ? "Restoring safely…" : "Create snapshot and restore backup"}</button></section>}<section className="panel recovery-counts"><div><h3>Permanent business-data clear</h3><p>Deletes customers, orders, invoices, leads, quotes, tasks, transporters, purchase orders, audits and recovery snapshots from the CRM and Google Sheet. SKU catalogue records remain.</p></div><label>Type <b>DELETE ALL BUSINESS DATA</b><input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="DELETE ALL BUSINESS DATA" autoComplete="off"/></label><button className="bulk-delete" type="button" onClick={clear} disabled={loading || confirm !== "DELETE ALL BUSINESS DATA"}>{loading ? "Clearing permanently…" : "Permanently clear business data"}</button></section>{message && <p className={`recovery-message ${message.includes("completed") || message.includes("checked") || message.includes("permanently cleared") ? "success" : "error"}`}>{message}</p>}<p className="recovery-note">Recovery restores business records. Product images stored only in a browser are not included in Google Sheets backups.</p></section>;
}

function TeamAccess({ members, requests, workspaceOwnerId, canManage, onChange, onRequestsChange, onAudit, auditEvents }: { members: WorkspaceMember[]; requests: AccessRequest[]; workspaceOwnerId: string | null; canManage: boolean; onChange: (members: WorkspaceMember[]) => void; onRequestsChange: (requests: AccessRequest[]) => void; onAudit: (action: string, module: string, details: string) => void; auditEvents: AuditEvent[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const [modules, setModules] = useState<string[]>([moduleToken("Dashboard", "view")]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [selectedActivityUser, setSelectedActivityUser] = useState("");
  const setModuleAccess = (module: CrmModule, access: ModuleAccess | "") => setModules((current) => [...current.filter((token) => !token.startsWith(`${module}:`) && !legacyModuleGroups[token]?.includes(module)), ...(access ? [moduleToken(module, access)] : [])]);
  const toggle = (module: CrmModule) => setModuleAccess(module, memberModuleAccess(modules, module) ? "" : "edit");
  const reset = () => { setEmail(""); setRole("employee"); setModules([moduleToken("Dashboard", "view")]); setEditingId(null); };
  const save = async () => {
    if (!supabase || !workspaceOwnerId || !email.trim()) return;
    const payload = { workspace_owner_id: workspaceOwnerId, email: email.trim().toLowerCase(), role, modules: role === "admin" ? allModuleTokens() : modules };
    const { data: sessionData } = await supabase.auth.getSession(); const token = sessionData.session?.access_token;
    if (!token) { setMessage("Sign in again to approve access."); return; }
    const response = await fetch("/api/admin/access-requests", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json() as { member?: WorkspaceMember; error?: string };
    if (!response.ok || !result.member) { setMessage(result.error || "Could not save access."); return; }
    onChange([...members.filter((member) => member.id !== editingId && member.email !== payload.email), result.member]); onRequestsChange(requests.filter((request) => request.email.toLowerCase() !== payload.email)); onAudit(editingId ? "Updated employee access" : "Granted employee access", "Team access", `${payload.email} — ${payload.role}`); setMessage("Access saved."); reset();
  };
  const editMember = (member: WorkspaceMember) => { if (member.id === 0) return; setEditingId(member.id); setEmail(member.email); setRole(member.role); setModules(member.modules); setMessage(""); };
  const remove = async (member: WorkspaceMember) => { if (member.id === 0) return; if (!supabase || !window.confirm(`Remove ${member.email} from this workspace?`)) return; const { error } = await supabase.from("crm_workspace_members").delete().eq("id", member.id); if (error) { setMessage(error.message); return; } onChange(members.filter((item) => item.id !== member.id)); onAudit("Removed employee access", "Team access", member.email); };
  const reject = async (request: AccessRequest) => { if (!supabase || !window.confirm(`Reject access request from ${request.email}? They may submit a new request later.`)) return; const { data: sessionData } = await supabase.auth.getSession(); const token = sessionData.session?.access_token; if (!token) { setMessage("Sign in again to reject this request."); return; } const response = await fetch("/api/admin/access-requests", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ userId: request.user_id }) }); const result = await response.json(); if (!response.ok) { setMessage(result.error || "Could not reject this request."); return; } onRequestsChange(requests.filter((item) => item.user_id !== request.user_id)); onAudit("Rejected access request", "Team access", request.email); setMessage("Access request rejected."); };
  const transferOwner = async () => { if (!supabase) return; if (window.prompt("Type TRANSFER WORKSPACE to move all GeeBee CRM data to geebeecosmos0726@gmail.com and remove the old workspace owner.") !== "TRANSFER WORKSPACE") return; const { data } = await supabase.auth.getSession(); const token = data.session?.access_token; if (!token) { setMessage("Sign in again before transferring ownership."); return; } setMessage("Transferring workspace safely…"); const response = await fetch("/api/admin/transfer-workspace", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "TRANSFER WORKSPACE", targetEmail: "geebeecosmos0726@gmail.com" }) }); const result = await response.json(); if (!response.ok) { setMessage(result.error || "Workspace ownership could not be transferred."); return; } setMessage("Ownership transferred. Please sign in again as geebeecosmos0726@gmail.com."); await supabase.auth.signOut(); };
  const activityByUser = Array.from(new Set([...members.map((member) => member.email.toLowerCase()), ...auditEvents.map((event) => event.actor_email.toLowerCase())])).filter(Boolean).map((email) => ({ email, events: auditEvents.filter((event) => event.actor_email.toLowerCase() === email) }));
  const activeActivityUser = activityByUser.find((user) => user.email === selectedActivityUser) || activityByUser[0];
  if (!canManage) return <section className="panel coming"><div className="modal-mark"><Settings size={22}/></div><h2>Workspace access</h2><p>Your administrator controls which modules you can use.</p></section>;
  return <section className="panel team-access">
    <div className="panel-head"><div><h2>Team access</h2><p>Choose what every employee can see and change in each left-side CRM header.</p></div></div>
    {requests.length > 0 && <section className="access-request-list"><div><b>Pending access requests</b><small>Approve a user, then choose their access for each module.</small></div>{requests.map((request) => <article key={request.user_id}><div><b>{request.full_name || request.email}</b><small>{request.email}{request.phone ? ` · ${request.phone}` : ""} · requested {new Date(request.created_at).toLocaleDateString("en-IN")}</small></div><div className="access-request-actions"><button type="button" onClick={() => { setEditingId(null); setEmail(request.email); setRole("employee"); setModules([moduleToken("Dashboard", "view")]); setMessage("Choose View or Edit access for each header, then approve."); }}>Approve & assign</button><button className="reject" type="button" onClick={() => reject(request)}>Reject</button></div></article>)}</section>}
    <div className="team-grid"><div className="team-form"><b>{editingId ? "Edit employee access" : "Add employee"}</b><label>Employee email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="employee@company.com"/></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value as "admin" | "employee")}><option value="employee">Employee</option><option value="admin">Administrator — full edit access</option></select></label>{role === "employee" && <div className="module-picker"><span>Module access</span><small>View lets the employee read records. Edit lets them add, change and remove records.</small>{crmModules.map((module) => <label key={module}><span>{module}</span><select value={memberModuleAccess(modules, module) || ""} onChange={(event) => setModuleAccess(module, event.target.value as ModuleAccess | "")}><option value="">No access</option><option value="view">View only</option><option value="edit">View and edit</option></select></label>)}</div>}<div className="team-buttons"><button className="primary" type="button" onClick={save}>{editingId ? "Save access" : "Grant access"}</button>{editingId && <button type="button" className="text-btn" onClick={reset}>Cancel</button>}</div>{message && <p className="team-message">{message}</p>}</div>
    <div className="member-list"><b>Current team · {members.length}</b>{!members.length && <p>No active members yet.</p>}{members.map((member) => <article className="member-card" key={member.id}><div><b>{member.email}</b><small>{member.id === 0 || member.role === "admin" ? "Administrator — full edit access" : crmModules.filter((module) => memberModuleAccess(member.modules, module)).map((module) => `${module} (${memberModuleAccess(member.modules, module)})`).join(", ") || "No module access"}</small></div>{member.id !== 0 && <div><button type="button" onClick={() => editMember(member)}>Edit</button><button type="button" onClick={() => remove(member)}>Remove</button></div>}</article>)}</div></div>
    <section className="transfer-owner"><div><b>Transfer workspace ownership</b><p>Move all CRM records to <b>geebeecosmos0726@gmail.com</b> and remove the current owner from this workspace.</p></div><button className="bulk-delete" type="button" onClick={transferOwner}>Transfer to official GeeBee account</button></section>
    <section className="audit-trail"><div className="audit-toolbar"><div><h3>User activity</h3><p>Select a user to review their recorded CRM changes. Only administrators can view this log.</p></div>{activityByUser.length > 0 && <label>View activity for<select value={activeActivityUser?.email || ""} onChange={(event) => setSelectedActivityUser(event.target.value)}>{activityByUser.map((user) => <option key={user.email} value={user.email}>{user.email} · {user.events.length} activity{user.events.length === 1 ? "" : "ies"}</option>)}</select></label>}</div>{!activeActivityUser && <p className="audit-empty">Changes made after this update will appear here.</p>}{activeActivityUser && <section className="user-activity-group"><div className="user-activity-heading"><b>{activeActivityUser.email}</b><span>{activeActivityUser.events.length} recorded activit{activeActivityUser.events.length === 1 ? "y" : "ies"}</span></div>{!activeActivityUser.events.length && <p className="audit-empty">No recorded activity yet.</p>}{activeActivityUser.events.map((event) => <article className="audit-event" key={event.id}><div className="audit-dot"/><div><b>{event.action}</b><span>{event.module}{event.details ? ` · ${event.details}` : ""}</span></div><time>{new Date(event.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></article>)}</section>}</section>
  </section>;
  return <section className="panel team-access"><div className="panel-head"><div><h2>Team access</h2><p>Review access requests, then assign the correct role and modules.</p></div></div>{requests.length > 0 && <section className="access-request-list"><div><b>Pending access requests</b><small>These people signed in but cannot enter the CRM until you approve them.</small></div>{requests.map((request) => <article key={request.user_id}><div><b>{request.full_name || request.email}</b><small>{request.email}{request.phone ? ` · ${request.phone}` : ""} · requested {new Date(request.created_at).toLocaleDateString("en-IN")}</small></div><div className="access-request-actions"><button type="button" onClick={() => { setEditingId(null); setEmail(request.email); setRole("employee"); setModules(["Overview"]); setMessage("Choose role and modules, then approve access."); }}>Approve & assign</button><button className="reject" type="button" onClick={() => reject(request)}>Reject</button></div></article>)}</section>}<div className="team-grid"><div className="team-form"><b>{editingId ? "Edit employee access" : "Add employee"}</b><label>Employee email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="employee@company.com"/></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value as "admin" | "employee")}><option value="employee">Employee</option><option value="admin">Administrator</option></select></label>{role === "employee" && <div className="module-picker"><span>Allowed modules</span>{crmModules.map((module) => <label key={module}><input type="checkbox" checked={modules.includes(module)} onChange={() => toggle(module)}/>{module}</label>)}</div>}<div className="team-buttons"><button className="primary" type="button" onClick={save}>{editingId ? "Save access" : "Grant access"}</button>{editingId && <button type="button" className="text-btn" onClick={reset}>Cancel</button>}</div>{message && <p className="team-message">{message}</p>}</div><div className="member-list"><b>Current team · {members.length}</b>{!members.length && <p>No active members yet.</p>}{members.map((member) => <article className="member-card" key={member.id}><div><b>{member.email}</b><small>{member.id === 0 ? "Workspace owner — all modules" : member.role === "admin" ? "Administrator — all modules" : member.modules.join(", ")}</small></div>{member.id !== 0 && <div><button type="button" onClick={() => editMember(member)}>Edit</button><button type="button" onClick={() => remove(member)}>Remove</button></div>}</article>)}</div></div><section className="transfer-owner"><div><b>Transfer workspace ownership</b><p>Move all CRM records to <b>geebeecosmos0726@gmail.com</b> and remove the current owner from this workspace. The old login is not deleted from Google or Supabase.</p></div><button className="bulk-delete" type="button" onClick={transferOwner}>Transfer to official GeeBee account</button></section><div className="audit-trail"><div><h3>Recent activity</h3><p>Only administrators can see this log.</p></div>{!auditEvents.length && <p className="audit-empty">Changes made after this update will appear here.</p>}{auditEvents.map((event) => <article className="audit-event" key={event.id}><div className="audit-dot"/><div><b>{event.action}</b><span>{event.actor_email} · {event.module}{event.details ? ` · ${event.details}` : ""}</span></div><time>{new Date(event.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></article>)}</div></section>;
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
                  <div className="record-actions"><button className="whatsapp-action" type="button" onClick={() => { const client = clients.find((item) => item.name === i.client); openWhatsApp(client?.whatsapp || client?.phone || "", `Dear ${i.client}, Invoice #${i.id} has an outstanding amount of ${i.amount}. Due date: ${i.due}. Please contact GeeBee for any assistance.`); }} aria-label={`Send payment reminder for ${i.id}`}>WA</button><button className="whatsapp-action" type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`GeeBee Invoice ${i.id}\nCustomer: ${i.client}\nAmount: ${i.amount}\nDue: ${i.due}`)}`, "_blank", "noopener,noreferrer")} aria-label={`Share ${i.id} to a WhatsApp group`}>Group</button><button className="edit-btn" onClick={() => edit(i)} aria-label={`Edit ${i.id}`}><Pencil size={14} /></button><button className="row-delete" type="button" onClick={() => removeOne(i)} aria-label={`Remove ${i.id}`}><Trash2 size={14}/></button></div>
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
  wide = false,
  printDocument = false,
}: {
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
  printDocument?: boolean;
}) {
  return (
    <div className={`modal-backdrop${printDocument ? " dispatch-print-backdrop" : ""}`} onMouseDown={close}>
      <form className={`modal${wide ? " modal-wide" : ""}${printDocument ? " dispatch-print-modal" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
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
function OrderModal({ order, clients, catalogue, transporters, createClient, createTransporter, close, save }: { order: Order | null; clients: Client[]; catalogue: CatalogueItem[]; transporters: Transporter[]; createClient: (client: Client) => void; createTransporter: (transporter: Transporter) => void; close: () => void; save: (o: Order) => void }) {
  const base = order || { id: nextOrderNumber(), client: "", city: "", eta: "", status: "Draft", payment: "Partial", transporter: "", remarks: "", avatar: "" };
  // The old import marker was never a real packing instruction. Do not show
  // it as one when an older imported order is opened and saved again.
  const [f, setF] = useState({ ...base, remarks: /imported from connected google sheet/i.test(base.remarks || "") ? "" : base.remarks });
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
    const typed = String(value).trim();
    const typedSku = typed.split("·")[0]?.trim() || "";
    // A fetched order line always contains its SKU. Resolve that exact SKU
    // before considering a product name, because names can legitimately repeat.
    const catalogueProduct = catalogue.find((product) => key === "sku" ? skuKey(product.sku) === skuKey(typed) : skuKey(product.sku) === skuKey(typedSku)) || catalogue.find((product) => [`${product.sku} · ${catalogueName(product)}`, `${catalogueName(product)} · ${product.sku}`, catalogueName(product)].some((label) => label.toLowerCase() === typed.toLowerCase()));
    const selectedSku = catalogueProduct?.sku || (key === "sku" ? String(value) : updated.sku);
    const rate = specialRate(f.client, selectedSku) ?? catalogueProduct?.unitPrice;
    const masterPriceChanged = Boolean(catalogueProduct && rate !== undefined && updated.unitPrice > 0 && Math.abs(updated.unitPrice - rate) > 0.0001);
    return { ...updated, sku: selectedSku, product: catalogueProduct ? `${catalogueProduct.sku} · ${catalogueName(catalogueProduct)}` : updated.product, unitPrice: rate ?? updated.unitPrice, masterPriceChanged, review: catalogueProduct ? { ...updated.review, product: false } : updated.review };
  }));
  const useProductListPrice = (lineIndex: number) => {
    const line = products[lineIndex];
    const product = line && catalogue.find((item) => skuKey(item.sku) === skuKey(line.sku));
    if (!product) { window.alert("This product does not yet match a Product / SKU master record."); return; }
    const price = specialRate(f.client, product.sku) ?? product.unitPrice;
    if (!window.confirm(`Replace this line’s price with the current Product / SKU price (${money(price)})? Client special rates take priority.`)) return;
    setProducts((current) => current.map((item, index) => index === lineIndex ? { ...item, sku: product.sku, product: `${product.sku} · ${catalogueName(product)}`, unitPrice: price, masterPriceChanged: true, review: { ...item.review, product: false, price: false } } : item));
  };
  useEffect(() => {
    if (!catalogue.length) return;
    setProducts((current) => current.map((line) => {
      const product = catalogue.find((item) => skuKey(item.sku) === skuKey(line.sku));
      // SKU remains the source of truth for the product label. This never
      // changes an imported sheet price; rate replacement is user-triggered.
      return product ? { ...line, sku: product.sku, product: `${product.sku} · ${catalogueName(product)}`, review: { ...line.review, product: false } } : line;
    }));
  }, [catalogue]);
  const selectClient = (name: string) => { const client = clients.find((item) => item.name === name); setF({ ...f, client: name, city: client?.city || "", avatar: client?.avatar || initials(name) }); setProducts((current) => current.map((item) => ({ ...item, unitPrice: specialRate(name, item.sku) ?? item.unitPrice }))); };
  useEffect(() => {
    const productLines = document.querySelector(".product-lines");
    if (!productLines?.parentElement) return;
    const label = document.createElement("label"); label.className = "order-transporter-field"; label.textContent = "Transporter";
    const selector = document.createElement("select"); selector.setAttribute("aria-label", "Transporter"); selector.append(new Option("Select transporter (optional)", ""));
    transporters.forEach((item) => selector.append(new Option(`${item.name}${item.city ? ` · ${item.city}` : ""}${item.area ? ` · ${item.area}` : ""}`, item.name)));
    if (f.transporter && !transporters.some((item) => skuKey(item.name) === skuKey(f.transporter || ""))) selector.append(new Option(`${f.transporter} — not yet in transporters`, f.transporter));
    selector.value = f.transporter || "";
    selector.onchange = () => setF((current) => ({ ...current, transporter: selector.value }));
    label.append(selector); productLines.parentElement.insertBefore(label, productLines);
    return () => label.remove();
  }, [transporters, f.transporter]);
  useEffect(() => {
    const clientSelect = Array.from(document.querySelectorAll<HTMLSelectElement>("select")).find((select) => select.parentElement?.textContent?.trim().startsWith("Client"));
    if (!clientSelect || !f.client || clients.some((client) => client.name === f.client) || Array.from(clientSelect.options).some((option) => option.value === f.client)) return;
    const option = new Option(`${f.client} — will be created when you save`, f.client); clientSelect.append(option); clientSelect.value = f.client;
    return () => option.remove();
  }, [clients, f.client]);
  useEffect(() => {
    const clientSelect = Array.from(document.querySelectorAll<HTMLSelectElement>("select")).find((select) => select.parentElement?.textContent?.trim().startsWith("Client"));
    const label = clientSelect?.parentElement;
    if (!clientSelect || !label) return;
    clientSelect.style.display = "none";
    clientSelect.required = false;
    const input = document.createElement("input");
    input.value = f.client;
    input.placeholder = "Type or correct customer name";
    input.required = true;
    input.setAttribute("aria-label", "Customer name");
    input.setAttribute("list", "order-customer-search");
    const list = document.createElement("datalist");
    list.id = "order-customer-search";
    clients.forEach((client) => list.append(new Option(client.name, client.name)));
    document.body.append(list);
    const hint = document.createElement("small");
    hint.className = "table-subtext";
    hint.textContent = "Search and select an existing customer, or type a new/corrected name. A new customer profile is created only after Save order.";
    input.oninput = () => {
      const typedName = input.value;
      const matchedClient = clients.find((client) => client.name.trim().toLowerCase() === typedName.trim().toLowerCase());
      setF((current) => ({ ...current, client: typedName, city: matchedClient?.city || current.city, avatar: matchedClient?.avatar || initials(typedName) }));
    };
    label.append(input, hint);
    return () => { input.remove(); hint.remove(); list.remove(); clientSelect.style.display = ""; clientSelect.required = true; };
  }, [clients]);
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Customer name"]');
    if (input && document.activeElement !== input) input.value = f.client;
  }, [f.client]);
  useEffect(() => {
    const clientLabel = Array.from(document.querySelectorAll<HTMLLabelElement>("label")).find((label) => label.textContent?.trim().startsWith("Client"));
    if (!clientLabel?.parentElement) return;
    const label = document.createElement("label"); label.textContent = "Order ID";
    const input = document.createElement("input"); input.value = order?.id || base.id; input.placeholder = "GB-00001"; input.required = true;
    input.oninput = () => setF((current) => ({ ...current, id: input.value }));
    label.append(input); clientLabel.parentElement.insertBefore(label, clientLabel);
    return () => label.remove();
  }, [order?.id]);
  useEffect(() => { const capture = document.querySelector(".document-capture"); if (!capture) return; const button = document.createElement("button"); button.type = "button"; button.className = "outline"; button.textContent = "Download internal order sheet"; button.onclick = downloadInternalOrderFormat; capture.append(button); return () => button.remove(); }, []);
  useEffect(() => {
    const capture = document.querySelector(".document-capture");
    if (!capture) return;
    const label = document.createElement("label"); label.className = "upload-button"; label.innerHTML = "<span>Upload multiple order photos</span>";
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.multiple = true;
    input.onchange = () => scanDocuments(input.files);
    label.append(input); capture.append(label);
    return () => label.remove();
  }, [catalogue, clients, transporters]);
  useEffect(() => {
    const list = document.createElement("datalist"); list.id = "order-product-search";
    catalogue.forEach((product) => { const option = document.createElement("option"); option.value = `${product.sku} · ${catalogueName(product)}`; option.label = money(specialRate(f.client, product.sku) ?? product.unitPrice); list.append(option); });
    document.body.append(list);
    const productInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[aria-label="Product name"]'));
    const skuInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[aria-label="SKU ID"]'));
    productInputs.forEach((input) => { input.setAttribute("list", list.id); input.setAttribute("placeholder", "Type product name to search catalogue"); });
    skuInputs.forEach((input) => { input.style.display = "none"; input.required = false; });
    return () => { productInputs.forEach((input) => input.removeAttribute("list")); skuInputs.forEach((input) => { input.style.display = ""; input.required = true; }); list.remove(); };
  }, [catalogue, f.client]);
  useEffect(() => {
    const productLines = Array.from(document.querySelectorAll<HTMLElement>(".product-line"));
    const buttons: HTMLButtonElement[] = [];
    const removeButtons: HTMLButtonElement[] = [];
    productLines.forEach((productLine, index) => {
      // Existing multi-line orders already render their own remove button.
      // Add the same control for a one-line order, where it clears the line
      // instead of leaving the editor without any product input.
      if (!productLine.querySelector(".remove-line")) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-line";
        remove.textContent = "×";
        remove.title = "Remove this product line";
        remove.onclick = () => setProducts((current) => current.length === 1 ? [{ product: "", sku: "", quantity: 0, unitPrice: 0 }] : current.filter((_, lineIndex) => lineIndex !== index));
        productLine.append(remove);
        removeButtons.push(remove);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "outline inventory-price-action";
      button.textContent = "PLP";
      button.title = "Use Product List Price for this product only. Imported order-sheet prices remain unchanged unless you click this.";
      button.onclick = () => useProductListPrice(index);
      productLine.append(button);
      buttons.push(button);
    });
    return () => { buttons.forEach((button) => button.remove()); removeButtons.forEach((button) => button.remove()); };
  }, [catalogue, products, f.client]);
  useEffect(() => {
    // Product remarks are deliberately attached to the product line. This
    // preserves the Remarks column from an imported order sheet and keeps
    // a blank input available when the sheet cell is blank.
    const inputs: HTMLInputElement[] = [];
    Array.from(document.querySelectorAll<HTMLElement>(".product-line")).forEach((productLine, index) => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "product-line-remark";
      input.placeholder = "Product remark (optional)";
      input.setAttribute("aria-label", "Product remark");
      input.value = products[index]?.remarks || "";
      input.oninput = () => setProducts((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, remarks: input.value } : line));
      productLine.append(input);
      inputs.push(input);
    });
    return () => inputs.forEach((input) => input.remove());
  }, [products.length]);
  useEffect(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Optional order remark"]');
    const label = textarea?.parentElement;
    if (!textarea || !label) return;
    const text = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() === "Remarks");
    if (text) text.textContent = "Packing";
    textarea.placeholder = "Packing instructions (optional)";
  }, []);
  useEffect(() => {
    const productInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[aria-label="Product name"]'));
    const controls: HTMLButtonElement[] = [];
    productInputs.forEach((input, index) => {
      const field = input.parentElement; if (!field) return;
      const button = document.createElement("button"); button.type = "button"; button.className = "new-product-option";
      const refresh = () => {
        const line = products[index]; const typed = line?.product.trim() || "";
        const matched = typed && catalogue.some((product) => [`${product.sku} · ${catalogueName(product)}`, `${catalogueName(product)} · ${product.sku}`, catalogueName(product)].some((label) => label.toLowerCase() === typed.toLowerCase()));
        button.textContent = matched ? "Selected from catalogue" : typed ? `Create “${typed}” as new product` : "+ Create new product";
        button.disabled = Boolean(matched);
      };
      refresh(); input.addEventListener("input", refresh);
      button.onclick = () => {
        const current = products[index]; const name = window.prompt("New product name", current?.product || "")?.trim(); if (!name) return;
        const sku = window.prompt("SKU for this new product", current?.sku || "")?.trim(); if (!sku) return;
        if (catalogue.some((product) => skuKey(product.sku) === skuKey(sku))) { window.alert("This SKU already exists in the catalogue. Select it from the product list instead, or use a different SKU."); return; }
        setProducts((currentLines) => currentLines.map((line, lineIndex) => lineIndex === index ? { ...line, product: name, sku: sku.toUpperCase(), unitPrice: line.unitPrice || 0, review: { ...line.review, product: true } } : line));
      };
      field.append(button); controls.push(button);
    });
    return () => controls.forEach((button) => button.remove());
  }, [catalogue, products]);
  useEffect(() => {
    const applyReview = (selector: string, reviewKey: "product" | "quantity" | "price", message: string) => Array.from(document.querySelectorAll<HTMLInputElement>(selector)).forEach((input, index) => {
      const needsReview = Boolean(products[index]?.review?.[reviewKey]);
      input.classList.toggle("import-review", needsReview);
      input.setAttribute("aria-invalid", String(needsReview));
      input.title = needsReview ? message : "";
    });
    applyReview('input[aria-label="Product name"]', "product", "Please verify this product: the SKU was repaired from OCR or could not be matched exactly.");
    applyReview('input[aria-label="Quantity"]', "quantity", "Please verify this quantity: it was unclear in the uploaded image.");
    applyReview('input[aria-label="Unit price"]', "price", "Please verify this price: it was unclear in the uploaded image.");
    Array.from(document.querySelectorAll<HTMLInputElement>('input[aria-label="Unit price"]')).forEach((input, index) => {
      const line = input.closest(".product-line");
      line?.querySelector(".master-price-note")?.remove();
      if (products[index]?.masterPriceChanged) {
        input.classList.add("import-review");
        input.title = "This rate was applied manually from the current Product / SKU master.";
        const note = document.createElement("small");
        note.className = "master-price-note";
        note.textContent = "Price applied from Product / SKU master";
        line?.append(note);
      }
    });
  }, [products]);
  const scanDocument = async (file: File, append = false) => {
    setPreview(URL.createObjectURL(file)); setScanState("scanning"); setScanNote("Reading image and finding product lines…");
    try {
      const recognisedSheet = await readInternalOrderSheetImage(file);
      const rawText = recognisedSheet ? "" : await readOrderImageText(file);
      const internalSheet = recognisedSheet || parseInternalOrderSheet(rawText);
      if (internalSheet) {
        const matchedClient = clients.find((client) => client.name.trim().toLowerCase() === internalSheet.client.trim().toLowerCase());
        const clientName = matchedClient?.name || internalSheet.client;
        const matchedTransporter = transporters.find((item) => skuKey(item.name) === skuKey(internalSheet.transporter || ""));
        const transporterName = matchedTransporter?.name || internalSheet.transporter || "";
        setF((current) => ({ ...current, client: clientName || current.client, city: matchedClient?.city || current.city, eta: internalSheet.eta || current.eta, transporter: transporterName || current.transporter || "", avatar: matchedClient?.avatar || initials(clientName || current.client) }));
        const importedLines = internalSheet.products.map((line) => {
          const scannedSku = skuKey(line.sku);
          const exactMatch = catalogue.find((item) => skuKey(item.sku) === scannedSku);
          // A missing first letter (AB-956 read as B-956) is a common OCR
          // error. Repair it only when exactly one catalogue SKU fits. Never
          // choose between several possible SKUs.
          const repairedMatches = exactMatch ? [] : catalogue.filter((item) => {
            const knownSku = skuKey(item.sku);
            return knownSku.startsWith(scannedSku) || scannedSku.startsWith(knownSku) || (scannedSku.length >= 3 && knownSku.endsWith(scannedSku));
          });
          const catalogueMatch = exactMatch || (repairedMatches.length === 1 ? repairedMatches[0] : undefined);
          const inferredProduct = Boolean(!exactMatch && catalogueMatch);
          // Uploaded sheets provide SKU and quantity only. Pricing always
          // comes from the approved catalogue, with an agreed client-specific
          // rate taking priority when one exists.
          const unitPrice = catalogueMatch ? specialRate(clientName || f.client, catalogueMatch.sku) ?? catalogueMatch.unitPrice : 0;
          return {
            product: catalogueMatch ? `${catalogueMatch.sku} · ${catalogueName(catalogueMatch)}` : "",
            sku: catalogueMatch?.sku || line.sku,
            quantity: line.quantity || 0,
            unitPrice,
            review: { product: inferredProduct || !catalogueMatch || line.review?.product, quantity: !line.quantity || line.review?.quantity, price: !catalogueMatch }
          };
        });
        setProducts((current) => append ? [...current.filter((line) => line.sku || line.product || line.quantity), ...importedLines] : importedLines);
        setScanState("ready"); setScanNote(`GeeBee internal order sheet recognised: ${internalSheet.products.length} product line${internalSheet.products.length === 1 ? "" : "s"} added${clientName ? ` for ${clientName}` : ""}${transporterName ? ` with transporter ${transporterName}` : ""}. Please review the customer and transporter, then save the order. New names are created only when you save.${internalSheet.note ? ` Note: ${internalSheet.note}` : ""}`);
        return;
      }
      const text = rawText.replace(/\s+/g, " ");
      const matchedClient = clients.find((client) => text.toLowerCase().includes(client.name.toLowerCase()));
      if (matchedClient) selectClient(matchedClient.name);
      const sku = text.match(/(?:sku|item\s*code|code)\s*[:#-]?\s*([A-Z]{1,4}[- ]?\d{2,8})/i)?.[1]?.replace(" ", "-") || "";
      const quantity = Number(text.match(/(?:qty|quantity)\s*[:x-]?\s*(\d+)/i)?.[1] || 0);
      if (!sku || !quantity) throw new Error("This image did not contain a readable order row. Please use a sharp screenshot of the item, quantity and price columns.");
      const name = text.match(/(?:product|description|item)\s*[:#-]?\s*([A-Za-z][A-Za-z0-9 /&.-]{2,50})/i)?.[1]?.trim() || file.name.replace(/\.[^.]+$/, "").replaceAll(/[-_]/g, " ");
      const catalogueMatch = catalogue.find((item) => item.sku.replaceAll("-", "").toLowerCase() === sku.replaceAll("-", "").toLowerCase());
      const importedLine = { product: catalogueMatch ? `${catalogueMatch.sku} · ${catalogueName(catalogueMatch)}` : name, sku: catalogueMatch?.sku || sku, quantity, unitPrice: catalogueMatch ? specialRate(matchedClient?.name || f.client, catalogueMatch.sku) ?? catalogueMatch.unitPrice : 0, review: { product: !catalogueMatch, price: !catalogueMatch } };
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
  const saveOrder = () => { const first = products[0]; const clientName = f.client.trim(); const transporterName = (f.transporter || "").trim(); if (clientName && !clients.some((client) => client.name.trim().toLowerCase() === clientName.toLowerCase())) createClient({ id: Date.now(), customerId: `GB-C${String(Date.now()).slice(-4)}`, name: clientName, city: "", contact: "", phone: "", credit: "", customerStatus: "Prospect", avatar: initials(clientName), specialRates: [] }); if (transporterName && !transporters.some((transporter) => skuKey(transporter.name) === skuKey(transporterName))) createTransporter({ id: Date.now() + 1, name: transporterName, contact: "", phone: "", email: "", city: "", area: "", gstin: "", serviceType: "", notes: "" }); save({ ...f, client: clientName, transporter: transporterName, product: first.product, sku: first.sku, quantity: first.quantity, unitPrice: first.unitPrice, products }); };
  return <Shell close={close}><div className="order-modal-head"><div className="modal-mark"><PackageCheck size={22} /></div><div><span className="overline">ORDER WORKSPACE</span><h2>{order ? "Edit order" : "Create an order"}</h2><p>Capture a document or enter product lines yourself.</p></div></div><div className="document-capture"><div className="capture-copy"><div className="capture-icon"><ScanText size={19}/></div><div><b>Smart document capture</b><p>Upload a supplier PO, invoice, product-list image, or PDF.</p></div></div><label className="upload-button"><ImagePlus size={15}/><span>{scanState === "scanning" ? "Reading document…" : "Upload image or PDF"}</span><input type="file" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && scanDocument(e.target.files[0])} disabled={scanState === "scanning"}/></label>{preview && <img className="document-preview" src={preview} alt="Uploaded document preview"/>}{scanState !== "idle" && <div className={`scan-feedback ${scanState}`}><ScanText size={15}/>{scanNote}</div>}</div><div className="modal-section-title">Order details</div><label>Client<select value={f.client} onChange={(e) => selectClient(e.target.value)} required><option value="" disabled>Select a client</option>{clients.map((client) => <option key={client.id}>{client.name}</option>)}</select></label><div className="product-lines"><div className="line-heading"><b>Product lines</b><span>{products.length} item{products.length !== 1 ? "s" : ""}</span></div>{products.map((item, index) => <div className="product-line" key={index}><div className="line-number">{index + 1}</div><div className="line-fields"><input aria-label="Product name" value={item.product} onChange={(e) => updateProduct(index, "product", e.target.value)} placeholder="Product name" required /><input aria-label="SKU ID" value={item.sku} onChange={(e) => updateProduct(index, "sku", e.target.value)} placeholder="SKU ID" required /><input aria-label="Quantity" type="number" min="1" value={item.quantity || ""} onChange={(e) => updateProduct(index, "quantity", Number(e.target.value))} placeholder="Qty" required /><input aria-label="Unit price" type="number" min="0" value={item.unitPrice || ""} onChange={(e) => updateProduct(index, "unitPrice", Number(e.target.value))} placeholder="Price ₹" required />{(() => { const matched = catalogue.find((product) => skuKey(product.sku) === skuKey(item.sku)); return matched ? <small className="line-available">Available units: <b>{availableStock(matched).toLocaleString("en-IN")}</b></small> : null; })()}</div><b className="line-total">{money(item.quantity * item.unitPrice)}</b>{products.length > 1 && <button type="button" className="remove-line" onClick={() => setProducts(products.filter((_, i) => i !== index))}>×</button>}</div>)}<button type="button" className="add-line" onClick={() => setProducts([...products, { product: "", sku: "", quantity: 0, unitPrice: 0 }])}><Plus size={15} /> Add product line</button></div><div className="order-total"><span>Order total</span><b>{money(total)}</b></div><div className="form-row"><label>Expected arrival<input type="date" value={f.eta} onChange={(e) => setF({ ...f, eta: e.target.value })} required /></label><label>Status<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{["Confirmed", "Production", "In transit", "Customs clearance", "Delivered", "Backorder", "Advance order"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label>Payment status<select value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value })}>{["Partial", "Paid", "Overdue"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Remarks<textarea value={f.remarks || ""} onChange={(e) => setF({ ...f, remarks: e.target.value })} placeholder="Optional order remark"/></label><button className="primary modal-submit" type="button" onClick={saveOrder}>Save order</button></Shell>;
}
function LegacyCataloguePanel({ items, edit }: { items: CatalogueItem[]; edit: (item: CatalogueItem) => void }) {
  return <section className="catalogue-page"><section className="catalogue-hero"><div><span className="overline">YOUR PRODUCT LIBRARY</span><h2>Catalogue makes order capture reliable.</h2><p>Add your product images and SKU IDs once. Uploaded order images can then match the SKU to your approved product name and price.</p></div><div className="catalogue-stat"><b>{items.length}</b><span>catalogued SKUs</span></div></section><section className="catalogue-grid">{items.map((item) => <article className="catalogue-card" key={item.id}><div className="catalogue-image">{item.image ? <img src={item.image} alt={item.name}/> : <PackageCheck size={27}/>}<span>{item.category}</span></div><div className="catalogue-info"><small>{item.sku}</small><h3>{item.name}</h3><p>{money(item.unitPrice)} / pc</p><button className="edit-product" onClick={() => edit(item)}><Pencil size={13}/> Edit product</button></div></article>)}{!items.length && <div className="empty">No catalogue products match your search.</div>}</section></section>;
}
function CatalogueImportReview({ drafts, pages, confirm, cancel }: { drafts: CatalogueItem[]; pages: number; confirm: () => void; cancel: () => void }) {
  const skuCounts = new Map<string, number>(); drafts.forEach((item) => skuCounts.set(skuKey(item.sku), (skuCounts.get(skuKey(item.sku)) || 0) + 1));
  const duplicateCount = [...skuCounts.values()].filter((count) => count > 1).length;
  const incomplete = drafts.filter((item) => !item.sku || !item.name || !item.unitPrice || !item.image).length;
  return <section className="catalogue-page"><section className="panel"><div className="panel-head"><div><span className="overline">PDF IMPORT REVIEW</span><h2>Verify before saving</h2><p>This PDF produced {drafts.length} records across {pages} pages. Check SKU, details, price, and image before confirming.</p></div><div><button className="outline" type="button" onClick={cancel}>Cancel import</button><button className="primary" type="button" onClick={confirm}>Confirm import</button></div></div><div className="report-metrics"><div><span>Records read</span><b>{drafts.length}</b></div><div><span>Duplicate SKU warnings</span><b>{duplicateCount}</b></div><div><span>Incomplete records</span><b>{incomplete}</b></div></div>{(duplicateCount > 0 || incomplete > 0) && <div className="catalogue-notice error"><ScanText size={16}/>Review highlighted records carefully. Cancel if anything does not match the PDF.</div>}<div className="table-wrap" style={{ maxHeight: "58vh", overflow: "auto" }}><table className="records"><thead><tr><th>IMAGE</th><th>SKU</th><th>PRODUCT</th><th>OUTER QTY</th><th>INNER QTY</th><th>PRICE</th><th>CHECK</th></tr></thead><tbody>{drafts.map((item) => { const duplicate = (skuCounts.get(skuKey(item.sku)) || 0) > 1; const missing = !item.sku || !item.name || !item.unitPrice || !item.image; return <tr key={item.id} style={duplicate || missing ? { background: "#fff6dc" } : undefined}><td>{item.image ? <img src={item.image} alt={item.sku} style={{ width: 72, height: 54, objectFit: "contain", background: "#fff" }}/> : "Missing"}</td><td><b>{item.sku || "Missing SKU"}</b></td><td>{item.name || "Missing product name"}</td><td>{item.outerQty || item.cartonQty || "—"}</td><td>{item.innerQty || "—"}</td><td>{item.unitPrice ? money(item.unitPrice) : "Missing price"}</td><td>{duplicate ? "Duplicate SKU" : missing ? "Check details/image" : "Ready"}</td></tr>; })}</tbody></table></div><p className="catalogue-tip">Matching existing SKUs will be updated; only new SKUs will be added after confirmation.</p></section></section>;
}
function CategoriesPanel({ items, query, openCategory }: { items: CatalogueItem[]; query: string; openCategory: (category: string) => void }) {
  const groups = productCategories.map((category) => [category, items.filter((item) => categoriseProduct(item) === category)] as const)
    .filter(([category, products]) => `${category} ${products.map((product) => `${product.sku} ${catalogueName(product)}`).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="catalogue-page"><div className="catalogue-top"><div><span className="overline">PRODUCT ORGANISATION</span><h2>Categories</h2><p>Categories and covers are aligned with the live GeeBee website. Every SKU is grouped below its category; search by category, SKU or product, then open it in the catalogue.</p></div><div className="catalogue-count"><b>{groups.length}</b><span>categories</span></div></div><section className="catalogue-grid">{groups.map(([category, products]) => <article className="catalogue-card category-card" key={category}><div className="catalogue-image">{categoryImages[category] ? <img src={categoryImages[category]} alt={`${category} category`} /> : <PackageCheck size={27}/>}<span>{products.length} SKU{products.length === 1 ? "" : "s"}</span></div><div className="catalogue-info"><small>CATEGORY</small><h3>{category}</h3><p>{products.slice(0, 4).map((product) => `${catalogueSku(product)} · ${catalogueName(product)}`).join(" · ")}{products.length > 4 ? ` +${products.length - 4} more` : ""}</p><button className="edit-product" type="button" onClick={() => openCategory(category)}>View products</button></div></article>)}{!groups.length && <div className="empty">No category or product matches your search.</div>}</section></section>;
}
function CataloguePanel({ items, edit, duplicate, addDrafts, setAllOpeningStock, remove, attentionOnly = false, showAll }: { items: CatalogueItem[]; edit: (item: CatalogueItem) => void; duplicate: (item: CatalogueItem) => void; addDrafts: (drafts: CatalogueItem[]) => void; setAllOpeningStock: (quantity: number) => void; remove: (ids: number[]) => void; attentionOnly?: boolean; showAll?: () => void }) {
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
  const downloadProductExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = items.map((item) => ({
      "Product Name": catalogueName(item),
      "SKU ID": catalogueSku(item),
      "Inner Qty": item.innerQty || "",
      "Outer Qty": item.outerQty || item.cartonQty || "",
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Products & SKUs");
    XLSX.writeFile(workbook, "geebee-products-skus.xlsx");
  };
  const importCatalogueImage = async (file?: File) => {
    if (!file) return;
    setScanState("scanning"); setNotice("Reading SKU IDs from your catalogue image…");
    try {
      const text = await readOrderImageText(file);
      const skus = [...new Set((text.toUpperCase().match(/\b[A-Z]{1,4}[- ]?\d{2,8}\b/g) || []).map((sku) => sku.replace(" ", "-")))];
      if (!skus.length) throw new Error("No SKUs found");
      const image = await fileToDataUrl(file);
      addDrafts(skus.map((sku, index) => ({ id: Date.now() + index, sku, name: `New product — ${sku}`, description: "", cartonQty: "", unitPrice: 0, category: "Uncategorised", image, availableQuantity: 10000 })));
      setScanState("ready"); setNotice(`${skus.length} SKU draft${skus.length === 1 ? "" : "s"} added. Open each card to add its product name and price.`);
    } catch (error) { setScanState("error"); setNotice(error instanceof Error ? error.message : "The catalogue file could not be read."); }
  };
  return <section className="catalogue-page"><div className="catalogue-top"><div><span className="overline">PRODUCT LIBRARY</span><h2>Your catalogue, ready for order matching.</h2><p>Upload individual product photos, or scan a complete catalogue image or PDF to create SKU drafts quickly.</p></div><div className="catalogue-count"><b>{items.length}</b><span>active SKUs</span></div></div><section className="catalogue-actions"><label className="catalogue-scan"><div className="scan-orb"><ScanText size={20}/></div><div><b>Scan catalogue image or PDF</b><p>Read SKU IDs from a complete catalogue page.</p></div><span className="scan-cta">Upload file <ImagePlus size={14}/></span><input type="file" accept="image/*,application/pdf" onChange={(e) => importCatalogueImage(e.target.files?.[0])} disabled={scanState === "scanning"}/></label><div className="catalogue-tip"><b>How it works</b><p>Catalogue SKUs are matched automatically when you scan an incoming order image or PDF.</p></div></section>{scanState !== "idle" && <div className={`catalogue-notice ${scanState}`}><ScanText size={16}/>{notice}</div>}<div className="catalogue-toolbar"><div><h3>Products</h3><span>{items.length} shown</span></div><div className="catalogue-toolbar-actions"><button type="button" className="bulk-delete" onClick={downloadProductExcel}><Download size={14}/> Download Excel</button><button type="button" className="bulk-delete" onClick={() => setAllOpeningStock(10000)}>Set all available: 10,000</button><button type="button" className="bulk-delete" onClick={() => setAllOpeningStock(20000)}>Set all available: 20,000</button>{selected.length > 0 && <button type="button" className="bulk-delete" onClick={removeSelected}><Trash2 size={14}/> Remove {selected.length} selected</button>}<span>Click a product to edit it, duplicate it, or select products to remove.</span></div></div><section className="catalogue-grid">{items.map((item) => <article className="catalogue-card" key={item.id} onClick={() => edit(item)}><div className="catalogue-image">{item.image ? <img src={item.image} alt={catalogueName(item)} onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <PackageCheck size={27}/>}<span>{item.category || "Uncategorised"}</span></div><div className="catalogue-info"><div className="catalogue-card-heading"><label className="catalogue-select" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelected(item.id)} aria-label={`Select ${catalogueName(item)}`}/><span>Select</span></label><small title={catalogueSku(item)}>{catalogueSku(item)}</small></div><h3 title={catalogueName(item)}>{catalogueName(item)}</h3><p>{item.unitPrice ? `${money(item.unitPrice)} / pc` : "Price to be added"}</p><p className="catalogue-stock">Available: <b>{availableStock(item).toLocaleString("en-IN")}</b></p><div className="catalogue-card-actions"><button type="button" className="edit-product"><Pencil size={13}/> Edit product</button><button type="button" className="edit-product" onClick={(event) => { event.stopPropagation(); duplicate(item); }}><Copy size={13}/> Duplicate</button><button type="button" className="delete-product" onClick={(event) => { event.stopPropagation(); removeOne(item); }}><Trash2 size={13}/> Remove</button></div></div></article>)}{!items.length && <div className="empty">No catalogue products match your search.</div>}</section></section>;
}
function CatalogueModal({ item, close, save }: { item: CatalogueItem | null; close: () => void; save: (item: CatalogueItem) => void }) {
  const initial: CatalogueItem = item || { id: Date.now(), name: "", sku: "", unitPrice: 0, category: "Party items", image: "", description: "", cartonQty: "", subCategory: "", brand: "GeeBee", unit: "Piece", packSize: "", moq: 0, purchasePrice: 0, wholesalePrice: 0, distributorPrice: 0, gst: 18, barcode: "", weight: "", dimensions: "", supplier: "", countryOfOrigin: "", availableQuantity: 10000, reservedStock: 0, reorderThreshold: 0 };
  const [form, setForm] = useState<CatalogueItem>(initial); const [preview, setPreview] = useState(initial.image);
  const isDuplicate = Boolean((item as (CatalogueItem & { duplicateFromId?: number }) | null)?.duplicateFromId);
  const update = (key: keyof CatalogueItem, value: string | number) => setForm({ ...form, [key]: value });
  const chooseImage = async (file?: File) => { if (!file) return; const image = await fileToDataUrl(file); setPreview(image); setForm({ ...form, image }); };
  const stockAvailable = availableStock(form); const stockFree = freeStock(form);
  return <Shell close={close}><div className="order-modal-head"><div className="modal-mark"><PackageCheck size={22}/></div><div><span className="overline">PRODUCT & SKU MASTER</span><h2>{isDuplicate ? "Duplicate product" : item ? "Edit product" : "Add a product"}</h2><p>{isDuplicate ? "A copy was created. Give it a new SKU before saving; its stock starts at 10,000." : "Keep only the product, packaging, price and live inventory details needed by GeeBee."}</p></div></div><label className="catalogue-upload">{preview ? <img src={preview} alt="Product preview"/> : <><ImagePlus size={23}/><b>Upload product image</b><span>PNG or JPG</span></>}<input type="file" accept="image/*" onChange={(e) => chooseImage(e.target.files?.[0])}/></label><div className="modal-section-title">Product details</div><div className="form-row"><label>Product name<input value={form.name} onChange={(e) => update("name", e.target.value)} required/></label><label>SKU<input value={form.sku} onChange={(e) => update("sku", e.target.value.toUpperCase())} placeholder="GB-BAL-001" required/></label></div><div className="form-row"><label>Category<select value={categoriseProduct(form)} onChange={(e) => update("category", e.target.value)}>{productCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Sub-category<input value={form.subCategory || ""} onChange={(e) => update("subCategory", e.target.value)}/></label></div><div className="form-row"><label>Brand<input value={form.brand || ""} onChange={(e) => update("brand", e.target.value)}/></label><label>Unit<select value={form.unit || "Piece"} onChange={(e) => update("unit", e.target.value)}>{["Piece", "Set", "Box", "Carton", "Kg", "Pair"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label>Description<textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Product details"/></label><div className="form-row"><label>Inner qty<input value={form.innerQty || ""} onChange={(e) => update("innerQty", e.target.value)} placeholder="e.g. 12"/></label><label>Outer qty<input value={form.outerQty || form.cartonQty || ""} onChange={(e) => { update("outerQty", e.target.value); update("cartonQty", e.target.value); }} placeholder="e.g. 144"/></label></div><div className="modal-section-title">Pricing</div><div className="form-row"><label>Supplier<input value={form.supplier || ""} onChange={(e) => update("supplier", e.target.value)} placeholder="Supplier for replenishment"/></label><label>Selling price (₹)<input type="number" min="0" value={form.unitPrice || ""} onChange={(e) => update("unitPrice", Number(e.target.value))} required/></label></div><div className="modal-section-title">Inventory controls</div><div className="stock-input-grid"><label>Available quantity<input type="number" min="0" value={form.availableQuantity ?? ""} onChange={(e) => update("availableQuantity", Number(e.target.value))}/></label><label>Low-stock alert at<input type="number" min="0" value={form.reorderThreshold || ""} onChange={(e) => update("reorderThreshold", Number(e.target.value))} placeholder="e.g. 500"/></label></div><div className="stock-calculation"><span>Available quantity <b>{stockAvailable.toLocaleString("en-IN")}</b></span><span>Free to order <b>{stockFree.toLocaleString("en-IN")}</b></span></div><button className="primary modal-submit" type="button" onClick={() => save({ ...form, category: categoriseProduct(form) })}>Save product</button></Shell>;
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
    whatsappGroupLink: "",
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
  return <Shell close={close}><div className="modal-mark"><Users size={22}/></div><h2>{client ? "Edit client" : "New client"}</h2><p>Only the customer details required for day-to-day orders and collections.</p><div className="form-row"><label>Business name<input value={f.name} onChange={(e) => set("name", e.target.value)} required/></label><label>City<input value={f.city} onChange={(e) => set("city", e.target.value)} required/></label></div><div className="form-row"><label>Primary contact<input value={f.contact || ""} onChange={(e) => set("contact", e.target.value)} placeholder="Contact person name"/></label><label>Phone number<input value={f.phone} onChange={(e) => set("phone", e.target.value)} required/></label></div><div className="form-row"><label>Payment threshold<input value={f.credit} onChange={(e) => set("credit", e.target.value)} placeholder="₹ 0" required/></label><label>Payment terms<select value={f.paymentTerms || ""} onChange={(e) => set("paymentTerms", e.target.value)}><option value="">Select payment terms</option>{["Advance", "7 days", "15 days", "30 days", "45 days", "60 days"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label>WhatsApp group link<input type="url" value={f.whatsappGroupLink || ""} onChange={(e) => set("whatsappGroupLink", e.target.value)} placeholder="https://chat.whatsapp.com/..."/><small>Optional. Confirmed orders will open this customer group directly.</small></label><label>Status<select value={f.customerStatus || "Active"} onChange={(e) => set("customerStatus", e.target.value)}>{["Active", "On hold", "Inactive", "Prospect", "Blocked"].map((value) => <option key={value}>{value}</option>)}</select></label><button className="primary modal-submit" type="button" onClick={() => save({ ...f, customerId: f.customerId || `GB-C${String(f.id).slice(-4)}`, contact: (f.contact || "").trim(), avatar: f.avatar || initials(f.name) })}>Save client</button></Shell>;
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
function TaskModal({ task, owner, close, save }: { task: SalesTask | null; owner: string; close: () => void; save: (task: SalesTask) => void }) {
  const initial: SalesTask = task || { id: `TASK-${String(Date.now()).slice(-6)}`, title: "", time: "10:00", dueDate: new Date().toISOString().slice(0, 10), assignee: owner, type: "Follow-up", status: "Open", relatedTo: "" };
  const [form, setForm] = useState<SalesTask>(initial);
  const set = (key: keyof SalesTask, value: string) => setForm({ ...form, [key]: value });
  return <Shell close={close}><div className="modal-mark"><ClipboardList size={22}/></div><h2>{task ? "Edit task" : "New task"}</h2><p>This is your personal Daily Task. Only you and administrators can view it.</p><label>Task<input value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="e.g. Follow-up customer" required/></label><label>Task description<textarea value={form.description || ""} onChange={(event) => set("description", event.target.value)} placeholder="Write the purpose, discussion points or next action"/></label><div className="form-row"><label>Date<input type="date" value={form.dueDate} onChange={(event) => set("dueDate", event.target.value)}/></label><label>Time<input type="time" value={form.time} onChange={(event) => set("time", event.target.value)}/></label></div><label>Task type<select value={form.type} onChange={(event) => set("type", event.target.value)}>{["Call", "Follow-up", "Payment", "Quotation", "Enquiry", "Other"].map((type) => <option key={type}>{type}</option>)}</select></label><label>Related record<input value={form.relatedTo || ""} onChange={(event) => set("relatedTo", event.target.value)} placeholder="Optional: invoice, quote, lead or order ID"/></label><button className="primary modal-submit" type="button" onClick={() => save(form)}>Save task</button></Shell>;
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
