import type { PDFDocumentProxy } from "pdfjs-dist";
import { isLikelySignaturePage, layoutSegments, suggestPartyNames, type TextItem } from "./detect.ts";
import type { PageInfo } from "./model.ts";

/** Positioned text runs of one page, as pdf.js reports them. */
export async function pageItems(pdf: PDFDocumentProxy, pageNumber: number): Promise<TextItem[]> {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  for (const raw of content.items) {
    if (!("str" in raw)) continue;
    const [, , c, d, e, f] = raw.transform as number[];
    items.push({ str: raw.str, x: e, y: f, width: raw.width, height: raw.height || Math.hypot(c, d) });
  }
  page.cleanup();
  return items;
}

/** Read every page of a final document and mark the likely signature pages. */
export async function analyseDocument(pdf: PDFDocumentProxy, onPage?: (done: number, total: number) => void): Promise<PageInfo[]> {
  const pages: PageInfo[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const laid = layoutSegments(await pageItems(pdf, n));
    const segments = laid.map((s) => s.text);
    const likelySignature = isLikelySignaturePage(segments);
    pages.push({ text: segments.join("\n"), likelySignature, suggestedParties: likelySignature ? suggestPartyNames(laid) : [] });
    onPage?.(n, pdf.numPages);
  }
  return pages;
}

/** Text of the first pages of a returned file; empty when it is a scan with no text layer. */
export async function returnText(pdf: PDFDocumentProxy, maxPages = 4): Promise<string> {
  const parts: string[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n += 1) {
    parts.push(layoutSegments(await pageItems(pdf, n)).map((s) => s.text).join("\n"));
  }
  return parts.join("\n").trim();
}
