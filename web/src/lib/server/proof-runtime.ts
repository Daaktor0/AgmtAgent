/**
 * Live Proof runtime wiring (PWC-19/22–28).
 *
 * Transfer uses the existing AGMT_OBJECTS bucket. Antivirus is ClamAV HTTP
 * when PROOF_SCAN_URL is an allowed endpoint. Missing, invalid, or Hostinger
 * VPS URLs stay unprovisioned (never clean). Documents are not sent there.
 */
import { withDatabaseContext } from "../db-context.server.ts";
import { serverEnv } from "../runtime-env.server.ts";
import type { Sql } from "../db-transaction.ts";
import {
  publishReadyProductRun,
  transitionProductRun,
  type ProductRunRow,
} from "./product-runs.ts";
import { liveProofObjectStore, liveProofR2Bucket } from "./proof-r2.ts";
import { createSqlTransferLedger } from "./proof-ledger.ts";
import { createProofTransfer, ProofTransferError, type ProofTransfer } from "./proof-transfer.ts";
import { resolveProofAntivirus, type ProofAntivirus } from "./proof-antivirus.ts";
import { executeProofDeletion, executeProofPipeline, PROOF_PIPELINE_VERSION } from "./proof-pipeline.ts";
import type { ProofSourceTransfer } from "./proof-http.ts";
import type { ProofObjectStore } from "./proof-objects.ts";
import { writeProofHealth } from "./proof-health.ts";
import { refreshProofBudget } from "./proof-budget.ts";

export type LiveProofRuntime = {
  objects: ProofObjectStore;
  transfer: ProofTransfer;
  antivirus: ProofAntivirus;
  sourceTransfer: ProofSourceTransfer;
};

export function liveProofAntivirus(): ProofAntivirus {
  return resolveProofAntivirus(serverEnv("PROOF_SCAN_URL"));
}

export function createLiveProofRuntime(sql: Sql): LiveProofRuntime | null {
  const objects = liveProofObjectStore();
  if (!objects) return null;
  const ledger = createSqlTransferLedger(sql);
  const transfer = createProofTransfer({ objects, ledger });
  const antivirus = liveProofAntivirus();
  const sourceTransfer: ProofSourceTransfer = {
    async putSource(input) {
      const existing = (await transfer.listWriters(input.run.runId)).find(
        (writer) => writer.kind === "source" && writer.writeStatus === "settled" && writer.expectedSha256 === input.sha256,
      );
      if (existing) return;
      const result = await transfer.putObject({
        runId: input.run.runId,
        tenantId: input.run.tenantId,
        ownerUserId: input.run.ownerUserId,
        generation: input.run.cancellationGeneration,
        attempt: Math.max(1, input.run.attemptCount),
        kind: "source",
        bytes: input.bytes,
        deadlineMs: input.run.deadlines.retentionDeadline,
      });
      if (result.status !== "settled") {
        throw new ProofTransferError("write_uncertain", "Source object write did not settle");
      }
      if (result.receipt && result.receipt.sha256 !== input.sha256) {
        throw new ProofTransferError("integrity_mismatch", "Source object hash does not match the declared digest");
      }
    },
  };
  return { objects, transfer, antivirus, sourceTransfer };
}

export async function dispatchOwnedProofPipeline(sql: Sql, run: ProductRunRow, runtime: LiveProofRuntime): Promise<ProductRunRow> {
  return withDatabaseContext({
    userId: run.ownerUserId,
    tenantId: run.tenantId,
    runtimeRole: "worker",
  }, async () => executeProofPipeline(run, {
    now: Date.now,
    objects: runtime.objects,
    transfer: runtime.transfer,
    antivirus: runtime.antivirus,
    transition: (current, to) => transitionProductRun(sql, {
      tenantId: current.tenantId,
      ownerUserId: current.ownerUserId,
      runId: current.runId,
      from: current.status,
      to,
      cancellationGeneration: current.cancellationGeneration,
    }),
    async recordScan(current, receipt) {
      await sql.query(
        "update product_run set scan_receipt = $1::jsonb, updated_at = now() where tenant_id = $2 and run_id = $3",
        [JSON.stringify(receipt), current.tenantId, current.runId],
      );
    },
    publish: (current, input) => publishReadyProductRun(sql, {
      tenantId: current.tenantId,
      ownerUserId: current.ownerUserId,
      runId: current.runId,
      cancellationGeneration: current.cancellationGeneration,
      correctionCount: input.correctionCount,
      commentCount: input.commentCount,
      noticeCount: input.noticeCount,
      coverageStatus: input.coverageStatus,
      coverageManifest: { pipeline: PROOF_PIPELINE_VERSION },
      outputArtifactId: input.outputArtifactId,
    }),
    async fail(current, code, rejected) {
      const next = await transitionProductRun(sql, {
        tenantId: current.tenantId,
        ownerUserId: current.ownerUserId,
        runId: current.runId,
        from: current.status,
        to: rejected ? "rejected" : "failed",
        cancellationGeneration: current.cancellationGeneration,
      });
      await sql.query(
        "update product_run set error_code = $1, updated_at = now() where tenant_id = $2 and run_id = $3",
        [code.slice(0, 96), current.tenantId, current.runId],
      );
      return { ...next, errorCode: code };
    },
  }));
}

export async function dispatchOwnedProofDeletion(sql: Sql, run: ProductRunRow, runtime: LiveProofRuntime): Promise<ProductRunRow> {
  return withDatabaseContext({
    userId: run.ownerUserId,
    tenantId: run.tenantId,
    runtimeRole: "worker",
  }, async () => executeProofDeletion({
    run,
    transfer: runtime.transfer,
    objects: runtime.objects,
    async markDeleted(current, verified) {
      if (!verified) return current;
      const deleted = await transitionProductRun(sql, {
        tenantId: current.tenantId,
        ownerUserId: current.ownerUserId,
        runId: current.runId,
        from: "deleting",
        to: "deleted",
        cancellationGeneration: current.cancellationGeneration,
      });
      await sql.query(
        "update product_run set deletion_verified_at = now() where tenant_id = $1 and run_id = $2 and status = 'deleted'",
        [deleted.tenantId, deleted.runId],
      );
      return { ...deleted, deletionVerifiedAt: Date.now() };
    },
  }));
}

export async function refreshLocalOperatorHealth(now = Date.now()): Promise<void> {
  const bucket = liveProofR2Bucket();
  if (!bucket) return;
  await writeProofHealth(bucket, "validator", now, "proof-reconstruct-v1");
  const antivirus = liveProofAntivirus();
  if (await antivirus.healthy(now)) {
    await writeProofHealth(bucket, "scanner", now, "proof-scan-receipt-v1");
  }
  await writeProofHealth(bucket, "purge", now, "proof-purge-v1");
  await refreshProofBudget(bucket, now);
}
