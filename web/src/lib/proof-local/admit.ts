import { DocxPackage, isXmlPackagePart, uncompressedXmlBytes } from "../agmt/docx-package.ts";
import { ZipSafetyError } from "../agmt/zip-safety.ts";
import { publishedProofCapacityPolicy, type ProofCapacityPolicy } from "./policy.ts";

export const LOCAL_MALWARE_MODEL = "proof-browser-local-v1";
export const EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

export type LocalAdmitReceipt = {
  model: typeof LOCAL_MALWARE_MODEL;
  version: string;
  clamav: "cannot_run_in_browser";
  status: "structurally_admitted";
  reason: "local_zip_xml_active_content_and_eicar_only";
  byteSize: number;
  capacityClass: ProofCapacityPolicy["class"];
};

function fail(code: string): never {
  throw new Error(code);
}

export function scanAdmittedPart(name: string, inflated: Uint8Array): void {
  if (containsEicar(inflated)) fail("unsafe_docx");
  if (!isXmlPackagePart(name)) return;
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(inflated);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || /TargetMode\s*=\s*["']External["']/i.test(xml)) {
    fail("external_content_not_supported");
  }
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
export function admitLocalDocument(bytes: Uint8Array, options: {
  policy?: ProofCapacityPolicy;
  pkg?: DocxPackage;
  signal?: AbortSignal;
} = {}): LocalAdmitReceipt {
  const policy = options.policy ?? publishedProofCapacityPolicy();
  if (bytes.byteLength < 1 || bytes.byteLength > policy.maxSourceBytes) {
    fail("source_too_large");
  }
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    fail("invalid_docx_zip");
  }
  if (containsEicar(bytes)) fail("unsafe_docx");

  let pkg = options.pkg;
  try {
    pkg = pkg ?? DocxPackage.open(bytes, {
      limits: policy.zip,
      verify: true,
      signal: options.signal,
      onInflated: scanAdmittedPart,
    });
    const xmlBytes = uncompressedXmlBytes(pkg.directory);
    if (xmlBytes.documentXml > policy.maxDocumentXmlBytes || xmlBytes.totalXml > policy.maxTotalXmlBytes) {
      fail("package_too_complex");
    }
  } catch (error) {
    if (error instanceof Error && ["unsafe_docx", "external_content_not_supported", "package_too_complex", "cancelled"].includes(error.message)) throw error;
    if (error instanceof Error && error.name === "AbortError") throw error;
    if (error instanceof ZipSafetyError) {
      if (
        error.code.startsWith("package_")
        || error.code === "suspicious_compression_ratio"
        || error.code === "zip64_unsupported"
      ) {
        fail(error.code);
      }
      fail("invalid_docx_zip");
    }
    fail("invalid_docx_zip");
  }

  if (!pkg) fail("invalid_docx_zip");
  const names = pkg.names();
  if (!names.includes("[Content_Types].xml") || !names.includes("word/document.xml")) {
    fail("unsupported_docx_package");
  }
  if (names.some((name) => /vbaProject\.bin|word\/embeddings\/|oleObject|activex|customXml/i.test(name))) {
    fail("active_content_not_supported");
  }

  return {
    model: LOCAL_MALWARE_MODEL,
    version: policy.version,
    clamav: "cannot_run_in_browser",
    status: "structurally_admitted",
    reason: "local_zip_xml_active_content_and_eicar_only",
    byteSize: bytes.byteLength,
    capacityClass: policy.class,
  };
}
