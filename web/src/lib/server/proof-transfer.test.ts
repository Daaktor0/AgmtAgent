import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { MemoryProofR2Bucket, createProofObjectStore } from "./proof-objects.ts";
import {
  ProofTransferError,
  createProofTransfer,
  type RunFence,
  type TransferLedger,
  type WriterRecord,
} from "./proof-transfer.ts";
import { noWriterReceipt, reconcileRunWriters } from "./proof-reconciliation.ts";

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
    if (this.run.runId !== input.runId || this.run.generation !== input.expectedGeneration) {
      throw new ProofTransferError("stale_generation", "CAS generation mismatch");
    }
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
    receipt?: WriterRecord["settledReceipt"];
  }) {
    const writer = this.writers.get(input.artifactId);
    if (!writer || writer.writeStatus !== input.expectedStatus || writer.generation !== input.expectedGeneration) return false;
    writer.writeStatus = input.nextStatus;
    if (input.receipt !== undefined) writer.settledReceipt = input.receipt;
    return true;
  }
  async listWriters(runId: string) {
    return [...this.writers.values()].filter((writer) => writer.runId === runId).map((writer) => ({ ...writer }));
  }
  async clearWriter(artifactId: string) {
    this.writers.delete(artifactId);
  }
}

function harness(nowMs = Date.UTC(2026, 0, 1, 3, 0, 0)) {
  const quarantine = new MemoryProofR2Bucket();
  const temporary = new MemoryProofR2Bucket();
  const objects = createProofObjectStore({ mode: "local-test", quarantine, temporary });
  const fence: RunFence = {
    runId: "run1",
    tenantId: "t1",
    ownerUserId: "u1",
    generation: 0,
    status: "exporting",
    processingDeadlineMs: Date.UTC(2026, 0, 1, 4, 50, 0),
    accessDeadlineMs: Date.UTC(2026, 0, 1, 4, 55, 0),
  };
  const ledger = new MemoryLedger(fence);
  const transfer = createProofTransfer({ objects, ledger, now: () => nowMs });
  return { objects, ledger, transfer, quarantine, temporary, fence };
}

test("PWC-18 cancel before put fences the run and never writes", async () => {
  const { transfer, objects, ledger } = harness();
  await transfer.cancel({ runId: "run1", tenantId: "t1", ownerUserId: "u1" });
  const bytes = Buffer.from("synthetic-marked");
  await assert.rejects(
    transfer.putObject({
      runId: "run1",
      tenantId: "t1",
      ownerUserId: "u1",
      generation: 0,
      attempt: 1,
      kind: "marked_docx",
      bytes,
      deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0),
    }),
    (error: unknown) => error instanceof ProofTransferError && (error.code === "run_cancelled" || error.code === "stale_generation"),
  );
  assert.equal((await objects.list({ bucketRole: "temporary", prefix: "proof/v2/" })).keys.length, 0);
  assert.equal(ledger.run.status, "deleting");
  assert.equal(ledger.run.generation, 1);
});

test("PWC-18 cancel during put leaves an uncertain writer; duplicate identical writes stay settled", async () => {
  const { transfer, objects, ledger } = harness();
  const bytes = Buffer.from("synthetic-marked");
  const cancelled = await transfer.putObject({
    runId: "run1",
    tenantId: "t1",
    ownerUserId: "u1",
    generation: 0,
    attempt: 1,
    kind: "marked_docx",
    bytes,
    deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0),
    afterProviderWrite: async () => {
      await transfer.cancel({ runId: "run1", tenantId: "t1", ownerUserId: "u1" });
    },
  });
  assert.equal(cancelled.status, "uncertain");
  assert.ok(cancelled.receipt);
  const headed = await objects.head({ key: cancelled.key });
  assert.ok(headed);

  const { transfer: other, objects: objects2 } = harness();
  const first = await other.putObject({
    runId: "run1",
    tenantId: "t1",
    ownerUserId: "u1",
    generation: 0,
    attempt: 1,
    kind: "source",
    bytes,
    deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0),
  });
  assert.equal(first.status, "settled");
  const duplicate = await objects2.write({
    key: first.key,
    bytes,
    sha256: sha256(bytes),
    byteSize: bytes.byteLength,
    deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0),
  });
  assert.equal(duplicate.sha256, sha256(bytes));
  assert.equal(ledger.run.generation, 1);
});

test("PWC-18 timeout after a successful write is uncertain and reconcilable, never a silent abort", async () => {
  const { transfer, objects, ledger } = harness();
  const bytes = Buffer.from("synthetic-timeout");
  const result = await transfer.putObject({
    runId: "run1",
    tenantId: "t1",
    ownerUserId: "u1",
    generation: 0,
    attempt: 1,
    kind: "marked_docx",
    bytes,
    deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0),
    afterProviderWrite: async () => {
      ledger.run.generation = 1;
      ledger.run.status = "deleting";
    },
  });
  assert.equal(result.status, "uncertain");
  assert.ok(await objects.head({ key: result.key }));
  const reconciled = await reconcileRunWriters({ objects, ledger, runId: "run1" });
  assert.equal(reconciled[0]?.status, "deleted");
  assert.equal(await objects.head({ key: result.key }), null);
  const receipt = await noWriterReceipt({ objects, ledger, runId: "run1", generation: 1 });
  assert.ok(receipt);
  assert.equal(receipt.uncertainCount, 0);
});
