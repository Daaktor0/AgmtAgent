import assert from "node:assert/strict";
import { test } from "node:test";
import { deletionOutcome, maySetDeletionVerifiedAt } from "./proof-delete.ts";

test("PWC-26 local deletion cannot verify while writers or objects remain", () => {
  assert.equal(deletionOutcome({
    runStatus: "deleting",
    writers: [{ status: "writing" }],
    inspections: [{ presence: "absent", receipt: null }],
  }), "uncertain");
  assert.equal(deletionOutcome({
    runStatus: "deleting",
    writers: [{ status: "settled" }],
    inspections: [{ presence: "present", receipt: null }],
  }), "pending");
  assert.equal(deletionOutcome({
    runStatus: "deleting",
    writers: [{ status: "settled" }],
    inspections: [{ presence: "unknown", receipt: null }],
  }), "uncertain");
  const verified = deletionOutcome({
    runStatus: "deleting",
    writers: [{ status: "settled" }],
    inspections: [{ presence: "absent", receipt: null }],
  });
  assert.equal(verified, "verified");
  assert.equal(maySetDeletionVerifiedAt(verified), true);
  assert.equal(maySetDeletionVerifiedAt("pending"), false);
});
