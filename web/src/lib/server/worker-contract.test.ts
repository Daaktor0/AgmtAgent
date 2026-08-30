import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_WORKER_MESSAGE_BYTES,
  WORKER_MESSAGE_VERSION,
  WorkerContractError,
  buildIngestWorkerMessage,
  dispositionForWorkerOutcome,
  validateIngestWorkerMessage,
} from "./worker-contract.ts";

const messageInput = {
  jobId: "job-1",
  tenantId: "tenant-one",
  uploadIntentId: "upload-1",
  objectKey: "obj_123e4567-e89b-12d3-a456-426614174000",
  sourceSha256: "a".repeat(64),
  parserVersion: "parser-v1",
  idempotencyKey: "ingest-1",
  attempt: 1,
  traceId: "trace-1",
};

test("WRK-01 builds a small metadata-only worker message", () => {
  const message = buildIngestWorkerMessage(messageInput);
  assert.equal(message.version, WORKER_MESSAGE_VERSION);
  assert.equal(message.jobId, "job-1");
  assert.equal(message.attempt, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(message), "utf8") < MAX_WORKER_MESSAGE_BYTES);
  assert.doesNotMatch(JSON.stringify(message), /document|bytes|presigned|cookie|token/i);
  assert.deepEqual(validateIngestWorkerMessage(message), message);
});

test("WRK-01 rejects unknown fields, document bytes, bad identities and oversized messages", () => {
  assert.throws(() => validateIngestWorkerMessage({ version: WORKER_MESSAGE_VERSION, ...messageInput, bytes: "payload" }), WorkerContractError);
  assert.throws(() => validateIngestWorkerMessage({ version: WORKER_MESSAGE_VERSION, ...messageInput, presignedUrl: "https://example.test" }), WorkerContractError);
  assert.throws(() => validateIngestWorkerMessage({ version: WORKER_MESSAGE_VERSION, ...messageInput, attempt: 0 }), /attempt/);
  assert.throws(() => validateIngestWorkerMessage({ version: WORKER_MESSAGE_VERSION, ...messageInput, sourceSha256: "x" }), /SHA-256/);
  assert.throws(() => validateIngestWorkerMessage({ version: WORKER_MESSAGE_VERSION, ...messageInput, objectKey: "../../object" }), /object key/);
  assert.throws(() => validateIngestWorkerMessage({ version: WORKER_MESSAGE_VERSION, ...messageInput, parserVersion: "" }), /parser/);
  assert.throws(() => validateIngestWorkerMessage({ version: WORKER_MESSAGE_VERSION, ...messageInput, traceId: "x".repeat(1000) }), /trace/);
});

test("WRK-01 converges duplicate, crash and timeout outcomes under bounded attempts", () => {
  assert.deepEqual(dispositionForWorkerOutcome({ outcome: "duplicate", attempt: 1 }), { action: "ack", jobStatus: "succeeded", reasonCode: "duplicate" });
  assert.deepEqual(dispositionForWorkerOutcome({ outcome: "crash", attempt: 1, maxAttempts: 3 }), { action: "retry", jobStatus: "queued", reasonCode: "worker_crash" });
  assert.deepEqual(dispositionForWorkerOutcome({ outcome: "timeout", attempt: 3, maxAttempts: 3 }), { action: "dead_letter", jobStatus: "dead_letter", reasonCode: "worker_timeout" });
  assert.deepEqual(dispositionForWorkerOutcome({ outcome: "fatal", attempt: 1, maxAttempts: 3 }), { action: "dead_letter", jobStatus: "dead_letter", reasonCode: "worker_fatal" });
  assert.throws(() => dispositionForWorkerOutcome({ outcome: "crash", attempt: 4, maxAttempts: 3 }), /attempt/);
});