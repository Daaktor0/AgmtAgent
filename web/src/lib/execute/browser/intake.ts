/**
 * Turning dropped files into what the signing needs: a final document's
 * page text, or a returned file's text, kind and normalised bytes. Files are
 * read from disk into memory and stay on this device.
 */
import { readEStamp } from "../estamp.ts";
import { analyseDocument, returnText } from "../extract.ts";
import type { PageInfo } from "../model.ts";
import { countPages } from "../render.ts";
import type { NewReturn } from "../signing.ts";
import { openPdf, renderPage } from "./pdf.ts";
import { recognise } from "./ocr.ts";

export class IntakeError extends Error {}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
export const isImage = (file: File) =>
  file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(file.name);

const MAX_FILE_BYTES = 100 * 1024 * 1024;

async function readBytes(file: File): Promise<Uint8Array> {
  if (file.size > MAX_FILE_BYTES) throw new IntakeError(`“${file.name}” is larger than 100 MB. Compress it or split it, then add it again.`);
  return new Uint8Array(await file.arrayBuffer());
}

/** A final agreement: validated, read page by page. */
export async function readFinalDocument(
  file: File,
  onPage?: (done: number, total: number) => void,
): Promise<{ bytes: Uint8Array; pages: PageInfo[] }> {
  if (!isPdf(file)) throw new IntakeError(`“${file.name}” isn't a PDF. Save the final from Word as PDF, then add it again.`);
  const bytes = await readBytes(file);
  await countPages({ type: "pdf", bytes }, file.name); // refuses protected or damaged PDFs
  const pdf = await openPdf(bytes);
  try {
    const pages = await analyseDocument(pdf, onPage);
    if (pages.every((p) => p.text.trim().length < 20)) {
      // A scanned agreement has no text to find signature pages in. It still
      // works: the user marks the pages.
      pages.forEach((p) => (p.likelySignature = false));
    }
    return { bytes, pages };
  } finally {
    void pdf.destroy();
  }
}

const MAX_IMAGE_SIDE = 2400; // about 200 dpi across an A4 page

/**
 * A photo or image scan becomes an upright JPEG: phone orientation applied,
 * transparency flattened onto white, oversized photos scaled down.
 */
async function normaliseImage(file: File): Promise<{ bytes: Uint8Array; width: number; height: number; canvas: HTMLCanvasElement }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new IntakeError(
      /\.hei[cf]$/i.test(file.name)
        ? `“${file.name}” is a HEIC photo, which Chrome and Edge can't open. Ask the sender for a JPG or PDF.`
        : `“${file.name}” is an image this browser can't open. Save it as JPG, PNG or PDF.`,
    );
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
    canvas.toBlob((b) => (b ? resolve(b) : reject(new IntakeError(`“${file.name}” couldn't be read as an image. Save it as JPG or PDF, then add it again.`))), "image/jpeg", 0.9),
  );
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height, canvas };
}

export type IntakeResult = { record: NewReturn; bytes: Uint8Array; needsOcr: boolean };

/** A returned file: read its text layer now; OCR, if needed, runs later. */
export async function readReturn(file: File, id: string): Promise<IntakeResult> {
  if (isPdf(file)) {
    const bytes = await readBytes(file);
    const hash = await sha256(bytes);
    const pageCount = await countPages({ type: "pdf", bytes }, file.name);
    const pdf = await openPdf(bytes);
    try {
      const text = await returnText(pdf);
      const hasText = text.replace(/\s/g, "").length >= 20;
      return {
        bytes,
        needsOcr: !hasText,
        record: {
          id,
          fileName: file.name,
          hash,
          kind: "pdf",
          pageCount,
          text: hasText ? text : null,
          textSource: hasText ? "pdf" : "pending",
          estamp: hasText ? readEStamp(text) : null,
        },
      };
    } finally {
      void pdf.destroy();
    }
  }
  if (isImage(file)) {
    const raw = await readBytes(file);
    const hash = await sha256(raw);
    const img = await normaliseImage(file);
    return {
      bytes: img.bytes,
      needsOcr: true,
      record: {
        id,
        fileName: file.name,
        hash,
        kind: "image",
        image: { width: img.width, height: img.height },
        pageCount: 1,
        text: null,
        textSource: "pending",
        estamp: null,
      },
    };
  }
  throw new IntakeError(`“${file.name}” isn't a PDF or an image. Add PDFs, JPGs or PNGs.`);
}

/** Recognise the text of a stored return (first two pages of a scan). */
export async function ocrReturn(kind: "pdf" | "image", bytes: Uint8Array): Promise<string> {
  if (kind === "image") {
    const blob = new Blob([bytes as BlobPart], { type: "image/jpeg" });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return recognise(canvas);
  }
  const pdf = await openPdf(bytes);
  try {
    const parts: string[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, 2); n += 1) parts.push(await recognise(await renderPage(pdf, n, 1700)));
    return parts.join("\n");
  } finally {
    void pdf.destroy();
  }
}
