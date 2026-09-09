import assert from "node:assert/strict";
import { test } from "node:test";
import { dueKeys, nextCursor } from "./worker.ts";

test("PWC-27 local purge pages due prefixes conservatively", () => {
  const now = 1_000_000;
  const due = dueKeys([
    { key: "proof/v2/a", deadlineMs: now - 1 },
    { key: "proof/v2/b", deadlineMs: now + 120_000 },
  ], now, 60_000);
  assert.deepEqual(due, ["proof/v2/a"]);
  const keys = Array.from({ length: 120 }, (_, index) => `k${index}`);
  const first = nextCursor(keys, 100);
  assert.equal(first.page.length, 100);
  assert.equal(first.cursor, "k100");
});
