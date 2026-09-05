import type { RunDeadlines } from "../products/contracts.ts";

export const PROOF_RETENTION_SECONDS = 7_200;
export const PURGE_SAFETY_SECONDS = 300;
export const PROCESSING_GUARD_SECONDS = 600;
export const UPLOAD_GRANT_SECONDS = 900;
export const DOWNLOAD_GRANT_SECONDS = 60;
export const WORKER_TIMEOUT_SECONDS = 300;
// Initial explicit cleanup budget, to be measured in T15. Never reduces the two-hour guard.
export const ATTEMPT_CLEANUP_SECONDS = 60;

function clock(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000 - 7_200_000) {
    throw new Error("invalid_server_clock");
  }
  return value;
}

/** Caller supplies database time at authorization, never client time or derivative creation time. */
export function proofDeadlines(uploadStartedAt: number): RunDeadlines {
  clock(uploadStartedAt);
  const retentionDeadline = uploadStartedAt + PROOF_RETENTION_SECONDS * 1000;
  return Object.freeze({
    uploadStartedAt,
    retentionDeadline,
    accessDeadline: retentionDeadline - PURGE_SAFETY_SECONDS * 1000,
    processingDeadline: retentionDeadline - PROCESSING_GUARD_SECONDS * 1000,
    uploadGrantDeadline: uploadStartedAt + UPLOAD_GRANT_SECONDS * 1000,
  });
}

/** Validate persisted immutable values on restore/read; never recompute them from 'now'. */
export function assertProofDeadlines(deadlines: RunDeadlines): void {
  const expected = proofDeadlines(deadlines.uploadStartedAt);
  for (const key of Object.keys(expected) as (keyof RunDeadlines)[]) {
    if (deadlines[key] !== expected[key]) throw new Error("invalid_run_deadlines");
  }
}

function active(deadlines: RunDeadlines, now: number): boolean {
  assertProofDeadlines(deadlines);
  clock(now);
  return now >= deadlines.uploadStartedAt;
}

export function canStartProofAttempt(deadlines: RunDeadlines, now: number): boolean {
  return active(deadlines, now) && now + (WORKER_TIMEOUT_SECONDS + ATTEMPT_CLEANUP_SECONDS) * 1000 < deadlines.processingDeadline;
}

export function canPublishProof(deadlines: RunDeadlines, now: number): boolean {
  return active(deadlines, now) && now < deadlines.processingDeadline;
}

export function downloadGrantSeconds(deadlines: RunDeadlines, now: number): number {
  if (!active(deadlines, now)) return 0;
  return Math.max(0, Math.min(DOWNLOAD_GRANT_SECONDS, Math.floor((deadlines.accessDeadline - now) / 1000)));
}

export function uploadGrantOpen(deadlines: RunDeadlines, now: number): boolean {
  return active(deadlines, now) && now < deadlines.uploadGrantDeadline;
}

export function purgeDue(deadlines: RunDeadlines, now: number): boolean {
  assertProofDeadlines(deadlines);
  return clock(now) >= deadlines.accessDeadline;
}
