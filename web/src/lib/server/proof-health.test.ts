import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryProofR2Bucket } from "./proof-objects.ts";
import { readProofHealth, writeProofHealth } from "./proof-health.ts";

test("PWC-27 health receipts persist outside the document key namespace", async () => {
  const bucket = new MemoryProofR2Bucket();
  await writeProofHealth(bucket, "purge", 1_800_000_000_000, "proof-purge-v1");
  await writeProofHealth(bucket, "validator", 1_800_000_000_000, "proof-reconstruct-v1");
  const snapshot = await readProofHealth(bucket);
  assert.equal(snapshot.purgeReadyAt, 1_800_000_000_000);
  assert.equal(snapshot.validatorReadyAt, 1_800_000_000_000);
  assert.equal(snapshot.scannerReadyAt, null);
});
