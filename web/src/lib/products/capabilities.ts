/** Public Proof capability metadata. Fail closed: missing or stale signals deny uploads. */

export const PROOF_CAPABILITIES_API_VERSION = 2 as const;
export const PROOF_MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const PROOF_PROFILES = ["agreement", "general"] as const;
export const PROOF_LANGUAGES = ["en-GB", "en-US"] as const;
/** Must stay equal to `LAUNCH_RULE_SET_VERSION` in proof/registry.ts. */
export const PROOF_RULE_SET_VERSION = "proof-launch-v1";
export const PROOF_SUPPORT_MATRIX_VERSION = "proof-support-matrix-v1";

export const PROOF_PURGE_FRESHNESS_MS = 90_000;
export const PROOF_SCANNER_FRESHNESS_MS = 24 * 60 * 60 * 1000;
export const PROOF_VALIDATOR_FRESHNESS_MS = 90_000;
export const PROOF_BUDGET_FRESHNESS_MS = 90_000;

export const PROOF_UPLOADS_PAUSED_HEADING = "Proof is temporarily unavailable for new uploads.";
export const PROOF_UPLOADS_PAUSED_DETAIL = "Existing downloads and deletion remain available.";

export type ProofProfile = (typeof PROOF_PROFILES)[number];
export type ProofLanguage = (typeof PROOF_LANGUAGES)[number];

export type ProofCapabilitiesV2 = {
  apiVersion: typeof PROOF_CAPABILITIES_API_VERSION;
  acceptingUploads: boolean;
  maxSourceBytes: number;
  profiles: readonly ProofProfile[];
  languages: readonly ProofLanguage[];
  ruleSetVersion: string;
  supportMatrixVersion: string;
};

export type ProofReadinessInput = {
  productId: unknown;
  uploadsSwitch: boolean | null;
  purgeReadyAt: number | null;
  scannerReadyAt: number | null;
  validatorReadyAt: number | null;
  budgetReadyAt: number | null;
  budgetAllowsAdmission: boolean;
  now: number;
};

export const PROOF_CAPABILITIES_FALLBACK: ProofCapabilitiesV2 = Object.freeze({
  apiVersion: PROOF_CAPABILITIES_API_VERSION,
  acceptingUploads: false,
  maxSourceBytes: PROOF_MAX_SOURCE_BYTES,
  profiles: PROOF_PROFILES,
  languages: PROOF_LANGUAGES,
  ruleSetVersion: PROOF_RULE_SET_VERSION,
  supportMatrixVersion: PROOF_SUPPORT_MATRIX_VERSION,
});

export function parseProofUploadsSwitch(value: string | undefined | null): boolean | null {
  if (value == null) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "true" || trimmed === "1") return true;
  if (trimmed === "false" || trimmed === "0") return false;
  return null;
}

function isFresh(at: number | null, now: number, maxAgeMs: number): boolean {
  if (at == null || !Number.isFinite(at) || !Number.isFinite(now) || maxAgeMs < 0) return false;
  if (at > now) return false;
  return now - at <= maxAgeMs;
}

export function proofAcceptingUploads(input: ProofReadinessInput): boolean {
  if (input.productId !== "proof") return false;
  if (input.uploadsSwitch !== true) return false;
  if (input.budgetAllowsAdmission !== true) return false;
  return isFresh(input.purgeReadyAt, input.now, PROOF_PURGE_FRESHNESS_MS)
    && isFresh(input.scannerReadyAt, input.now, PROOF_SCANNER_FRESHNESS_MS)
    && isFresh(input.validatorReadyAt, input.now, PROOF_VALIDATOR_FRESHNESS_MS)
    && isFresh(input.budgetReadyAt, input.now, PROOF_BUDGET_FRESHNESS_MS);
}

export function proofCapabilitiesFromReadiness(input: ProofReadinessInput): ProofCapabilitiesV2 {
  return {
    apiVersion: PROOF_CAPABILITIES_API_VERSION,
    acceptingUploads: proofAcceptingUploads(input),
    maxSourceBytes: PROOF_MAX_SOURCE_BYTES,
    profiles: PROOF_PROFILES,
    languages: PROOF_LANGUAGES,
    ruleSetVersion: PROOF_RULE_SET_VERSION,
    supportMatrixVersion: PROOF_SUPPORT_MATRIX_VERSION,
  };
}

export function parseProofCapabilities(value: unknown): ProofCapabilitiesV2 {
  if (!value || typeof value !== "object") return PROOF_CAPABILITIES_FALLBACK;
  const record = value as Record<string, unknown>;
  if (record.apiVersion !== PROOF_CAPABILITIES_API_VERSION) return PROOF_CAPABILITIES_FALLBACK;
  if (typeof record.acceptingUploads !== "boolean") return PROOF_CAPABILITIES_FALLBACK;
  if (record.maxSourceBytes !== PROOF_MAX_SOURCE_BYTES) return PROOF_CAPABILITIES_FALLBACK;
  if (record.ruleSetVersion !== PROOF_RULE_SET_VERSION) return PROOF_CAPABILITIES_FALLBACK;
  if (record.supportMatrixVersion !== PROOF_SUPPORT_MATRIX_VERSION) return PROOF_CAPABILITIES_FALLBACK;
  if (!sameStringList(record.profiles, PROOF_PROFILES) || !sameStringList(record.languages, PROOF_LANGUAGES)) {
    return PROOF_CAPABILITIES_FALLBACK;
  }
  return {
    apiVersion: PROOF_CAPABILITIES_API_VERSION,
    acceptingUploads: record.acceptingUploads,
    maxSourceBytes: PROOF_MAX_SOURCE_BYTES,
    profiles: PROOF_PROFILES,
    languages: PROOF_LANGUAGES,
    ruleSetVersion: PROOF_RULE_SET_VERSION,
    supportMatrixVersion: PROOF_SUPPORT_MATRIX_VERSION,
  };
}

function sameStringList(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && expected.every((item, index) => value[index] === item);
}

export function proofAvailabilityCopy(acceptingUploads: boolean): { heading: string; detail: string } | null {
  if (acceptingUploads) return null;
  return { heading: PROOF_UPLOADS_PAUSED_HEADING, detail: PROOF_UPLOADS_PAUSED_DETAIL };
}

export function proofRouteRequiresUploadAdmission(method: string, path: readonly string[]): boolean {
  if (method === "POST" && path.length === 1 && (path[0] === "upload" || path[0] === "runs")) return true;
  if (method === "PUT" && path.length === 3 && path[0] === "runs" && path[2] === "source") return true;
  return false;
}

export function proofCapabilitiesPath(path: readonly string[], method: string): boolean {
  return method === "GET" && path.length === 1 && path[0] === "capabilities";
}

type ProofReadinessSignals = {
  purgeReadyAt: number | null;
  scannerReadyAt: number | null;
  validatorReadyAt: number | null;
  budgetReadyAt: number | null;
  budgetAllowsAdmission: boolean;
};

const proofReadiness: ProofReadinessSignals = {
  purgeReadyAt: null,
  scannerReadyAt: null,
  validatorReadyAt: null,
  budgetReadyAt: null,
  budgetAllowsAdmission: false,
};

export class ProofUploadsPausedError extends Error {
  readonly code = "uploads_paused";
  readonly status = 503;
  constructor() {
    super("uploads_paused");
    this.name = "ProofUploadsPausedError";
  }
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function reportProofReadiness(update: Partial<ProofReadinessSignals>): void {
  if ("purgeReadyAt" in update) proofReadiness.purgeReadyAt = finiteTimestamp(update.purgeReadyAt);
  if ("scannerReadyAt" in update) proofReadiness.scannerReadyAt = finiteTimestamp(update.scannerReadyAt);
  if ("validatorReadyAt" in update) proofReadiness.validatorReadyAt = finiteTimestamp(update.validatorReadyAt);
  if ("budgetReadyAt" in update) proofReadiness.budgetReadyAt = finiteTimestamp(update.budgetReadyAt);
  if ("budgetAllowsAdmission" in update) proofReadiness.budgetAllowsAdmission = update.budgetAllowsAdmission === true;
}

export function resetProofReadinessForTests(): void {
  proofReadiness.purgeReadyAt = null;
  proofReadiness.scannerReadyAt = null;
  proofReadiness.validatorReadyAt = null;
  proofReadiness.budgetReadyAt = null;
  proofReadiness.budgetAllowsAdmission = false;
}

export function proofReadinessSnapshot(): ProofReadinessSignals {
  return { ...proofReadiness };
}

function liveUploadsSwitch(): boolean | null {
  const env = typeof process !== "undefined" ? process.env.PROOF_UPLOADS_ENABLED : undefined;
  return parseProofUploadsSwitch(env);
}

export function getProofCapabilities(now = Date.now(), uploadsSwitch = liveUploadsSwitch()): ProofCapabilitiesV2 {
  const signals = proofReadinessSnapshot();
  return proofCapabilitiesFromReadiness({
    productId: "proof",
    uploadsSwitch,
    purgeReadyAt: signals.purgeReadyAt,
    scannerReadyAt: signals.scannerReadyAt,
    validatorReadyAt: signals.validatorReadyAt,
    budgetReadyAt: signals.budgetReadyAt,
    budgetAllowsAdmission: signals.budgetAllowsAdmission,
    now,
  });
}

export function assertProofUploadsAccepted(now = Date.now()): void {
  if (!getProofCapabilities(now).acceptingUploads) throw new ProofUploadsPausedError();
}

export function proofUploadAdmissionResponse(now = Date.now(), uploadsSwitch = liveUploadsSwitch()): Response | null {
  if (getProofCapabilities(now, uploadsSwitch).acceptingUploads) return null;
  return Response.json({ error: "uploads_paused" }, {
    status: 503,
    headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}
