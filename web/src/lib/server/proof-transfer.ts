/**
 * Transfer reservations and cancellation fencing (PWC-18).
 *
 * Reserve metadata before any provider write. Never hold a database
 * transaction open during network I/O. A provider timeout is uncertain,
 * not proof that nothing was written.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  type ProofObjectKind,
  type ProofObjectReceipt,
  type ProofObjectStore,
} from "./proof-objects.ts";
import { ObjectStoreError } from "./object-store.ts";

export const PROOF_TRANSFER_VERSION = "proof-transfer-v1" as const;
export type WriteStatus = "reserved" | "writing" | "settled" | "uncertain";
export type RunFenceStatus =
  | "uploading"
  | "scanning"
  | "queued"
  | "processing"
  | "exporting"
  | "ready"
  | "failed"
  | "rejected"
  | "deleting"
  | "deleted";

export type RunFence = {
  runId: string;
  tenantId: string;
  ownerUserId: string;
  generation: number;
  status: RunFenceStatus;
  processingDeadlineMs: number;
  accessDeadlineMs: number;
};

export type WriterRecord = {
  artifactId: string;
  runId: string;
  tenantId: string;
  ownerUserId: string;
  generation: number;
  attempt: number;
  kind: ProofObjectKind;
  key: string;
  writeStatus: WriteStatus;
  expectedSha256: string;
  expectedSize: number;
  deadlineMs: number;
  uploadId: string | null;
  settledReceipt: ProofObjectReceipt | null;
};

export interface TransferLedger {
  loadRun(runId: string): Promise<RunFence | null>;
  casRun(input: {
    runId: string;
    expectedGeneration: number;
    status?: RunFenceStatus;
    nextGeneration?: number;
  }): Promise<RunFence>;
  insertWriter(record: WriterRecord): Promise<void>;
  casWriter(input: {
    artifactId: string;
    expectedStatus: WriteStatus;
    nextStatus: WriteStatus;
    expectedGeneration: number;
    receipt?: ProofObjectReceipt | null;
  }): Promise<boolean>;
  listWriters(runId: string): Promise<WriterRecord[]>;
  clearWriter(artifactId: string): Promise<void>;
}

export class ProofTransferError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProofTransferError";
    this.code = code;
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertOpenFence(run: RunFence, nowMs: number, expectedGeneration?: number): void {
  if (expectedGeneration != null && run.generation !== expectedGeneration) {
    throw new ProofTransferError("stale_generation", "Run generation changed before the transfer completed");
  }
  if (run.status === "deleting" || run.status === "deleted") {
    throw new ProofTransferError("run_cancelled", "The run is cancelled; new writes are fenced");
  }
  if (nowMs >= run.processingDeadlineMs || nowMs >= run.accessDeadlineMs) {
    throw new ProofTransferError("run_expired", "The original deadline has passed");
  }
}

export class ProofTransfer {
  private readonly objects: ProofObjectStore;
  private readonly ledger: TransferLedger;
  private readonly now: () => number;

  constructor(objects: ProofObjectStore, ledger: TransferLedger, now: () => number = Date.now) {
    this.objects = objects;
    this.ledger = ledger;
    this.now = now;
  }

  async putObject(input: {
    runId: string;
    tenantId: string;
    ownerUserId: string;
    generation: number;
    attempt: number;
    kind: ProofObjectKind;
    bytes: Uint8Array;
    deadlineMs: number;
    afterProviderWrite?: () => Promise<void>;
  }): Promise<{ status: "settled" | "uncertain"; receipt: ProofObjectReceipt | null; artifactId: string; key: string }> {
    const run = await this.ledger.loadRun(input.runId);
    if (!run || run.tenantId !== input.tenantId || run.ownerUserId !== input.ownerUserId) {
      throw new ProofTransferError("run_not_found", "Run fence is missing");
    }
    assertOpenFence(run, this.now(), input.generation);
    const reservation = this.objects.reserve({
      deadlineMs: input.deadlineMs,
      generation: input.generation,
      attempt: input.attempt,
      kind: input.kind,
    });
    const artifactId = randomBytes(16).toString("hex");
    const expectedSha256 = sha256Hex(input.bytes);
    const writer: WriterRecord = {
      artifactId,
      runId: input.runId,
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      generation: input.generation,
      attempt: input.attempt,
      kind: input.kind,
      key: reservation.key,
      writeStatus: "reserved",
      expectedSha256,
      expectedSize: input.bytes.byteLength,
      deadlineMs: input.deadlineMs,
      uploadId: reservation.uploadId,
      settledReceipt: null,
    };
    await this.ledger.insertWriter(writer);
    const markedWriting = await this.ledger.casWriter({
      artifactId,
      expectedStatus: "reserved",
      nextStatus: "writing",
      expectedGeneration: input.generation,
    });
    if (!markedWriting) throw new ProofTransferError("writer_cas_failed", "Writer could not enter the writing state");
    const before = await this.ledger.loadRun(input.runId);
    if (!before) throw new ProofTransferError("run_not_found", "Run fence is missing");
    try {
      assertOpenFence(before, this.now(), input.generation);
    } catch (error) {
      await this.ledger.casWriter({
        artifactId,
        expectedStatus: "writing",
        nextStatus: "uncertain",
        expectedGeneration: input.generation,
      });
      throw error;
    }

    let receipt: ProofObjectReceipt;
    try {
      receipt = await this.objects.write({
        key: reservation.key,
        bytes: input.bytes,
        sha256: expectedSha256,
        byteSize: input.bytes.byteLength,
        deadlineMs: input.deadlineMs,
      });
    } catch (error) {
      await this.ledger.casWriter({
        artifactId,
        expectedStatus: "writing",
        nextStatus: "uncertain",
        expectedGeneration: input.generation,
      });
      if (error instanceof ProofTransferError || error instanceof ObjectStoreError) throw error;
      throw new ProofTransferError("write_uncertain", "Provider write did not confirm; the key is uncertain");
    }

    if (input.afterProviderWrite) await input.afterProviderWrite();

    const after = await this.ledger.loadRun(input.runId);
    if (!after) {
      await this.ledger.casWriter({
        artifactId,
        expectedStatus: "writing",
        nextStatus: "uncertain",
        expectedGeneration: input.generation,
        receipt,
      });
      return { status: "uncertain", receipt, artifactId, key: reservation.key };
    }
    try {
      assertOpenFence(after, this.now(), input.generation);
    } catch {
      await this.ledger.casWriter({
        artifactId,
        expectedStatus: "writing",
        nextStatus: "uncertain",
        expectedGeneration: input.generation,
        receipt,
      });
      return { status: "uncertain", receipt, artifactId, key: reservation.key };
    }

    const settled = await this.ledger.casWriter({
      artifactId,
      expectedStatus: "writing",
      nextStatus: "settled",
      expectedGeneration: input.generation,
      receipt,
    });
    if (!settled) {
      await this.ledger.casWriter({
        artifactId,
        expectedStatus: "writing",
        nextStatus: "uncertain",
        expectedGeneration: input.generation,
        receipt,
      });
      return { status: "uncertain", receipt, artifactId, key: reservation.key };
    }
    return { status: "settled", receipt, artifactId, key: reservation.key };
  }

  async cancel(input: { runId: string; tenantId: string; ownerUserId: string }): Promise<{ generation: number; writers: WriterRecord[] }> {
    const run = await this.ledger.loadRun(input.runId);
    if (!run || run.tenantId !== input.tenantId || run.ownerUserId !== input.ownerUserId) {
      throw new ProofTransferError("run_not_found", "Run fence is missing");
    }
    if (run.status === "deleted") return { generation: run.generation, writers: [] };
    const tombstone = await this.ledger.casRun({
      runId: input.runId,
      expectedGeneration: run.generation,
      status: "deleting",
      nextGeneration: run.generation + 1,
    });
    const writers = await this.ledger.listWriters(input.runId);
    for (const writer of writers) {
      if (writer.uploadId) {
        try {
          await this.objects.abortMultipart({ key: writer.key, uploadId: writer.uploadId });
        } catch {
          await this.ledger.casWriter({
            artifactId: writer.artifactId,
            expectedStatus: writer.writeStatus,
            nextStatus: "uncertain",
            expectedGeneration: writer.generation,
          });
        }
      }
      if (writer.writeStatus === "writing" || writer.writeStatus === "reserved") {
        await this.ledger.casWriter({
          artifactId: writer.artifactId,
          expectedStatus: writer.writeStatus,
          nextStatus: "uncertain",
          expectedGeneration: writer.generation,
        });
      }
    }
    return { generation: tombstone.generation, writers: await this.ledger.listWriters(input.runId) };
  }
}

export function createProofTransfer(input: {
  objects: ProofObjectStore;
  ledger: TransferLedger;
  now?: () => number;
}): ProofTransfer {
  return new ProofTransfer(input.objects, input.ledger, input.now);
}

export function createLocalProofTransfer(input: {
  objects: ProofObjectStore;
  ledger: TransferLedger;
  now?: () => number;
}): ProofTransfer {
  if ((input.objects as { encryption?: { appManagedEnvelope?: boolean } }).encryption?.appManagedEnvelope) {
    throw new ObjectStoreError("object_store_unconfigured", "legacy envelope encryption is not used for new-lane transfers");
  }
  return createProofTransfer(input);
}
