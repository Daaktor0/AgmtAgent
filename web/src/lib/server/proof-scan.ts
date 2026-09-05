import JSZip from "jszip";
import { extractDocx } from "../agmt/docx-v2.ts";

export const PROOF_MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/**
 * Fail-closed structural scan for the supported native DOCX surface.
 * This is intentionally not presented as a general antivirus engine: it
 * rejects macros, external relationships, unsafe ZIP structure and malformed
 * OOXML before the deterministic Proof parser is allowed to run.
 */
export async function scanProofDocx(bytes: Buffer): Promise<void> {
  if (bytes.byteLength < 1 || bytes.byteLength > PROOF_MAX_SOURCE_BYTES) {
    throw new Error("source_too_large");
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch {
    throw new Error("invalid_docx_zip");
  }
  const names = Object.keys(zip.files);
  if (names.length === 0 || names.length > 2_000) throw new Error("unsafe_zip_entries");
  let uncompressed = 0;
  for (const name of names) {
    if (name.startsWith("/") || name.split("/").includes("..") || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new Error("unsafe_zip_path");
    }
    const data = (zip.files[name] as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data;
    const expanded = Number(data?.uncompressedSize ?? 0);
    const compressed = Number(data?.compressedSize ?? 0);
    if (!Number.isSafeInteger(expanded) || expanded < 0 || expanded > 100 * 1024 * 1024) {
      throw new Error("unsafe_zip_expansion");
    }
    if (compressed > 0 && expanded / compressed > 100) throw new Error("unsafe_zip_ratio");
    uncompressed += expanded;
    if (uncompressed > 100 * 1024 * 1024) throw new Error("unsafe_zip_expansion");
  }
  if (!zip.file("[Content_Types].xml") || !zip.file("word/document.xml")) {
    throw new Error("unsupported_docx_package");
  }
  if (names.some((name) => /vbaProject\.bin|word\/embeddings\/|oleObject|activex|customXml/i.test(name))) {
    throw new Error("active_content_not_supported");
  }
  for (const name of names.filter((entry) => entry.endsWith(".xml") || entry.endsWith(".rels"))) {
    const xml = await zip.file(name)!.async("string");
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || /TargetMode\s*=\s*["']External["']/i.test(xml)) {
      throw new Error("external_content_not_supported");
    }
  }
  try {
    await extractDocx(bytes);
  } catch {
    throw new Error("unsupported_docx_structure");
  }
}
