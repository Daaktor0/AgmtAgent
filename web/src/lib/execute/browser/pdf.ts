/**
 * pdf.js in the browser: opening, reading and drawing pages. The legacy
 * build carries polyfills for office browsers a few versions behind.
 * Documents are opened from bytes already in memory; nothing is fetched.
 */
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDoc = pdfjs.PDFDocumentProxy;

export function openPdf(bytes: Uint8Array): Promise<PdfDoc> {
  // pdf.js takes ownership of the buffer it is given, so hand it a copy.
  return pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
}

/** Draw one page onto a new canvas `width` pixels wide, on white. */
export async function renderPage(pdf: PdfDoc, pageNumber: number, width: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

export function canvasToUrl(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<string> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("thumbnail_failed"))), type, quality),
  );
}
