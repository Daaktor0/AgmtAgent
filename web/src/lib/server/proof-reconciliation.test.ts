import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { MemoryProofR2Bucket, createProofObjectStore } from "./proof-objects.ts";
import { type RunFence, type TransferLedger, type WriterRecord } from "./proof-transfer.ts";
import { noWriterReceipt, reconcileUncertainWriter } from "./proof-reconciliation.ts";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

class MemoryLedger implements TransferLedger {
  run: RunFence;
  writers = new Map<string, WriterRecord>();
  constructor(run: RunFence) {
    this.run = { ...run };
  }
  async loadRun(runId: string) {
    return this.run.runId === runId ? { ...this.run } : null;
  }
  async casRun(input: { runId: string; expectedGeneration: number; status?: RunFence["status"]; nextGeneration?: number }) {
    if (this.run.generation !== input.expectedGeneration) throw new Error("stale");
    if (input.status) this.run.status = input.status;
    if (input.nextGeneration != null) this.run.generation = input.nextGeneration;
    return { ...this.run };
  }
  async insertWriter(record: WriterRecord) {
    this.writers.set(record.artifactId, { ...record });
  }
  async casWriter(input: {
    artifactId: string;
    expectedStatus: WriterRecord["writeStatus"];
    nextStatus: WriterRecord["writeStatus"];
    expectedGeneration: number;
  }) {
    const writer = this.writers.get(input.artifactId);
    if (!writer || writer.writeStatus !== input.expectedStatus || writer.generation !== input.expectedGeneration) return false;
    writer.writeStatus = input.nextStatus;
    return true;
  }
  async listWriters(runId: string) {
    return [...this.writers.values()].filter((writer) => writer.runId === runId).map((writer) => ({ ...writer }));
  }
  async clearWriter(artifactId: string) {
    this.writers.delete(artifactId);
  }
}

test("PWC-18 missing manifests and mismatched checksums stay unresolved; absence is not inferred from timeout", async () => {
  const objects = createProofObjectStore({
    mode: "local-test",
    quarantine: new MemoryProofR2Bucket(),
    temporary: new MemoryProofR2Bucket(),
  });
  const ledger = new MemoryLedger({
    runId: "run1",
    tenantId: "t1",
    ownerUserId: "u1",
    generation: 0,
    status: "deleting",
    processingDeadlineMs: Date.UTC(2026, 0, 1, 4, 50, 0),
    accessDeadlineMs: Date.UTC(2026, 0, 1, 4, 55, 0),
  });
  const missing: WriterRecord = {
    artifactId: "a1",
    runId: "run1",
    tenantId: "t1",
    ownerUserId: "u1",
    generation: 0,
    attempt: 1,
    kind: "marked_docx",
    key: objects.reserve({ deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0), generation: 0, attempt: 1, kind: "marked_docx" }).key,
    writeStatus: "uncertain",
    expectedSha256: "a".repeat(64),
    expectedSize: 4,
    deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0),
    uploadId: null,
    settledReceipt: null,
  };
  await ledger.insertWriter(missing);
  const absent = await reconcileUncertainWriter({ objects, ledger, writer: missing });
  assert.equal(absent.status, "absent");

  const reserved = objects.reserve({ deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0), generation: 0, attempt: 1, kind: "marked_docx" });
  const bytes = Buffer.from("abcd");
  await objects.write({
    key: reserved.key,
    bytes,
    sha256: sha256(bytes),
    byteSize: bytes.byteLength,
    deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0),
  });
  const mismatched: WriterRecord = {
    ...missing,
    artifactId: "a2",
    key: reserved.key,
    expectedSha256: "b".repeat(64),
  };
  await ledger.insertWriter(mismatched);
  const unresolved = await reconcileUncertainWriter({ objects, ledger, writer: mismatched });
  assert.equal(unresolved.status, "unresolved");
  assert.ok(await objects.head({ key: reserved.key }));
  const receipt = await noWriterReceipt({ objects, ledger, runId: "run1", generation: 0 });
  assert.equal(receipt, null);
});
