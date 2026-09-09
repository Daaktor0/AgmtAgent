import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { launchFixture } from "../agmt/corpus/launch-fixtures.ts";
import { ProofComputeError, runLocalProofCompute } from "./proof-compute.ts";

test("PWC-23 local compute refuses a hash mismatch and returns counts for a synthetic package", async () => {
  const source = await launchFixture("body");
  const sha = createHash("sha256").update(source).digest("hex");
  await assert.rejects(() => runLocalProofCompute(source, "a".repeat(64)), ProofComputeError);
  const result = await runLocalProofCompute(source, sha);
  assert.equal(result.receipt.sourceSha256, sha);
  assert.equal(result.receipt.outputSha256.length, 64);
  assert.ok(result.receipt.correctionCount + result.receipt.commentCount >= 1);
});
