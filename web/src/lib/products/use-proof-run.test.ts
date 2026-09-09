import assert from "node:assert/strict";
import { test } from "node:test";
import { PROOF_UI_FIXTURES } from "./api-contracts.ts";
import {
  clearProofRunPointer,
  errorFromResponse,
  idempotencyKeyFor,
  loadProofRunPointer,
  mergePolledSummary,
  parseProofRunPointer,
  sanitizeDownloadBasename,
  saveProofRunPointer,
} from "./use-proof-run.ts";

test("PWC-31 pointer stores only run metadata and rejects filenames", () => {
  const pointer = {
    runId: "run_2f8c1a9b0d4e6f70",
    profile: "agreement" as const,
    language: "en-GB" as const,
    idempotencyKey: "proof-abc",
    sourceSha256: "a".repeat(64),
  };
  assert.deepEqual(parseProofRunPointer(pointer), pointer);
  assert.equal(parseProofRunPointer({ ...pointer, filename: "Agreement.docx" }), null);
  assert.equal(parseProofRunPointer({ ...pointer, name: "Agreement.docx" }), null);
  const store: Record<string, string> = {};
  saveProofRunPointer({ setItem: (key, value) => { store[key] = value; } }, pointer);
  const loaded = loadProofRunPointer({ getItem: (key) => store[key] ?? null });
  assert.equal(loaded?.runId, pointer.runId);
  clearProofRunPointer({ removeItem: (key) => { delete store[key]; } });
});

test("PWC-31 idempotency is stable for the same hash and options", () => {
  const hash = "b".repeat(64);
  assert.equal(idempotencyKeyFor(hash, "agreement", "en-GB"), idempotencyKeyFor(hash, "agreement", "en-GB"));
  assert.notEqual(idempotencyKeyFor(hash, "agreement", "en-GB"), idempotencyKeyFor(hash, "general", "en-GB"));
});

test("PWC-31 stale ready cannot be overwritten by an older processing poll", () => {
  const ready = PROOF_UI_FIXTURES.find((item) => item.state === "ready_findings")!.run!;
  const processing = PROOF_UI_FIXTURES.find((item) => item.state === "processing")!.run!;
  assert.equal(mergePolledSummary(ready, processing).status, "ready");
  assert.equal(mergePolledSummary(processing, ready).status, "ready");
});

test("PWC-31 maps paused and disconnected envelopes without inventing success", () => {
  const paused = errorFromResponse(503, { error: "uploads_paused" });
  assert.equal(paused.code, "uploads_paused");
  assert.equal(paused.retryable, true);
  const disconnected = errorFromResponse(503, {
    error: { code: "processing_unavailable", messageKey: "processing_unavailable", retryable: true, supportId: "a1b2c3d4e5f60718" },
    serverNow: 1_800_000_000_000,
  });
  assert.equal(disconnected.code, "processing_unavailable");
  assert.notEqual(disconnected.code, "ready");
});

test("PWC-31 download names are generic after return and reject path separators", () => {
  assert.equal(sanitizeDownloadBasename("Agreement.docx"), "Agreement_Proofread.docx");
  assert.equal(sanitizeDownloadBasename("C:\\\\temp\\\\../secret.docx"), "Ctemp..secret_Proofread.docx");
  assert.equal(sanitizeDownloadBasename(null), "Agmt_Proofread.docx");
});
