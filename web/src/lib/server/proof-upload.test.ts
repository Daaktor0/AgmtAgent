import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { proofDeadlines } from "./retention.ts";
import {
  CreateProofRunRequestSchema,
  ProofUploadError,
  assertSourceHeaders,
  consumeProofSourceStream,
  legacyProofUploadClosed,
  parseCreateProofRunRequest,
  partCountFor,
  PROOF_DOCX_MIME,
  PROOF_UPLOAD_PART_BYTES,
  sourcePutAccepted,
} from "./proof-upload.ts";
import { parseRunSummaryV2 } from "../products/api-contracts.ts";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function* chunksOf(bytes: Uint8Array, size = 4): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < bytes.byteLength; i += size) yield bytes.subarray(i, Math.min(bytes.byteLength, i + size));
}

const STARTED = 1_800_000_000_000;
const scanningSummary = parseRunSummaryV2({
  apiVersion: 2,
  runId: "run_2f8c1a9b0d4e6f70",
  status: "scanning",
  stage: "scanning",
  serverNow: STARTED + 60_000,
  deadlines: proofDeadlines(STARTED),
  correctionCount: null,
  commentCount: null,
  noticeCount: null,
  coverage: null,
  retry: { allowed: false, code: null },
  download: { available: false },
  deletion: { requestedAt: null, verifiedAt: null, reason: null },
  error: null,
});

test("PWC-19 create-run rejects unknown fields and bounds size/hash/profile/language", () => {
  const ok = parseCreateProofRunRequest({
    sizeBytes: 1024,
    sha256: "a".repeat(64),
    profile: "agreement",
    language: "en-GB",
  });
  assert.equal(ok.sizeBytes, 1024);
  assert.throws(() => parseCreateProofRunRequest({ ...ok, filename: "secret.docx" }), ProofUploadError);
  assert.throws(() => parseCreateProofRunRequest({ ...ok, sizeBytes: 25 * 1024 * 1024 + 1 }), ProofUploadError);
  assert.throws(() => parseCreateProofRunRequest({ ...ok, sha256: "zz" }), ProofUploadError);
  assert.equal(CreateProofRunRequestSchema.shape.profile.options.includes("agreement"), true);
});

test("PWC-19 source headers require MIME, length and refuse overflow", () => {
  assert.deepEqual(
    assertSourceHeaders({ contentType: PROOF_DOCX_MIME, contentLength: "12", declaredSize: 12 }),
    { contentLength: 12 },
  );
  assert.throws(
    () => assertSourceHeaders({ contentType: "application/pdf", contentLength: "12", declaredSize: 12 }),
    (error: unknown) => error instanceof ProofUploadError && error.code === "unsupported_content_type" && error.status === 415,
  );
  assert.throws(
    () => assertSourceHeaders({ contentType: PROOF_DOCX_MIME, contentLength: null, declaredSize: 12 }),
    (error: unknown) => error instanceof ProofUploadError && error.code === "invalid_upload_request",
  );
  assert.throws(
    () => assertSourceHeaders({ contentType: PROOF_DOCX_MIME, contentLength: String(25 * 1024 * 1024 + 1), declaredSize: 25 * 1024 * 1024 + 1 }),
    (error: unknown) => error instanceof ProofUploadError && error.status === 413,
  );
  assert.equal(partCountFor(PROOF_UPLOAD_PART_BYTES * 3 + 1), 4);
  assert.equal(partCountFor(25 * 1024 * 1024), 4);
  assert.throws(() => partCountFor(25 * 1024 * 1024 + 1), ProofUploadError);
});

test("PWC-19 stream overflow, idle timeout, hash mismatch and short reads fail closed", async () => {
  const bytes = Buffer.from("synthetic-docx-bytes");
  const digest = sha256(bytes);
  const ok = await consumeProofSourceStream({ stream: chunksOf(bytes), expectedBytes: bytes.byteLength, expectedSha256: digest });
  assert.equal(ok.sha256, digest);
  assert.equal(ok.byteSize, bytes.byteLength);

  await assert.rejects(
    consumeProofSourceStream({ stream: chunksOf(bytes), expectedBytes: bytes.byteLength - 1, expectedSha256: digest }),
    (error: unknown) => error instanceof ProofUploadError && error.code === "source_too_large",
  );
  await assert.rejects(
    consumeProofSourceStream({ stream: chunksOf(bytes), expectedBytes: bytes.byteLength + 1, expectedSha256: digest }),
    (error: unknown) => error instanceof ProofUploadError && error.code === "invalid_upload_request",
  );
  await assert.rejects(
    consumeProofSourceStream({ stream: chunksOf(bytes), expectedBytes: bytes.byteLength, expectedSha256: "b".repeat(64) }),
    (error: unknown) => error instanceof ProofUploadError && error.code === "upload_hash_mismatch" && error.status === 409,
  );

  let clock = STARTED;
  await assert.rejects(
    consumeProofSourceStream({
      stream: (async function* () {
        yield bytes.subarray(0, 4);
        clock += 21_000;
        yield bytes.subarray(4);
      })(),
      expectedBytes: bytes.byteLength,
      expectedSha256: digest,
      now: () => clock,
      startedAt: STARTED,
    }),
    (error: unknown) => error instanceof ProofUploadError && error.code === "upload_timeout",
  );
});

test("PWC-19 source PUT returns 202 without processing and the legacy POST is closed", () => {
  const accepted = sourcePutAccepted(scanningSummary);
  assert.equal(accepted.status, 202);
  assert.equal(accepted.summary.status, "scanning");
  assert.equal(accepted.summary.correctionCount, null);
  assert.throws(
    () => sourcePutAccepted({ ...scanningSummary, status: "ready", stage: "ready", correctionCount: 0, commentCount: 0, noticeCount: 0, coverage: { status: "complete", checked: [], skipped: [], notApplicable: [] }, download: { available: true } }),
    ProofUploadError,
  );
  const closed = legacyProofUploadClosed(STARTED);
  assert.equal(closed.status, 410);
  assert.equal(closed.body.error.code, "upgrade_needed");
});
