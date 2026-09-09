import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ProofEventError,
  durationBucketFor,
  emitProofEvent,
  parseProofEvent,
  sizeBucketFor,
} from "./proof-events.ts";

test("PWC-21 operational events reject secrets, bodies, keys and raw errors", () => {
  const ok = parseProofEvent({
    version: "proof-event-v1",
    name: "run_admitted",
    token: "a1b2c3d4e5f60718",
    stage: "uploading",
    errorCode: null,
    sizeBucket: sizeBucketFor(100),
    durationBucket: durationBucketFor(20),
    count: 1,
  });
  assert.equal(ok.name, "run_admitted");
  assert.equal(ok.sizeBucket, "le_1mib");
  assert.throws(() => parseProofEvent({ ...ok, filename: "secret.docx" }), ProofEventError);
  assert.throws(() => parseProofEvent({ ...ok, body: "PK" }), ProofEventError);
  assert.throws(() => parseProofEvent({ ...ok, key: "proof/v2/x" }), ProofEventError);
  assert.throws(() => parseProofEvent({ ...ok, error: new Error("password=secret") }), ProofEventError);
  const lines: string[] = [];
  emitProofEvent(ok, (line) => lines.push(line));
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0]!, /password|secret\.docx|proof\/v2/i);
});
