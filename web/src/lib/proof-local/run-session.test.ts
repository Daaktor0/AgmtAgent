import assert from "node:assert/strict";
import { test } from "node:test";
import { createProofRunSession } from "./run-session.ts";

test("a cancelled or replaced run token cannot publish a late result", () => {
  const session = createProofRunSession();
  const first = session.begin();
  assert.equal(session.isActive(first), true);

  session.invalidate();
  assert.equal(session.isActive(first), false);

  const second = session.begin();
  assert.equal(session.isActive(first), false);
  assert.equal(session.isActive(second), true);

  const third = session.begin();
  assert.equal(session.isActive(second), false);
  assert.equal(session.isActive(third), true);
});
