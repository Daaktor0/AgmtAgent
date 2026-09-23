/**
 * Browser-only helpers: pdf.js loading and thumbnails, turning dropped files
 * into normalised sources, zipping and saving. Files are read from disk into
 * memory and never sent anywhere.
 */
// The legacy build carries polyfills for features newer than many office browsers.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { zipSync } from "fflate";
import { countPages, type Source } from "./render.ts";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function openPdf(bytes: Uint8Array) {
  // pdf.js takes ownership of the buffer it is given, so hand it a copy.
  return pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
}

function canvasToUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("thumbnail"))), "image/png"),
  );
}

export async function renderThumb(pdf: pdfjs.PDFDocumentProxy, pageNumber: number, width = 180): Promise<string> {
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
  return canvasToUrl(canvas);
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const MAX_IMAGE_SIDE = 2400; // about 200 dpi across an A4 page

/**
 * A phone photo or scanned image becomes an upright JPEG: EXIF rotation is
 * applied (phones store portrait photos sideways), transparency is flattened
 * onto white, and very large photos are scaled to a printable size.
 */
async function normaliseImage(file: File): Promise<{ source: Source; thumb: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`"${file.name}" is an image format this browser cannot read. Save it as JPG, PNG or PDF and add it again.`);
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.9),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const thumbCanvas = document.createElement("canvas");
  const t = 180 / canvas.width;
  thumbCanvas.width = 180;
  thumbCanvas.height = Math.round(canvas.height * t);
  thumbCanvas.getContext("2d")!.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

  return {
    source: { type: "image", format: "jpg", bytes, width: canvas.width, height: canvas.height },
    thumb: await canvasToUrl(thumbCanvas),
  };
}

export type Ingested = { fileName: string; hash: string; source: Source; pageCount: number; thumb: string };

export async function ingestFile(file: File): Promise<Ingested> {
  const raw = new Uint8Array(await file.arrayBuffer());
  const hash = await sha256(raw);
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const source: Source = { type: "pdf", bytes: raw };
    const pageCount = await countPages(source, file.name); // rejects protected PDFs up front
    const pdf = await openPdf(raw);
    try {
      return { fileName: file.name, hash, source, pageCount, thumb: await renderThumb(pdf, 1) };
    } finally {
      void pdf.destroy();
    }
  }
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(file.name)) {
    const { source, thumb } = await normaliseImage(file);
    return { fileName: file.name, hash, source, pageCount: 1, thumb };
  }
  throw new Error(`"${file.name}" is not a PDF or an image.`);
}

export function saveBytes(bytes: Uint8Array, fileName: string, type = "application/pdf") {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** PDFs are already compressed, so the zip only stores them. */
export function zip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) entries[f.name] = [f.bytes, { level: 0 }];
  return zipSync(entries);
}
