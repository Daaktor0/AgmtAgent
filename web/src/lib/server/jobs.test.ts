import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTransition,
  canTransition,
  isLeaseExpired,
  leaseExpiryIso,
  validateIdempotencyKey,
} from "./jobs.ts";

test("JOB-01 exposes only documented forward state transitions", () => {
  assert.equal(canTransition("upload_intent", "created", "uploading"), true);
  assert.equal(canTransition("upload_intent", "scan_pending", "clean"), true);
  assert.equal(canTransition("ingest_job", "queued", "leased"), true);
  assert.equal(canTransition("ingest_job", "leased", "retryable_failed"), true);
  assert.equal(canTransition("job_outbox", "leased", "published"), true);

  assert.throws(
    () => assertTransition("upload_intent", "created", "clean"),
    /Invalid upload_intent transition: created -> clean/,
  );
  assert.throws(
    () => assertTransition("ingest_job", "succeeded", "queued"),
    /Invalid ingest_job transition: succeeded -> queued/,
  );
  assert.throws(
    () => assertTransition("job_outbox", "published", "pending"),
    /Invalid job_outbox transition: published -> pending/,
  );
});

test("JOB-01 leases expire only at or after their deadline", () => {
  const now = Date.parse("2026-08-30T00:00:00.000Z");
  assert.equal(isLeaseExpired(null, now), true);
  assert.equal(isLeaseExpired("2026-08-30T00:00:01.000Z", now), false);
  assert.equal(isLeaseExpired("2026-08-30T00:00:00.000Z", now), true);
  assert.equal(
    leaseExpiryIso(30, now),
    "2026-08-30T00:00:30.000Z",
  );
  assert.throws(() => leaseExpiryIso(0, now), /positive integer/);
  assert.throws(() => leaseExpiryIso(901, now), /maximum lease/);
});

test("JOB-01 rejects ambiguous or attacker-controlled idempotency keys", () => {
  assert.equal(validateIdempotencyKey(" upload-123 "), "upload-123");
  assert.throws(() => validateIdempotencyKey(""), /required/);
  assert.throws(() => validateIdempotencyKey("   "), /required/);
  assert.throws(() => validateIdempotencyKey("upload key"), /ASCII token/);
  assert.throws(() => validateIdempotencyKey("../upload"), /ASCII token/);
  assert.throws(() => validateIdempotencyKey("x".repeat(129)), /128/);
});
