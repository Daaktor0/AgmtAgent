import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { MemoryProofR2Bucket, createProofObjectStore, parseProofObjectKey } from "./proof-objects.ts";
import {
  ProofTransferError,
  admitPublication,
  ownedReservedKey,
  type RunFence,
  type TransferLedger,
  type WriterRecord,
} from "./proof-transfer.ts";
import { noWriterReceipt, reconcileUncertainWriter, reconcileRunWriters } from "./proof-reconciliation.ts";

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

const DEADLINE = Date.UTC(2026, 0, 1, 4, 0, 0);

function fence(status: RunFence["status"] = "deleting", generation = 1): RunFence {
  return {
    runId: "run1",
    tenantId: "t1",
    ownerUserId: "u1",
    generation,
    status,
    processingDeadlineMs: Date.UTC(2026, 0, 1, 4, 50, 0),
    accessDeadlineMs: Date.UTC(2026, 0, 1, 4, 55, 0),
  };
}

function harness(status: RunFence["status"] = "deleting") {
  const quarantine = new MemoryProofR2Bucket();
  const temporary = new MemoryProofR2Bucket();
  const objects = createProofObjectStore({ mode: "local-test", quarantine, temporary });
  const ledger = new MemoryLedger(fence(status));
  return { objects, ledger, quarantine, temporary };
}

function writerFor(objects: ReturnType<typeof createProofObjectStore>, extra: Partial<WriterRecord> = {}): WriterRecord {
  const reserved = objects.reserve({ deadlineMs: DEADLINE, generation: 0, attempt: 1, kind: "marked_docx" });
  const bytes = Buffer.from("abcd");
  const record: WriterRecord = {
    artifactId: extra.artifactId ?? "a1",
    runId: "run1",
    tenantId: "t1",
    ownerUserId: "u1",
    generation: 0,
    attempt: 1,
    kind: "marked_docx",
    key: extra.key ?? reserved.key,
    writeStatus: extra.writeStatus ?? "uncertain",
    expectedSha256: extra.expectedSha256 ?? sha256(bytes),
    expectedSize: extra.expectedSize ?? bytes.byteLength,
    deadlineMs: extra.deadlineMs ?? DEADLINE,
    uploadId: extra.uploadId ?? null,
    settledReceipt: extra.settledReceipt ?? null,
  };
  return { ...record, ...extra, key: extra.key ?? reserved.key };
}

async function putOnTemporary(
  temporary: MemoryProofR2Bucket,
  key: string,
  body: Uint8Array,
  meta: { sha256: string; byteSize: number },
) {
  await temporary.put(key, body, {
    customMetadata: {
      schemaVersion: "proof-object-v1",
      deadlineMs: String(DEADLINE),
      sha256: meta.sha256,
      byteSize: String(meta.byteSize),
      generation: "0",
      attempt: "1",
      kind: "marked_docx",
    },
  });
}

test("PWC-18 publication requires exact checksum and size; mismatch never publishes", async () => {
  const { objects, temporary } = harness("exporting");
  const expected = Buffer.from("abcd");
  const writer = writerFor(objects, { writeStatus: "settled", expectedSha256: sha256(expected), expectedSize: expected.byteLength });
  await putOnTemporary(temporary, writer.key, Buffer.from("xxxx"), { sha256: sha256(Buffer.from("xxxx")), byteSize: 4 });
  const head = await objects.head({ key: writer.key });
  const decision = admitPublication({ writer, head });
  assert.equal(decision.admitted, false);
  assert.equal(decision.code, "integrity_mismatch");
  assert.ok(await objects.head({ key: writer.key }));
});

test("PWC-18 mismatched bytes on an owned key remain deletable after the run is fenced", async () => {
  const { objects, ledger, temporary } = harness("deleting");
  const expected = Buffer.from("abcd");
  const writer = writerFor(objects, { expectedSha256: sha256(expected), expectedSize: expected.byteLength });
  await ledger.insertWriter(writer);
  await putOnTemporary(temporary, writer.key, Buffer.from("xxxx"), { sha256: sha256(Buffer.from("xxxx")), byteSize: 4 });
  assert.equal(admitPublication({ writer, head: await objects.head({ key: writer.key }) }).admitted, false);
  const result = await reconcileUncertainWriter({ objects, ledger, writer });
  assert.equal(result.status, "deleted");
  assert.equal(await objects.head({ key: writer.key }), null);
  assert.equal(ledger.writers.has(writer.artifactId), false);
});

test("PWC-18 partial and corrupt owned objects are deleted, never published or relocated", async () => {
  const { objects, ledger, temporary } = harness("deleting");
  const expected = Buffer.from("full-object-bytes");
  const partial = writerFor(objects, { artifactId: "partial", expectedSha256: sha256(expected), expectedSize: expected.byteLength });
  const corrupt = writerFor(objects, { artifactId: "corrupt", expectedSha256: sha256(expected), expectedSize: expected.byteLength });
  await ledger.insertWriter(partial);
  await ledger.insertWriter(corrupt);
  await putOnTemporary(temporary, partial.key, Buffer.from("xx"), { sha256: sha256(Buffer.from("xx")), byteSize: 2 });
  await putOnTemporary(temporary, corrupt.key, Buffer.from("xx"), { sha256: sha256(expected), byteSize: expected.byteLength });
  const partialHead = await objects.inspect({ key: partial.key });
  const corruptHead = await objects.inspect({ key: corrupt.key });
  assert.equal(partialHead.presence, "present");
  assert.equal(corruptHead.presence, "corrupt");
  assert.equal(admitPublication({ writer: partial, head: partialHead.receipt }).admitted, false);
  assert.equal(admitPublication({ writer: corrupt, head: corruptHead.receipt }).admitted, false);
  const results = await reconcileRunWriters({ objects, ledger, runId: "run1" });
  assert.equal(results.every((item) => item.status === "deleted"), true);
  assert.equal(await objects.head({ key: partial.key }), null);
  assert.equal((await objects.inspect({ key: corrupt.key })).presence, "absent");
});

test("PWC-18 missing HEAD cannot prove deletion while a writer can still write", async () => {
  const { objects, ledger } = harness("exporting");
  ledger.run.status = "exporting";
  ledger.run.generation = 0;
  const writer = writerFor(objects, { writeStatus: "writing" });
  await ledger.insertWriter(writer);
  const result = await reconcileUncertainWriter({ objects, ledger, writer });
  assert.equal(result.status, "unresolved");
  assert.equal(result.code, "writes_still_possible");
  assert.equal(ledger.writers.has(writer.artifactId), true);
  assert.equal(await noWriterReceipt({ objects, ledger, runId: "run1", generation: 0 }), null);
});

test("PWC-18 missing objects are absent only after the fence and writer drain", async () => {
  const { objects, ledger } = harness("deleting");
  const writer = writerFor(objects, { writeStatus: "uncertain" });
  await ledger.insertWriter(writer);
  const result = await reconcileUncertainWriter({ objects, ledger, writer });
  assert.equal(result.status, "absent");
  assert.equal(ledger.writers.has(writer.artifactId), false);
  const receipt = await noWriterReceipt({ objects, ledger, runId: "run1", generation: 1 });
  assert.ok(receipt);
  assert.equal(receipt.uncertainCount, 0);
});

test("PWC-18 user-supplied keys are never deletion authority", () => {
  const { objects } = harness("deleting");
  const writer = writerFor(objects);
  const foreign = `proof/v2/20260101T0400/${"f".repeat(32)}/0/1/marked_docx-${"e".repeat(32)}`;
  parseProofObjectKey(foreign);
  assert.equal(ownedReservedKey(writer, writer.key), true);
  assert.equal(ownedReservedKey(writer, foreign), false);
  assert.equal(ownedReservedKey(writer, "tenants/abc/objects/obj_123"), false);
});

test("PWC-18 uncertain provider state is kept unresolved and is never silently abandoned", async () => {
  const { objects, ledger } = harness("deleting");
  const writer = writerFor(objects, {
    key: "tenants/not-a-proof-key",
    writeStatus: "uncertain",
  });
  await ledger.insertWriter(writer);
  const result = await reconcileUncertainWriter({ objects, ledger, writer });
  assert.equal(result.status, "unresolved");
  assert.equal(result.code, "ownership_uncertain");
  assert.equal(ledger.writers.has(writer.artifactId), true);
  assert.equal(await noWriterReceipt({ objects, ledger, runId: "run1", generation: 1 }), null);
});
