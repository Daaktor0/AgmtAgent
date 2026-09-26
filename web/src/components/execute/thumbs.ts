import { useEffect, useState } from "react";
import { loadPdf } from "./runtime";

type PdfDoc = import("@/lib/execute/browser/pdf").PdfDoc;

/**
 * Page thumbnails, drawn once per session and shared by every view. Keyed by
 * stored file id, page and width.
 */
const images = new Map<string, Promise<string>>();
const docs = new Map<string, Promise<PdfDoc>>();

export type BytesLoader = (fileId: string) => Promise<Uint8Array | null>;

async function pdfFor(fileId: string, bytes: BytesLoader): Promise<PdfDoc> {
  let doc = docs.get(fileId);
  if (!doc) {
    doc = (async () => {
      const data = await bytes(fileId);
      if (!data) throw new Error("file_missing");
      const { openPdf } = await loadPdf();
      return openPdf(data);
    })();
    docs.set(fileId, doc);
    doc.catch(() => docs.delete(fileId));
  }
  return doc;
}

export function thumbnail(fileId: string, kind: "pdf" | "image", page: number, width: number, bytes: BytesLoader): Promise<string> {
  const key = `${fileId}:${page}:${width}`;
  let url = images.get(key);
  if (!url) {
    url = (async () => {
      if (kind === "image") {
        const data = await bytes(fileId);
        if (!data) throw new Error("file_missing");
        return URL.createObjectURL(new Blob([data as BlobPart], { type: "image/jpeg" }));
      }
      const { renderPage, canvasToUrl } = await loadPdf();
      const canvas = await renderPage(await pdfFor(fileId, bytes), page, width);
      return canvasToUrl(canvas, "image/jpeg", 0.85);
    })();
    images.set(key, url);
    url.catch(() => images.delete(key));
  }
  return url;
}

export function useThumbnail(fileId: string | null, kind: "pdf" | "image", page: number, width: number, bytes: BytesLoader): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fileId) return;
    let live = true;
    thumbnail(fileId, kind, page, width, bytes).then((u) => live && setUrl(u), () => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [fileId, kind, page, width, bytes]);
  return url;
}

/** Forget a file's drawings, e.g. when it is removed. */
export function forgetThumbnails(fileId: string) {
  for (const key of [...images.keys()]) {
    if (key.startsWith(`${fileId}:`)) {
      void images.get(key)?.then((u) => URL.revokeObjectURL(u), () => undefined);
      images.delete(key);
    }
  }
  void docs.get(fileId)?.then((d) => d.destroy(), () => undefined);
  docs.delete(fileId);
}
