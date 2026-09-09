/**
 * Atomic owner/global Proof quotas (PWC-21).
 *
 * Deletion and download are not gated. Admission is fail-closed on stale
 * health as well as exhausted budget.
 */
import { proofAcceptingUploads, type ProofReadinessInput } from "../products/capabilities.ts";

export const PROOF_ADMISSION_VERSION = "proof-admission-v2";
export const PROOF_MAX_ACTIVE_PROCESSING_PER_OWNER = 1;
export const PROOF_MAX_ACTIVE_RUNS_PER_OWNER = 2;
export const PROOF_MAX_UPLOADS_PER_OWNER_UTC_DAY = 3;
export const PROOF_MAX_UPLOADS_GLOBAL_UTC_DAY = 10;
export const PROOF_MAX_UPLOADS_GLOBAL_UTC_MONTH = 80;
export const PROOF_MAX_GLOBAL_COMPUTE_ATTEMPTS = 1;

const ACTIVE_STATUSES = new Set(["uploading", "scanning", "queued", "processing", "exporting", "ready"]);
const PROCESSING_STATUSES = new Set(["processing", "exporting"]);

export type ProofQuotaSnapshot = {
  ownerActiveProcessing: number;
  ownerActiveRuns: number;
  ownerUploadsUtcDay: number;
  globalUploadsUtcDay: number;
  globalUploadsUtcMonth: number;
  globalComputeAttempts: number;
};

export class ProofAdmissionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter: number | null;
  constructor(code: string, status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "ProofAdmissionError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function nextUtcDayRetryAfter(nowMs: number): number {
  const next = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate() + 1,
    0, 0, 0, 0,
  );
  return Math.max(1, Math.ceil((next - nowMs) / 1000));
}

export function reserveProofAdmission(input: {
  readiness: ProofReadinessInput;
  quota: ProofQuotaSnapshot;
  nowMs: number;
}): { reserved: true } {
  if (!proofAcceptingUploads(input.readiness)) {
    throw new ProofAdmissionError("uploads_paused", 503, "Proof is temporarily unavailable for new uploads.");
  }
  if (input.quota.ownerActiveProcessing >= PROOF_MAX_ACTIVE_PROCESSING_PER_OWNER) {
    throw new ProofAdmissionError("quota_exceeded", 429, "An existing check is still running.", 30);
  }
  if (input.quota.ownerActiveRuns >= PROOF_MAX_ACTIVE_RUNS_PER_OWNER) {
    throw new ProofAdmissionError("quota_exceeded", 429, "You already have the maximum number of active runs.", 30);
  }
  if (input.quota.ownerUploadsUtcDay >= PROOF_MAX_UPLOADS_PER_OWNER_UTC_DAY
    || input.quota.globalUploadsUtcDay >= PROOF_MAX_UPLOADS_GLOBAL_UTC_DAY) {
    throw new ProofAdmissionError(
      "quota_exceeded",
      429,
      "You’ve reached today’s free limit.",
      nextUtcDayRetryAfter(input.nowMs),
    );
  }
  if (input.quota.globalUploadsUtcMonth >= PROOF_MAX_UPLOADS_GLOBAL_UTC_MONTH) {
    const now = new Date(input.nowMs);
    const retryAfter = Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - input.nowMs) / 1000));
    throw new ProofAdmissionError(
      "quota_exceeded",
      429,
      "You’ve reached this month’s free limit.",
      retryAfter,
    );
  }
  if (input.quota.globalComputeAttempts >= PROOF_MAX_GLOBAL_COMPUTE_ATTEMPTS) {
    throw new ProofAdmissionError("quota_exceeded", 429, "Proof compute capacity is exhausted.", 30);
  }
  return { reserved: true };
}

export function countActiveRuns(statuses: readonly string[]): Pick<ProofQuotaSnapshot, "ownerActiveProcessing" | "ownerActiveRuns"> {
  let ownerActiveProcessing = 0;
  let ownerActiveRuns = 0;
  for (const status of statuses) {
    if (ACTIVE_STATUSES.has(status)) ownerActiveRuns += 1;
    if (PROCESSING_STATUSES.has(status)) ownerActiveProcessing += 1;
  }
  return { ownerActiveProcessing, ownerActiveRuns };
}
