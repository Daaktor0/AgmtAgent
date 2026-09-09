import assert from "node:assert/strict";
import { test } from "node:test";
import { canTransitionProductRun } from "./product-runs.ts";
import {
  acknowledgeDuplicate,
  assertProofQueueTransition,
  parseProofQueueEnvelope,
  ProofQueueError,
} from "./proof-queue.ts";

test("PWC-24 local queue refuses scanning to processing and content-bearing envelopes", () => {
  assert.equal(canTransitionProductRun("scanning", "processing"), false);
  assert.throws(() => assertProofQueueTransition("scanning", "processing"), ProofQueueError);
  assertProofQueueTransition("scanning", "queued");
  assertProofQueueTransition("queued", "processing");
  assert.throws(() => parseProofQueueEnvelope({
    version: 1, runId: "run_1", generation: 1, attempt: 1, stage: "scan", filename: "Agreement.docx",
  }), ProofQueueError);
  assert.equal(acknowledgeDuplicate({ currentStatus: "ready", envelopeGeneration: 1, runGeneration: 1 }), "ack");
  assert.equal(acknowledgeDuplicate({ currentStatus: "queued", envelopeGeneration: 1, runGeneration: 2 }), "ignore");
});
