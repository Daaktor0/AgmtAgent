import type { ZipLimitSet } from "../agmt/zip-safety.ts";

/**
 * Browser admission is multi-dimensional. A source-byte ceiling is necessary
 * but not sufficient. deviceMemory is an optional hint only: a missing API
 * must not reject a document that fits the selected policy, and a low
 * reported value must not be the sole reason to select a tighter class.
 */
export type ProofCapacityClass = "desktop" | "mobile";

export type ProofCapacityPolicy = {
  version: string;
  class: ProofCapacityClass;
  label: string;
  maxSourceBytes: number;
  maxOutputBytes: number;
  maxProcessingMs: number;
  zip: ZipLimitSet;
  maxDocumentXmlBytes: number;
  maxTotalXmlBytes: number;
  maxExtractedCodePoints: number;
};

export const PROOF_LOCAL_POLICY_VERSION = "proof-local-limits-v3";

function zipLimits(
  sourceBytes: number,
  outputBytes: number,
  entries: number,
  expandedBytes: number,
  entryBytes: number,
  ratio: number,
  centralDirectoryBytes: number,
): ZipLimitSet {
  return {
    MAX_SOURCE_BYTES: sourceBytes,
    MAX_OUTPUT_BYTES: outputBytes,
    MAX_ENTRIES: entries,
    MAX_EXPANDED_BYTES: expandedBytes,
    MAX_ENTRY_BYTES: entryBytes,
    MAX_COMPRESSION_RATIO: ratio,
    MAX_PATH_DEPTH: 128,
    MAX_CENTRAL_DIRECTORY_BYTES: centralDirectoryBytes,
    MAX_ENTRY_NAME_BYTES: 1024,
    MAX_ENTRY_COMMENT_BYTES: 1024,
  };
}

/**
 * Published policy. 100 MiB is the desktop source ceiling for packages that
 * also fit XML, extracted-text, ZIP-expansion and time gates. It is not a
 * claim that every file below 100 MiB is supported, and not unlimited.
 *
 * The previous 1 MiB `word/document.xml` admit ceiling rejected ordinary
 * formatted agreements while `extracted_text_limit` (1e6 code points) is
 * the visible-text safety net. XML ceilings below are from representative
 * complete-agreement measurement, not the old 1 MiB policy.
 *
 * The 8 MiB mobile class is a conservative phone-UA policy. It is not
 * mobile-browser verified.
 */
export const PROOF_LOCAL_POLICY_MOBILE: ProofCapacityPolicy = {
  version: PROOF_LOCAL_POLICY_VERSION,
  class: "mobile",
  label: "8 MiB",
  maxSourceBytes: 8 * 1024 * 1024,
  maxOutputBytes: 12 * 1024 * 1024,
  maxProcessingMs: 45_000,
  zip: zipLimits(8 * 1024 * 1024, 12 * 1024 * 1024, 1_000, 24 * 1024 * 1024, 8 * 1024 * 1024, 20, 1 * 1024 * 1024),
  maxDocumentXmlBytes: 2 * 1024 * 1024,
  maxTotalXmlBytes: 3 * 1024 * 1024,
  maxExtractedCodePoints: 1_000_000,
};

export const PROOF_LOCAL_POLICY_DESKTOP: ProofCapacityPolicy = {
  version: PROOF_LOCAL_POLICY_VERSION,
  class: "desktop",
  label: "100 MiB",
  maxSourceBytes: 100 * 1024 * 1024,
  maxOutputBytes: 120 * 1024 * 1024,
  maxProcessingMs: 90_000,
  zip: zipLimits(100 * 1024 * 1024, 120 * 1024 * 1024, 2_000, 150 * 1024 * 1024, 100 * 1024 * 1024, 20, 2 * 1024 * 1024),
  maxDocumentXmlBytes: 8 * 1024 * 1024,
  maxTotalXmlBytes: 12 * 1024 * 1024,
  maxExtractedCodePoints: 1_000_000,
};

/** Lab-only ceiling for measurement. Never the published UI/help cap. */
export const PROOF_LOCAL_POLICY_LAB: ProofCapacityPolicy = {
  version: `${PROOF_LOCAL_POLICY_VERSION}-lab`,
  class: "desktop",
  label: "150 MiB lab",
  maxSourceBytes: 150 * 1024 * 1024,
  maxOutputBytes: 180 * 1024 * 1024,
  maxProcessingMs: 180_000,
  zip: zipLimits(150 * 1024 * 1024, 180 * 1024 * 1024, 4_000, 320 * 1024 * 1024, 150 * 1024 * 1024, 20, 4 * 1024 * 1024),
  maxDocumentXmlBytes: 32 * 1024 * 1024,
  maxTotalXmlBytes: 48 * 1024 * 1024,
  maxExtractedCodePoints: 1_000_000,
};

export type ProofCapacityHints = {
  deviceMemoryGiB?: number;
  prefersMobile?: boolean;
  userAgent?: string;
  userAgentMobile?: boolean;
};

/**
 * Conservative class selection. Default is desktop. The mobile class is used
 * only when the caller marks a phone (`prefersMobile` / UA-CH mobile / a
 * phone UA). Touchscreen laptops (`pointer: coarse`) stay desktop.
 * `deviceMemory` is recorded as a hint and never switches the class by itself.
 */
export function selectProofCapacityPolicy(hints: ProofCapacityHints = {}): ProofCapacityPolicy {
  if (hints.prefersMobile === true) return PROOF_LOCAL_POLICY_MOBILE;
  if (hints.userAgentMobile === true) return PROOF_LOCAL_POLICY_MOBILE;
  if (typeof hints.userAgent === "string" && isPhoneUserAgent(hints.userAgent)) return PROOF_LOCAL_POLICY_MOBILE;
  return PROOF_LOCAL_POLICY_DESKTOP;
}

export function isPhoneUserAgent(userAgent: string): boolean {
  return /iPhone|iPod|Windows Phone|Android.+Mobile|Mobile.+Android/i.test(userAgent);
}

export function browserCapacityHints(): ProofCapacityHints {
  const nav = globalThis.navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
  } | undefined;
  const memory = nav && typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined;
  const ua = nav?.userAgent;
  const uaMobile = nav?.userAgentData?.mobile;
  return {
    deviceMemoryGiB: memory,
    userAgent: ua,
    userAgentMobile: uaMobile === true ? true : uaMobile === false ? false : undefined,
    prefersMobile: uaMobile === true || (typeof ua === "string" && isPhoneUserAgent(ua)),
  };
}

export function publishedProofCapacityPolicy(hints: ProofCapacityHints = browserCapacityHints()): ProofCapacityPolicy {
  return selectProofCapacityPolicy(hints);
}

export function policySizeLabel(policy: ProofCapacityPolicy): string {
  return policy.label;
}
