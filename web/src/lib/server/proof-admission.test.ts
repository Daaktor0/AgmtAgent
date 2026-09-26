import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ProofAdmissionError,
  PROOF_MAX_ACTIVE_RUNS_PER_OWNER,
  PROOF_MAX_UPLOADS_GLOBAL_UTC_MONTH,
  PROOF_MAX_UPLOADS_PER_OWNER_UTC_DAY,
  countActiveRuns,
  nextUtcDayRetryAfter,
  reserveProofAdmission,
} from "./proof-admission.ts";

const now = Date.parse("2026-09-09T12:00:00Z");
const ready = {
  productId: "proof" as const,
  uploadsSwitch: true as const,
  purgeReadyAt: now,
  scannerReadyAt: now,
  validatorReadyAt: now,
  budgetReadyAt: now,
  budgetAllowsAdmission: true,
  now,
};

test("PWC-21 concurrent quota races and stale health fail closed", () => {
  assert.deepEqual(countActiveRuns(["ready", "processing", "deleted"]), { ownerActiveProcessing: 1, ownerActiveRuns: 2 });
  assert.doesNotThrow(() => reserveProofAdmission({
    readiness: ready,
    quota: { ownerActiveProcessing: 0, ownerActiveRuns: 0, ownerUploadsUtcDay: 0, globalUploadsUtcDay: 0, globalUploadsUtcMonth: 0, globalComputeAttempts: 0 },
    nowMs: now,
  }));
  assert.throws(
    () => reserveProofAdmission({
      readiness: { ...ready, purgeReadyAt: now - 120_000 },
      quota: { ownerActiveProcessing: 0, ownerActiveRuns: 0, ownerUploadsUtcDay: 0, globalUploadsUtcDay: 0, globalUploadsUtcMonth: 0, globalComputeAttempts: 0 },
      nowMs: now,
    }),
    (error: unknown) => error instanceof ProofAdmissionError && error.code === "uploads_paused" && error.status === 503,
  );
  assert.throws(
    () => reserveProofAdmission({
      readiness: ready,
      quota: { ownerActiveProcessing: 1, ownerActiveRuns: 1, ownerUploadsUtcDay: 1, globalUploadsUtcDay: 1, globalUploadsUtcMonth: 1, globalComputeAttempts: 0 },
      nowMs: now,
    }),
    (error: unknown) => error instanceof ProofAdmissionError && error.status === 429,
  );
  assert.throws(
    () => reserveProofAdmission({
      readiness: ready,
      quota: {
        ownerActiveProcessing: 0,
        ownerActiveRuns: PROOF_MAX_ACTIVE_RUNS_PER_OWNER,
        ownerUploadsUtcDay: 0,
        globalUploadsUtcDay: 0,
        globalUploadsUtcMonth: 0,
        globalComputeAttempts: 0,
      },
      nowMs: now,
    }),
    ProofAdmissionError,
  );
  try {
    reserveProofAdmission({
      readiness: ready,
      quota: {
        ownerActiveProcessing: 0,
        ownerActiveRuns: 0,
        ownerUploadsUtcDay: PROOF_MAX_UPLOADS_PER_OWNER_UTC_DAY,
        globalUploadsUtcDay: 0,
        globalUploadsUtcMonth: 0,
        globalComputeAttempts: 0,
      },
      nowMs: now,
    });
    assert.fail("expected quota error");
  } catch (error) {
    assert.ok(error instanceof ProofAdmissionError);
    assert.equal(error.retryAfter, nextUtcDayRetryAfter(now));
  }
  assert.throws(
    () => reserveProofAdmission({
      readiness: { ...ready, budgetAllowsAdmission: false },
      quota: {
        ownerActiveProcessing: 0,
        ownerActiveRuns: 0,
        ownerUploadsUtcDay: 0,
        globalUploadsUtcDay: 0,
        globalUploadsUtcMonth: 0,
        globalComputeAttempts: 0,
      },
      nowMs: now,
    }),
    (error: unknown) => error instanceof ProofAdmissionError && error.code === "uploads_paused",
  );
  assert.throws(
    () => reserveProofAdmission({
      readiness: ready,
      quota: {
        ownerActiveProcessing: 0,
        ownerActiveRuns: 0,
        ownerUploadsUtcDay: 0,
        globalUploadsUtcDay: 0,
        globalUploadsUtcMonth: PROOF_MAX_UPLOADS_GLOBAL_UTC_MONTH,
        globalComputeAttempts: 0,
      },
      nowMs: now,
    }),
    (error: unknown) => error instanceof ProofAdmissionError && error.status === 429,
  );
});
