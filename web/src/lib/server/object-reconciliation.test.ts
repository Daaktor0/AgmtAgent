import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileExternalPublication,
  type ReconciliationResult,
} from "./object-reconciliation.ts";

test("confirmed rollback records an exact orphan before deleting it", async () => {
  const events: string[] = [];
  const result = await reconcileExternalPublication({
    allowDeletion: true,
    record: async () => {
      events.push("record");
    },
    deleteExact: async () => {
      events.push("delete");
    },
  });

  assert.deepEqual(result, { status: "deleted" } satisfies ReconciliationResult);
  assert.deepEqual(events, ["record", "delete"]);
});

test("provider cleanup failure leaves a durable recorded reconciliation", async () => {
  let deleteAttempts = 0;
  const result = await reconcileExternalPublication({
    allowDeletion: true,
    record: async () => undefined,
    deleteExact: async () => {
      deleteAttempts += 1;
      throw new Error("provider unavailable");
    },
  });

  assert.equal(result.status, "recorded");
  assert.ok(result.deleteError instanceof Error);
  assert.equal(deleteAttempts, 1);
});

test("unknown transaction outcomes are record-only", async () => {
  let deleteAttempts = 0;
  const result = await reconcileExternalPublication({
    allowDeletion: false,
    record: async () => undefined,
    deleteExact: async () => {
      deleteAttempts += 1;
    },
  });

  assert.deepEqual(result, { status: "recorded" } satisfies ReconciliationResult);
  assert.equal(deleteAttempts, 0);
});

test("recording failure may delete only through the exact-delete fallback", async () => {
  let deleteAttempts = 0;
  const result = await reconcileExternalPublication({
    allowDeletion: true,
    record: async () => {
      throw new Error("manifest database failure");
    },
    deleteExact: async () => {
      deleteAttempts += 1;
    },
  });

  assert.equal(result.status, "deleted");
  assert.ok(result.recordError instanceof Error);
  assert.equal(deleteAttempts, 1);
});

test("recording and exact cleanup failure stays unresolved", async () => {
  const result = await reconcileExternalPublication({
    allowDeletion: true,
    record: async () => {
      throw new Error("manifest database failure");
    },
    deleteExact: async () => {
      throw new Error("provider unavailable");
    },
  });

  assert.equal(result.status, "unresolved");
  assert.ok(result.recordError instanceof Error);
  assert.ok(result.deleteError instanceof Error);
});
