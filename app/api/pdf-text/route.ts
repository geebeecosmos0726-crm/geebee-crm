import { NextResponse } from "next/server";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

export const runtime = "nodejs";

type ParsedProduct = { sku: string; name: string; description: string; cartonQty: string; unitPrice: number; category: string; image: string; y: number; column: "left" | "right" };

export async function POST(request: Request) {
  try {
    let pdfBytes: Uint8Array;
    if (request.headers.get("content-type")?.includes("application/json")) {
      const { sourceUrl } = await request.json() as { sourceUrl?: string };
      const url = sourceUrl ? new URL(sourceUrl) : null;
      if (!url || !url.hostname.endsWith(".supabase.co")) return NextResponse.json({ error: "Use a secure GeeBee catalogue upload link." }, { status: 400 });
      const source = await fetch(url);
      if (!source.ok) return NextResponse.json({ error: "The uploaded PDF could not be downloaded." }, { status: 422 });
      pdfBytes = new Uint8Array(await source.arrayBuffer());
    } else {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "Upload a PDF file." }, { status: 400 });
      pdfBytes = new Uint8Array(await file.arrayBuffer());
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
    const document = await pdfjs.getDocument({ data: pdfBytes }).promise;
    const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const page = await document.getPage(index + 1);
      const content = await page.getTextContent();
      const items = content.items.filter((item: any) => item.str?.trim()).map((item: any) => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }));
      // In this catalogue the right-column labels begin slightly left of the page midpoint.
      const split = page.view[2] * 0.42;
      const parseColumn = (column: typeof items, side: "left" | "right") => {
        const raw = column.map((item) => item.text).join(" ");
        // Keep catalogue variants such as AB 201-A as distinct SKUs. The old
        // digits-only expression skipped them, and then shifted the image
        // crops assigned to every product following the skipped card.
        const skuPattern = "AB\\s*\\d{2,8}(?:\\s*-\\s*[A-Z])?";
        const skuItems = column.filter((item) => new RegExp(`^${skuPattern}$`, "i").test(item.text));
        return [...raw.matchAll(new RegExp(`\\b(${skuPattern})\\b([\\s\\S]*?)(?=\\b${skuPattern}\\b|$)`, "gi"))].map((match, itemIndex) => {
          const details = match[2];
          const description = details.match(/Description-\s*([\s\S]*?)(?=Carton Qty-|Inner Qty-|PRICE-|$)/i)?.[1]?.replace(/Sizes-\s*/gi, " ").trim() || "";
          const cartonQty = details.match(/Carton Qty-\s*([^]*?)(?=Inner Qty-|PRICE-|$)/i)?.[1]?.trim() || "";
          const priceText = details.match(/PRICE-\s*([\d,.]+)/i)?.[1]?.replaceAll(",", "") || "0";
          return { sku: match[1].replace(/\s+/g, "-"), name: description || `Product ${match[1]}`, description, cartonQty, unitPrice: Number(priceText) || 0, category: "Imported PDF", image: "", y: skuItems[itemIndex]?.y || 0, column: side } satisfies ParsedProduct;
        });
      };
      const products = [...parseColumn(items.filter((item) => item.x < split), "left"), ...parseColumn(items.filter((item) => item.x >= split), "right")];
      const viewport = page.getViewport({ scale: 1 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: canvas as any, canvasContext: canvas.getContext("2d") as any, viewport }).promise;
      for (const product of products) {
        const next = products.filter((candidate) => candidate.column === product.column && candidate.y < product.y).sort((a, b) => b.y - a.y)[0];
        const rowTop = viewport.height - product.y;
        const cropTop = Math.min(Math.max(rowTop + 68, 0), viewport.height - 1);
        const nextTop = next ? viewport.height - next.y : viewport.height - 12;
        const cropHeight = Math.max(70, Math.min(nextTop - cropTop - 8, 230));
        const cropWidth = Math.floor(viewport.width / 2) - 12;
        const cropX = product.column === "left" ? 6 : Math.floor(viewport.width / 2) + 6;
        const crop = createCanvas(cropWidth, cropHeight); crop.getContext("2d").drawImage(canvas, cropX, cropTop, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        // Vercel's deployed filesystem is read-only. Return compact image data
        // with the parsed product instead of attempting to write inside /var/task.
        product.image = crop.toDataURL("image/jpeg", 0.58);
      }
      return { text: items.map((item) => item.text).join(" "), products };
    }));
    const products = pages.flatMap((page) => page.products.map(({ y, column, ...product }) => product));
    return NextResponse.json({ text: pages.map((page) => page.text).join(" "), products, pages: document.numPages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The PDF could not be read.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
