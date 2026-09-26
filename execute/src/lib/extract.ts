import type { PDFDocumentProxy } from "pdfjs-dist";
import { layoutSegments, isLikelySignaturePage, suggestPartyNames, type TextItem } from "./detect.ts";

export type PageText = { segments: string[]; likelySignature: boolean; suggestedParties: string[] };

/** Read every page's text with pdf.js and run the signature-page heuristics. */
export async function analysePages(pdf: PDFDocumentProxy): Promise<PageText[]> {
  const pages: PageText[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const raw of content.items) {
      if (!("str" in raw)) continue;
      const [, , c, d, e, f] = raw.transform as number[];
      items.push({ str: raw.str, x: e, y: f, width: raw.width, height: raw.height || Math.hypot(c, d) });
    }
    const laid = layoutSegments(items);
    const segments = laid.map((s) => s.text);
    const likelySignature = isLikelySignaturePage(segments);
    pages.push({ segments, likelySignature, suggestedParties: likelySignature ? suggestPartyNames(laid) : [] });
    page.cleanup();
  }
  return pages;
}
