/**
 * Slice 0 closed constants. Founder OPEN decisions from SPEC §14 are recorded
 * here and are not to be relitigated in later slices.
 */

export const PRODUCT_NAME = "Agmt";
export const MODES = ["Proof", "Review"] as const;

/** SPEC §11.2 / founder OPEN: 25 MiB per file. The 80-page cap is independent. */
export const FILE_BYTE_CAP = 25 * 1024 * 1024;
export const PAGE_CAP = 80;

/** Page-count coefficients. Versioned so the golden corpus can replay them. */
export const PAGE_COUNT_VERSION = "pc-v1";
export const PAGE_WORDS_PER_PAGE = 450;
export const PAGE_CHARS_PER_PAGE = 2500;

export const INDEX_QUALITY_VERSION = "iq-v1";
export const INGEST_SCHEMA_VERSION = "ingest-v1";
export const RECOGNISER_VERSION = "presidio-in-v1";
export const CHECK_REGISTRY_VERSION = "proof-registry-v1";

/** Material unclassified: >10% of non-blank chars, or any leaf > 2000 chars. */
export const MATERIAL_UNCLASSIFIED_SHARE = 0.1;
export const MATERIAL_UNCLASSIFIED_LEAF_CHARS = 2000;

/** Usable outline: ≥1 recognised top-level provision AND (≥50% classified OR 3 numbered). */
export const USABLE_OUTLINE_CLASSIFIED_SHARE = 0.5;
export const USABLE_OUTLINE_NUMBERED_MIN = 3;

export const SOURCE_QUALITY_HIGH = 0.85;
export const SOURCE_QUALITY_MEDIUM = 0.6;

export const INDEX_WEIGHTS = {
  classifiedCoverage: 0.4,
  outlineContinuity: 0.25,
  numberingConsistency: 0.15,
  definitionMapping: 0.1,
  tableCompleteness: 0.1,
} as const;

/**
 * Retention — founder OPEN closed for v1 (SPEC §14.4):
 * access is revoked immediately on user-initiated delete; physical purge after
 * 30 days; inactivity 12 months + 14-day notice. Do not claim irrecoverable
 * deletion at request time.
 */
export const RETENTION = {
  revokeAccessImmediately: true,
  purgeAfterDays: 30,
  inactivityMonths: 12,
  inactivityNoticeDays: 14,
} as const;

/** Magic-link contract (SPEC §10.1). */
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const MAGIC_LINK_RATE_EMAIL = 5;
export const MAGIC_LINK_RATE_IP = 10;
export const MAGIC_LINK_RATE_WINDOW_MS = 15 * 60 * 1000;
export const MAGIC_LINK_SUBJECT = "Verify your email for Agmt";

/** Session idle / absolute (Better Auth is the cookie store; these bound our ledger). */
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;

export const SUPPORT_CONTACT = "support@agmt.example";
