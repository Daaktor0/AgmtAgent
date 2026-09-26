import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { launchFixture } from "../agmt/corpus/launch-fixtures.ts";
import { proofDeadlines } from "./retention.ts";
import type { ProductRunRow } from "./product-runs.ts";
import { MemoryProofR2Bucket, createProofObjectStore } from "./proof-objects.ts";
import { MemoryTransferLedger } from "./proof-ledger.ts";
import { createProofTransfer } from "./proof-transfer.ts";
import { executeProofPipeline } from "./proof-pipeline.ts";
import { unprovisionedAntivirus, type ProofAntivirus } from "./proof-antivirus.ts";
import { canTransitionProductRun } from "./product-runs.ts";

const NOW = Date.UTC(2026, 0, 1, 3, 0, 0);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function runFor(source: Uint8Array): ProductRunRow {
  return {
    runId: "run_pipeline1",
    tenantId: "t1",
    ownerUserId: "u1",
    productId: "proof",
    retentionPolicy: "temporary_2h",
    status: "scanning",
    deadlines: proofDeadlines(NOW),
    cancellationGeneration: 0,
    attemptCount: 0,
    parserVersion: "proof-docx-v2",
    ruleSetVersion: "proof-launch-v1",
    exporterVersion: "proof-ooxml-v1",
    idempotencyKey: "k1",
    sourceSize: source.byteLength,
    sourceSha256: sha256(source),
    outputArtifactId: null,
    correctionCount: 0,
    commentCount: 0,
    coverageStatus: null,
    errorCode: null,
    deletedAt: null,
    deletionVerifiedAt: null,
    profile: "agreement",
    language: "en-GB",
    noticeCount: 0,
    leaseToken: null,
  };
}

function cleanAntivirus(): ProofAntivirus {
  return {
    async scan(input) {
      return {
        version: "proof-scan-receipt-v1",
        sourceSha256: input.sourceSha256,
        byteSize: input.byteSize,
        engineVersion: "test-clam",
        signatureVersion: "test-sig",
        scannedAt: input.now,
        status: "clean",
      };
    },
    async healthy() {
      return true;
    },
  };
}

async function harness(source: Uint8Array) {
  const objects = createProofObjectStore({
    mode: "local-test",
    quarantine: new MemoryProofR2Bucket(),
    temporary: new MemoryProofR2Bucket(),
  });
  const row = runFor(source);
  const ledger = new MemoryTransferLedger({
    runId: row.runId,
    tenantId: row.tenantId,
    ownerUserId: row.ownerUserId,
    generation: 0,
    status: "scanning",
    processingDeadlineMs: row.deadlines.processingDeadline,
    accessDeadlineMs: row.deadlines.accessDeadline,
  });
  const transfer = createProofTransfer({ objects, ledger, now: () => NOW + 1_000 });
  await transfer.putObject({
    runId: row.runId,
    tenantId: row.tenantId,
    ownerUserId: row.ownerUserId,
    generation: 0,
    attempt: 1,
    kind: "source",
    bytes: source,
    deadlineMs: row.deadlines.retentionDeadline,
  });
  return { objects, transfer, ledger, row };
}

test("PWC-22/24 unavailable antivirus never publishes a ready document", async () => {
  const source = await launchFixture("body");
  const { objects, transfer, row } = await harness(source);
  const current = { ...row };
  const result = await executeProofPipeline(current, {
    now: () => NOW + 1_000,
    objects,
    transfer,
    antivirus: unprovisionedAntivirus(),
    async transition(run, to) {
      current.status = to;
      return { ...run, status: to };
    },
    async recordScan() {},
    async publish(run) {
      return { ...run, status: "ready" };
    },
    async fail(run, code, rejected) {
      return { ...run, status: rejected ? "rejected" : "failed", errorCode: code };
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "scanner_unavailable");
  assert.equal(canTransitionProductRun("scanning", "processing"), false);
});

test("PWC-23/25 clean scan then isolated compute publishes a validated output", async () => {
  const source = await launchFixture("body");
  const { objects, transfer, ledger, row } = await harness(source);
  const current = { ...row };
  const result = await executeProofPipeline(current, {
    now: () => NOW + 1_000,
    objects,
    transfer,
    antivirus: cleanAntivirus(),
    async transition(run, to) {
      assert.equal(canTransitionProductRun(run.status, to), true);
      assert.notEqual(`${run.status}->${to}`, "scanning->processing");
      const next = { ...run, status: to };
      current.status = to;
      ledger.run && (ledger.run.status = to);
      return next;
    },
    async recordScan() {},
    async publish(run, input) {
      assert.ok(input.outputArtifactId);
      assert.ok(input.correctionCount + input.commentCount >= 1);
      return {
        ...run,
        status: "ready",
        outputArtifactId: input.outputArtifactId,
        correctionCount: input.correctionCount,
        commentCount: input.commentCount,
        noticeCount: input.noticeCount,
        coverageStatus: input.coverageStatus,
      };
    },
    async fail(run, code) {
      return { ...run, status: "failed", errorCode: code };
    },
  });
  assert.equal(result.status, "ready");
  assert.ok(result.outputArtifactId);
  const writers = await transfer.listWriters(row.runId);
  const output = writers.find((writer) => writer.kind === "marked_docx" && writer.writeStatus === "settled");
  assert.ok(output);
  const bytes = await objects.get({ key: output.key, expectedSha256: output.expectedSha256 });
  assert.ok(bytes && bytes.byteLength > 0);
});
