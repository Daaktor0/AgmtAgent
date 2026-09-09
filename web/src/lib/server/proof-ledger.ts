/**
 * Transfer ledger implementations (PWC-18/19).
 *
 * Memory ledger is for tests. SQL ledger persists writers on product_artifact
 * without putting proof/v2 keys through the legacy ASCII-token helper.
 */
import { randomBytes } from "node:crypto";
import type { Sql } from "../db-transaction.ts";
import {
  ProofTransferError,
  type RunFence,
  type TransferLedger,
  type WriterRecord,
  type WriteStatus,
} from "./proof-transfer.ts";
import type { ProofObjectKind, ProofObjectReceipt } from "./proof-objects.ts";
import { PROOF_OBJECT_ENCRYPTION } from "./proof-objects.ts";

export class MemoryTransferLedger implements TransferLedger {
  run: RunFence | null;
  writers = new Map<string, WriterRecord>();

  constructor(run: RunFence | null = null) {
    this.run = run ? { ...run } : null;
  }

  async loadRun(runId: string) {
    return this.run?.runId === runId ? { ...this.run } : null;
  }

  async casRun(input: { runId: string; expectedGeneration: number; status?: RunFence["status"]; nextGeneration?: number }) {
    if (!this.run || this.run.runId !== input.runId || this.run.generation !== input.expectedGeneration) {
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
    expectedStatus: WriteStatus;
    nextStatus: WriteStatus;
    expectedGeneration: number;
    receipt?: ProofObjectReceipt | null;
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

function kindOf(value: string): ProofObjectKind {
  if (value === "source" || value === "marked_docx" || value === "analysis") return value;
  throw new ProofTransferError("invalid_writer", "Unsupported artifact kind");
}

function receiptFromRow(row: {
  storageKey: string;
  sha256: string;
  byteSize: number;
  etag: string | null;
  kind: string;
}): ProofObjectReceipt {
  return {
    provider: "r2",
    bucketRole: row.kind === "source" ? "quarantine" : "temporary",
    key: row.storageKey,
    sha256: row.sha256,
    byteSize: row.byteSize,
    etag: row.etag,
    encryption: PROOF_OBJECT_ENCRYPTION,
  };
}

export function createSqlTransferLedger(sql: Sql): TransferLedger {
  return {
    async loadRun(runId: string) {
      const rows = await sql.query<{
        runId: string;
        tenantId: string;
        ownerUserId: string;
        generation: number;
        status: RunFence["status"];
        processingDeadline: Date | string;
        accessDeadline: Date | string;
      }>(
        `select run_id as "runId", tenant_id as "tenantId", owner_user_id as "ownerUserId",
                cancellation_generation as generation, status,
                processing_deadline as "processingDeadline", access_deadline as "accessDeadline"
         from product_run where run_id = $1`,
        [runId],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        runId: row.runId,
        tenantId: row.tenantId,
        ownerUserId: row.ownerUserId,
        generation: Number(row.generation),
        status: row.status,
        processingDeadlineMs: new Date(row.processingDeadline).getTime(),
        accessDeadlineMs: new Date(row.accessDeadline).getTime(),
      };
    },

    async casRun(input) {
      const rows = await sql.query<{
        runId: string;
        tenantId: string;
        ownerUserId: string;
        generation: number;
        status: RunFence["status"];
        processingDeadline: Date | string;
        accessDeadline: Date | string;
      }>(
        `update product_run
         set status = coalesce($2, status),
             cancellation_generation = coalesce($3, cancellation_generation),
             deleted_at = case when $2 = 'deleted' then coalesce(deleted_at, now()) when $2 = 'deleting' then coalesce(deleted_at, now()) else deleted_at end,
             updated_at = now()
         where run_id = $1 and cancellation_generation = $4
         returning run_id as "runId", tenant_id as "tenantId", owner_user_id as "ownerUserId",
                   cancellation_generation as generation, status,
                   processing_deadline as "processingDeadline", access_deadline as "accessDeadline"`,
        [input.runId, input.status ?? null, input.nextGeneration ?? null, input.expectedGeneration],
      );
      const row = rows[0];
      if (!row) throw new ProofTransferError("stale_generation", "CAS generation mismatch");
      return {
        runId: row.runId,
        tenantId: row.tenantId,
        ownerUserId: row.ownerUserId,
        generation: Number(row.generation),
        status: row.status,
        processingDeadlineMs: new Date(row.processingDeadline).getTime(),
        accessDeadlineMs: new Date(row.accessDeadline).getTime(),
      };
    },

    async insertWriter(record) {
      await sql.query(
        `insert into product_artifact (
            artifact_id, run_id, tenant_id, owner_user_id, kind, storage_key, state,
            content_type, byte_size, sha256, attempt_id, generation, expected_size, write_status
         ) values ($1,$2,$3,$4,$5,$6,'staged',$7,$8,$9,$10,$11,$12,$13)
         on conflict (tenant_id, run_id, generation, attempt_id, kind) do nothing`,
        [
          record.artifactId || randomBytes(16).toString("hex"),
          record.runId,
          record.tenantId,
          record.ownerUserId,
          record.kind,
          record.key,
          record.kind === "source"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          record.expectedSize,
          record.expectedSha256,
          String(record.attempt),
          record.generation,
          record.expectedSize,
          record.writeStatus,
        ],
      );
    },

    async casWriter(input) {
      const rows = await sql.query<{ artifactId: string }>(
        `update product_artifact
         set write_status = $1,
             state = case when $1 = 'settled' and kind = 'marked_docx' then 'published' else state end,
             published_at = case when $1 = 'settled' then coalesce(published_at, now()) else published_at end,
             provider_etag = coalesce($2, provider_etag)
         where artifact_id = $3 and write_status = $4 and generation = $5
         returning artifact_id as "artifactId"`,
        [input.nextStatus, input.receipt?.etag ?? null, input.artifactId, input.expectedStatus, input.expectedGeneration],
      );
      return Boolean(rows[0]);
    },

    async listWriters(runId) {
      const rows = await sql.query<{
        artifactId: string;
        runId: string;
        tenantId: string;
        ownerUserId: string;
        generation: number;
        attemptId: string;
        kind: string;
        storageKey: string;
        writeStatus: WriteStatus;
        sha256: string;
        expectedSize: number;
        etag: string | null;
      }>(
        `select artifact_id as "artifactId", run_id as "runId", tenant_id as "tenantId", owner_user_id as "ownerUserId",
                generation, attempt_id as "attemptId", kind, storage_key as "storageKey", write_status as "writeStatus",
                sha256, coalesce(expected_size, byte_size) as "expectedSize", provider_etag as etag
         from product_artifact where run_id = $1 and state <> 'deleted'`,
        [runId],
      );
      return rows.map((row) => ({
        artifactId: row.artifactId,
        runId: row.runId,
        tenantId: row.tenantId,
        ownerUserId: row.ownerUserId,
        generation: Number(row.generation),
        attempt: Number(row.attemptId) || 0,
        kind: kindOf(row.kind),
        key: row.storageKey,
        writeStatus: row.writeStatus,
        expectedSha256: row.sha256,
        expectedSize: Number(row.expectedSize),
        deadlineMs: 0,
        uploadId: null,
        settledReceipt: row.writeStatus === "settled" ? receiptFromRow({
          storageKey: row.storageKey,
          sha256: row.sha256,
          byteSize: Number(row.expectedSize),
          etag: row.etag,
          kind: row.kind,
        }) : null,
      }));
    },

    async clearWriter(artifactId) {
      await sql.query(
        `update product_artifact set state = 'deleted', deleted_at = now() where artifact_id = $1 and state <> 'deleted'`,
        [artifactId],
      );
    },
  };
}
