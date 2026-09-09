import {
  inspectZipCentralDirectory,
  verifyZipInflation,
  ZipSafetyError,
} from "../agmt/zip-safety.ts";
import { PROOF_LOCAL_LIMITS_VERSION, PROOF_LOCAL_MAX_SOURCE_BYTES, PROOF_LOCAL_ZIP_LIMITS } from "./limits.ts";

export const LOCAL_MALWARE_MODEL = "proof-browser-local-v1";
export const EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

export type LocalAdmitReceipt = {
  model: typeof LOCAL_MALWARE_MODEL;
  version: typeof PROOF_LOCAL_LIMITS_VERSION;
  clamav: "cannot_run_in_browser";
  status: "structurally_admitted";
  reason: "local_zip_xml_active_content_and_eicar_only";
  byteSize: number;
};

function fail(code: string): never {
  throw new Error(code);
}

function containsEicar(bytes: Uint8Array): boolean {
  const needle = new TextEncoder().encode(EICAR_SIGNATURE);
  if (needle.length > bytes.length) return false;
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Local structural admission. This is not ClamAV and is never recorded as a
 * clean antivirus scan. ZIP/XML/active-content/EICAR checks stay mandatory.
 */
export function admitLocalDocument(bytes: Uint8Array): LocalAdmitReceipt {
  if (bytes.byteLength < 1 || bytes.byteLength > PROOF_LOCAL_MAX_SOURCE_BYTES) {
    fail("source_too_large");
  }
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    fail("invalid_docx_zip");
  }
  if (containsEicar(bytes)) fail("unsafe_docx");

  let directory;
  try {
    directory = inspectZipCentralDirectory(bytes, PROOF_LOCAL_ZIP_LIMITS);
    verifyZipInflation(bytes, directory, (name, inflated) => {
      if (containsEicar(inflated)) fail("unsafe_docx");
      if (!name.endsWith(".xml") && !name.endsWith(".rels")) return;
      const xml = new TextDecoder("utf-8", { fatal: true }).decode(inflated);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml) || /TargetMode\s*=\s*["']External["']/i.test(xml)) {
        fail("external_content_not_supported");
      }
    }, PROOF_LOCAL_ZIP_LIMITS);
  } catch (error) {
    if (error instanceof Error && ["unsafe_docx", "external_content_not_supported"].includes(error.message)) throw error;
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

  return {
    model: LOCAL_MALWARE_MODEL,
    version: PROOF_LOCAL_LIMITS_VERSION,
    clamav: "cannot_run_in_browser",
    status: "structurally_admitted",
    reason: "local_zip_xml_active_content_and_eicar_only",
    byteSize: bytes.byteLength,
  };
}
