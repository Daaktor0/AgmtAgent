import { zipSync } from "fflate";

/** An ordinary browser download of bytes made on this device. */
export function saveBytes(bytes: Uint8Array, fileName: string, type = "application/pdf"): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
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
