import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryProofR2Bucket } from "./proof-objects.ts";
import {
  PROOF_CLOUDFLARE_CONTAINERS_ALLOWED,
  PROOF_INCLUDED_MONTHLY,
  PROOF_JOB_COST,
  ProofBudgetError,
  admitProofBudget,
  emptyProofBudget,
  evaluateProofBudget,
  proofBudgetAllowsAdmission,
  proofBudgetIsFresh,
  refreshProofBudget,
  releaseProofBudgetInFlight,
  reserveProofBudget,
  utcMonthKey,
} from "./proof-budget.ts";

const now = Date.parse("2026-09-09T12:00:00Z");

test("PWC-21 cost threshold reserves finish and delete capacity and fail-closes", async () => {
  assert.equal(PROOF_CLOUDFLARE_CONTAINERS_ALLOWED, false);
  const fresh = emptyProofBudget(now);
  assert.equal(fresh.utcMonth, "2026-09");
  assert.equal(proofBudgetAllowsAdmission(fresh, now), true);
  const reserved = reserveProofBudget(fresh, now);
  assert.equal(reserved.jobsAdmitted, 1);
  assert.equal(reserved.jobsInFlight, 1);
  assert.equal(reserved.estimatedCpuMs, PROOF_JOB_COST.cpuMs);

  const exhausted = emptyProofBudget(now);
  exhausted.estimatedCpuMs = PROOF_INCLUDED_MONTHLY.workersCpuMs;
  assert.equal(proofBudgetAllowsAdmission(exhausted, now), false);
  assert.throws(
    () => reserveProofBudget(exhausted, now),
    (error: unknown) => error instanceof ProofBudgetError && error.code === "quota_exceeded" && error.status === 429 && error.retryAfter != null && error.retryAfter > 0,
  );

  const containers = emptyProofBudget(now);
  containers.containerGibHours = 0.01;
  assert.equal(proofBudgetAllowsAdmission(containers, now), false);

  const released = releaseProofBudgetInFlight(reserved, now);
  assert.equal(released.jobsInFlight, 0);
  assert.equal(released.jobsAdmitted, 1);
  assert.equal(released.estimatedCpuMs, PROOF_JOB_COST.cpuMs);

  const rolled = evaluateProofBudget(reserved, Date.parse("2026-10-01T00:00:00Z"));
  assert.equal(rolled.utcMonth, "2026-10");
  assert.equal(rolled.jobsAdmitted, 0);
  assert.equal(rolled.admit, true);

  const bucket = new MemoryProofR2Bucket();
  await assert.rejects(
    () => admitProofBudget(bucket, now),
    (error: unknown) => error instanceof ProofBudgetError && error.code === "uploads_paused",
  );
  const written = await refreshProofBudget(bucket, now);
  assert.equal(written.admit, true);
  assert.equal(proofBudgetIsFresh(written, now), true);
  assert.equal(proofBudgetIsFresh(written, now + 90_001), false);
  const admitted = await admitProofBudget(bucket, now);
  assert.equal(admitted.jobsAdmitted, 1);

  const nearCap = emptyProofBudget(now);
  nearCap.estimatedClassA = PROOF_INCLUDED_MONTHLY.r2ClassA;
  assert.equal(evaluateProofBudget(nearCap, now).admit, false);
  assert.equal(utcMonthKey(now), "2026-09");
});
