import assert from "node:assert/strict";
import test from "node:test";
import { withDatabaseContext } from "../db-context.server.ts";
import { assertProofDeadlines } from "./retention.ts";
import {
  assertProductRunTransition,
  canTransitionProductRun,
  ProductRunError,
  retryDestination,
  validateProductRunInput,
} from "./product-runs.ts";

const base = {
  tenantId: "tenant-1", ownerUserId: "user-1", productId: "proof" as const,
  idempotencyKey: "proof-123", parserVersion: "docx-v2", ruleSetVersion: "proof-launch-v1", exporterVersion: "ooxml-v1",
  sourceSize: 100, sourceSha256: "a".repeat(64),
};

test("T06 validates server-derived deadlines and immutable Proof inputs", async () => {
  await withDatabaseContext({ userId: "user-1", tenantId: "tenant-1", runtimeRole: "app" }, async () => {
    const result = validateProductRunInput(base, Date.parse("2026-01-01T00:00:00Z"));
    assert.equal(result.productId, "proof");
    assert.equal(result.deadlines.retentionDeadline, Date.parse("2026-01-01T02:00:00Z"));
    assertProofDeadlines(result.deadlines);
    assert.throws(() => validateProductRunInput({ ...base, productId: "review" }, result.deadlines.uploadStartedAt), (error) => error instanceof ProductRunError && error.code === "product_unavailable");
    assert.throws(() => validateProductRunInput({ ...base, sourceSize: 25 * 1024 * 1024 + 1 }, result.deadlines.uploadStartedAt), /25 MiB/);
    assert.throws(() => validateProductRunInput({ ...base, sourceSha256: null }, result.deadlines.uploadStartedAt), /supplied together/);
    assert.throws(() => validateProductRunInput({ ...base, idempotencyKey: "bad key" }, result.deadlines.uploadStartedAt), /ASCII token/);
  });
});

test("T06 Proof run transitions are explicit and fail closed", () => {
  assert.equal(canTransitionProductRun("uploading", "scanning"), true);
  assert.equal(canTransitionProductRun("ready", "processing"), false);
  assert.doesNotThrow(() => assertProductRunTransition("deleting", "deleted"));
  assert.throws(() => assertProductRunTransition("deleted", "ready"), (error) => error instanceof ProductRunError && error.code === "invalid_state_transition");
  assert.throws(() => validateProductRunInput(base, -1), (error) => error instanceof ProductRunError && error.code === "database_context_required");
});

test("PWC-16 completes the section 17 transition table without scanning→processing", () => {
  assert.equal(canTransitionProductRun("scanning", "processing"), false);
  assert.equal(canTransitionProductRun("scanning", "queued"), true);
  assert.equal(canTransitionProductRun("queued", "failed"), true);
  assert.equal(canTransitionProductRun("failed", "queued"), true);
  assert.equal(canTransitionProductRun("failed", "scanning"), true);
  assert.equal(canTransitionProductRun("deleting", "deleting"), true);
  assert.equal(canTransitionProductRun("deleting", "deleted"), true);
  assert.equal(canTransitionProductRun("deleted", "uploading"), false);
  assert.equal(canTransitionProductRun("ready", "queued"), false);
  assert.doesNotThrow(() => assertProductRunTransition("failed", "queued"));
  assert.throws(() => assertProductRunTransition("scanning", "processing"), (error) => error instanceof ProductRunError && error.code === "invalid_state_transition");
});

test("PWC-16 retry destination keeps the original deadline and attempt budget", () => {
  const processingDeadline = Date.parse("2026-01-01T01:50:00Z");
  assert.equal(retryDestination({
    status: "failed", attemptCount: 1, processingDeadline, now: Date.parse("2026-01-01T00:10:00Z"), hasCleanScanReceipt: true,
  }), "queued");
  assert.equal(retryDestination({
    status: "failed", attemptCount: 0, processingDeadline, now: Date.parse("2026-01-01T00:10:00Z"), hasCleanScanReceipt: false,
  }), "scanning");
  assert.throws(() => retryDestination({
    status: "ready", attemptCount: 0, processingDeadline, now: Date.parse("2026-01-01T00:10:00Z"), hasCleanScanReceipt: true,
  }), (error) => error instanceof ProductRunError && error.code === "retry_ineligible");
  assert.throws(() => retryDestination({
    status: "failed", attemptCount: 3, processingDeadline, now: Date.parse("2026-01-01T00:10:00Z"), hasCleanScanReceipt: true,
  }), /attempt budget/);
  assert.throws(() => retryDestination({
    status: "failed", attemptCount: 1, processingDeadline, now: processingDeadline, hasCleanScanReceipt: true,
  }), /processing deadline/);
});
