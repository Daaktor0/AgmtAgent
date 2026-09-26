/**
 * Turns plans into PDF bytes with pdf-lib. Runs the same in the browser and in
 * Node; it never touches the network or the file system.
 */
import { PDFDocument, degrees, type PDFPage } from "pdf-lib";
import type { Plan } from "./plan.ts";

export type Rotation = 0 | 90 | 180 | 270;

/** A returned file, already normalised: a PDF, or a JPEG/PNG with its pixel size. */
export type Source =
  | { type: "pdf"; bytes: Uint8Array }
  | { type: "image"; format: "jpg" | "png"; bytes: Uint8Array; width: number; height: number };

export type RenderAttachment = { source: Source; rotation: Rotation; label: string };

export async function loadPdf(bytes: Uint8Array, label: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/encrypt/i.test(message)) {
      throw new Error(`"${label}" is password-protected. Save an unprotected copy and add it again.`);
    }
    throw new Error(`"${label}" could not be read as a PDF.`);
  }
}

function rotate(page: PDFPage, by: Rotation) {
  if (by === 0) return;
  page.setRotation(degrees((page.getRotation().angle + by) % 360));
}

/**
 * Build output PDFs from one agreement and a set of returned files. Each
 * source is parsed once and reused for every copy.
 */
export async function createCompiler(agreementBytes: Uint8Array, attachments: Map<string, RenderAttachment>) {
  const agreement = await loadPdf(agreementBytes, "Final agreement");
  const refSize = agreement.getPageCount() > 0 ? agreement.getPage(0).getSize() : { width: 595.28, height: 841.89 };
  const parsed = new Map<string, PDFDocument>();

  async function sourceDoc(id: string): Promise<PDFDocument | null> {
    const att = attachments.get(id);
    if (!att) throw new Error("A file in this copy is no longer available. Add it again.");
    if (att.source.type !== "pdf") return null;
    let doc = parsed.get(id);
    if (!doc) {
      doc = await loadPdf(att.source.bytes, att.label);
      parsed.set(id, doc);
    }
    return doc;
  }

  async function appendAttachment(out: PDFDocument, id: string) {
    const att = attachments.get(id)!;
    const doc = await sourceDoc(id);
    if (doc) {
      const pages = await out.copyPages(doc, doc.getPageIndices());
      for (const page of pages) {
        rotate(page, att.rotation);
        out.addPage(page);
      }
      return;
    }
    const src = att.source as Extract<Source, { type: "image" }>;
    const image = src.format === "png" ? await out.embedPng(src.bytes) : await out.embedJpg(src.bytes);
    // Fit the photo or scan on a page the size of the agreement's pages, so
    // the executed copy prints and reads as one document.
    const sideways = att.rotation === 90 || att.rotation === 270;
    const pageW = sideways ? refSize.height : refSize.width;
    const pageH = sideways ? refSize.width : refSize.height;
    const scale = Math.min(pageW / src.width, pageH / src.height);
    const w = src.width * scale;
    const h = src.height * scale;
    const page = out.addPage([pageW, pageH]);
    page.drawImage(image, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
    rotate(page, att.rotation);
  }

  async function fresh(title: string) {
    const out = await PDFDocument.create();
    out.setTitle(title);
    out.setProducer("Agmt");
    out.setCreator("Agmt executed copies (assembled on the user's device)");
    return out;
  }

  return {
    pageCount: agreement.getPageCount(),

    /** The chosen agreement pages, e.g. one party's signature page(s). */
    async extract(pageIndices: number[], title: string): Promise<Uint8Array> {
      const out = await fresh(title);
      const pages = await out.copyPages(agreement, pageIndices);
      pages.forEach((p) => out.addPage(p));
      return out.save();
    },

    async build(plan: Plan, title: string): Promise<Uint8Array> {
      const out = await fresh(title);
      for (const seg of plan.segments) {
        if (seg.kind === "agreement") {
          const [page] = await out.copyPages(agreement, [seg.pageIndex]);
          out.addPage(page);
        } else {
          await appendAttachment(out, seg.attachmentId);
        }
      }
      return out.save();
    },
  };
}

export async function countPages(source: Source, label: string): Promise<number> {
  if (source.type === "image") return 1;
  return (await loadPdf(source.bytes, label)).getPageCount();
}
