import assert from "node:assert/strict";
import test from "node:test";
import { withDatabaseContext } from "../db-context.server.ts";
import { assertProofDeadlines } from "./retention.ts";
import {
  assertProductRunTransition,
  canTransitionProductRun,
  ProductRunError,
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
