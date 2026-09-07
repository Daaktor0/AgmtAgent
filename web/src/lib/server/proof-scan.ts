import {
  ZIP_LIMITS,
  ZipSafetyError,
  inspectZipCentralDirectory,
  verifyZipInflation,
} from "../agmt/zip-safety.ts";

export const PROOF_MAX_SOURCE_BYTES = ZIP_LIMITS.MAX_SOURCE_BYTES;

function fail(code: string): never {
  throw new Error(code);
}

/**
 * Fail-closed structural ZIP/package scan. Not antivirus. Not a full OOXML parser.
 * Central-directory inspection and bounded inflation run before any JSZip CRC load.
 */
export async function scanProofDocx(bytes: Buffer): Promise<void> {
  if (bytes.byteLength < 1 || bytes.byteLength > ZIP_LIMITS.MAX_SOURCE_BYTES) {
    fail("source_too_large");
  }
  if (bytes.byteLength < 4 || bytes.subarray(0, 2).toString("utf8") !== "PK") {
    fail("invalid_docx_zip");
  }

  let directory;
  try {
    directory = inspectZipCentralDirectory(bytes);
    verifyZipInflation(bytes, directory, (name, inflated) => {
      if (!name.endsWith(".xml") && !name.endsWith(".rels")) return;
      const xml = new TextDecoder("utf-8", { fatal: true }).decode(inflated);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml) || /TargetMode\s*=\s*["']External["']/i.test(xml)) {
        fail("external_content_not_supported");
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "external_content_not_supported") throw error;
    if (error instanceof ZipSafetyError) fail("invalid_docx_zip");
    fail("invalid_docx_zip");
  }

  const names = directory.entries.map((entry) => entry.name);
  if (!names.includes("[Content_Types].xml") || !names.includes("word/document.xml")) {
    fail("unsupported_docx_package");
  }
  if (names.some((name) => /vbaProject\.bin|word\/embeddings\/|oleObject|activex|customXml/i.test(name))) {
    fail("active_content_not_supported");
  }
}
