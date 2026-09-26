import assert from "node:assert/strict";
import { test } from "node:test";
import {
  admitProofFeedback,
  memoryFeedbackStore,
  parseProofFeedbackBody,
  ProofFeedbackError,
  PROOF_FEEDBACK_MAX_PER_RUN,
} from "./proof-feedback.ts";

const NOW = 1_800_000_000_000;
const valid = JSON.stringify({
  ruleId: "language.typo_allowlist",
  category: "language",
  verdict: "useful",
});

test("PWC-33A accepts closed feedback and rejects extra keys, free text and oversized bodies", () => {
  assert.equal(parseProofFeedbackBody(valid).verdict, "useful");
  assert.throws(() => parseProofFeedbackBody(JSON.stringify({
    ruleId: "language.typo_allowlist",
    category: "language",
    verdict: "useful",
    comment: "the clause is wrong",
  })), ProofFeedbackError);
  assert.throws(() => parseProofFeedbackBody(JSON.stringify({
    ruleId: "future.rule",
    category: "language",
    verdict: "useful",
  })), ProofFeedbackError);
  assert.throws(() => parseProofFeedbackBody("x".repeat(1025)), ProofFeedbackError);
});

test("PWC-33A caps per-run submissions and does not revive gone metadata", () => {
  const store = memoryFeedbackStore();
  for (let index = 0; index < PROOF_FEEDBACK_MAX_PER_RUN; index += 1) {
    admitProofFeedback({ store, runId: "run_2f8c1a9b0d4e6f70", ownerUserId: "owner-a", runGone: false, nowMs: NOW, rawBody: valid });
  }
  assert.throws(() => admitProofFeedback({
    store, runId: "run_2f8c1a9b0d4e6f70", ownerUserId: "owner-a", runGone: false, nowMs: NOW, rawBody: valid,
  }), (error: unknown) => error instanceof ProofFeedbackError && error.code === "quota_exceeded");
  assert.throws(() => admitProofFeedback({
    store: memoryFeedbackStore(), runId: "run_2f8c1a9b0d4e6f70", ownerUserId: "owner-a", runGone: true, nowMs: NOW, rawBody: valid,
  }), (error: unknown) => error instanceof ProofFeedbackError && error.code === "gone");
});
