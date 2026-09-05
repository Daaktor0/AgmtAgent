import { sha256Hex } from "../agmt/crypto.ts";
import { exportProofDocx } from "../agmt/export/docx.ts";
import { LAUNCH_RULE_SET_VERSION } from "../agmt/proof/registry.ts";
import { newId } from "../agmt/ids.ts";
import type { RunStatus } from "../products/contracts.ts";
import { withDatabaseContext, currentDatabaseContext } from "../db-context.server.ts";
import { getSql, type Sql } from "../db.ts";
import { requireVerified } from "./account.ts";
import { deleteBlob, getBlob, markBlobClean, putBlob } from "./blobs.ts";
import { createProductRun, transitionProductRun, type ProductRunRow } from "./product-runs.ts";
import { scanProofDocx } from "./proof-scan.ts";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PARSER_VERSION = "proof-docx-v2";
const EXPORTER_VERSION = "proof-ooxml-v1";

export type ProofResponse = {
  runId: string;
  status: RunStatus;
  serverNow: number;
  correctionCount: number;
  commentCount: number;
  coverage: "complete" | "limited" | null;
  downloadUrl: string | null;
  errorCode: string | null;
};

function tenantId(): string {
  const value = currentDatabaseContext()?.tenantId;
  if (!value) throw new Error("tenant_context_unavailable");
  return value;
}

function response(run: ProductRunRow, serverNow = Date.now()): ProofResponse {
  return {
    runId: run.runId,
    status: run.status,
    serverNow,
    correctionCount: run.correctionCount,
    commentCount: run.commentCount,
    coverage: run.coverageStatus,
    downloadUrl: run.status === "ready" ? `/api/proof/download/${encodeURIComponent(run.runId)}` : null,
    errorCode: run.errorCode,
  };
}

async function setRunError(sql: Sql, run: ProductRunRow, errorCode: string, rejected: boolean): Promise<ProductRunRow> {
  const next = rejected ? "rejected" : "failed";
  const transitioned = await transitionProductRun(sql, {
    tenantId: run.tenantId,
    ownerUserId: run.ownerUserId,
    runId: run.runId,
    from: run.status,
    to: next,
    cancellationGeneration: run.cancellationGeneration,
  });
  const rows = await sql.query<Record<string, unknown>>(
    "update product_run set error_code = $1, updated_at = now() where tenant_id = $2 and run_id = $3 returning run_id as \"runId\", tenant_id as \"tenantId\", owner_user_id as \"ownerUserId\", product_id as \"productId\", retention_policy as \"retentionPolicy\", status, upload_started_at as \"uploadStartedAt\", retention_deadline as \"retentionDeadline\", access_deadline as \"accessDeadline\", processing_deadline as \"processingDeadline\", upload_grant_deadline as \"uploadGrantDeadline\", cancellation_generation as \"cancellationGeneration\", attempt_count as \"attemptCount\", parser_version as \"parserVersion\", rule_set_version as \"ruleSetVersion\", exporter_version as \"exporterVersion\", idempotency_key as \"idempotencyKey\", source_size as \"sourceSize\", source_sha256 as \"sourceSha256\", output_artifact_id as \"outputArtifactId\", correction_count as \"correctionCount\", comment_count as \"commentCount\", coverage_status as \"coverageStatus\", error_code as \"errorCode\", deleted_at as \"deletedAt\", deletion_verified_at as \"deletionVerifiedAt\"",
    [errorCode, run.tenantId, run.runId],
  );
  if (!rows[0]) return { ...transitioned, errorCode };
  // Re-hydration is intentionally delegated to the existing row contract.
  return { ...transitioned, errorCode };
}

async function recordArtifact(sql: Sql, input: { run: ProductRunRow; kind: "source" | "marked_docx"; objectKey: string; contentType: string; byteSize: number; sha256: string }): Promise<string> {
  const artifactId = newId();
  await sql.query(
    "insert into product_artifact (artifact_id, run_id, tenant_id, owner_user_id, kind, storage_key, state, content_type, byte_size, sha256, published_at) values ($1,$2,$3,$4,$5,$6,'published',$7,$8,$9,now())",
    [artifactId, input.run.runId, input.run.tenantId, input.run.ownerUserId, input.kind, input.objectKey, input.contentType, input.byteSize, input.sha256],
  );
  return artifactId;
}

async function markRunReady(sql: Sql, run: ProductRunRow, outputArtifactId: string, correctionCount: number, commentCount: number, coverage: "complete" | "limited"): Promise<ProductRunRow> {
  await sql.query(
    "update product_run set output_artifact_id = $1, correction_count = $2, comment_count = $3, coverage_status = $4, updated_at = now() where tenant_id = $5 and run_id = $6",
    [outputArtifactId, correctionCount, commentCount, coverage, run.tenantId, run.runId],
  );
  return transitionProductRun(sql, {
    tenantId: run.tenantId,
    ownerUserId: run.ownerUserId,
    runId: run.runId,
    from: "exporting",
    to: "ready",
    cancellationGeneration: run.cancellationGeneration,
  });
}

export async function uploadAndProcessProof(ownerUserId: string, bytes: Buffer, idempotencyKey: string, contentType = DOCX_TYPE): Promise<ProofResponse> {
  if (contentType !== DOCX_TYPE) throw new Error("unsupported_content_type");
  if (bytes.byteLength < 1 || bytes.byteLength > 25 * 1024 * 1024) throw new Error("source_too_large");
  const sql = await getSql();
  const run = await createProductRun(sql, {
    tenantId: tenantId(), ownerUserId, productId: "proof", idempotencyKey,
    parserVersion: PARSER_VERSION, ruleSetVersion: LAUNCH_RULE_SET_VERSION,
    exporterVersion: EXPORTER_VERSION, sourceSize: bytes.byteLength, sourceSha256: sha256Hex(bytes),
  });
  if (run.status !== "uploading") return response(run);

  let sourceObjectKey: string | null = null;
  let outputObjectKey: string | null = null;
  try {
    const scanning = run.status === "uploading"
      ? await transitionProductRun(sql, { tenantId: run.tenantId, ownerUserId, runId: run.runId, from: "uploading", to: "scanning", cancellationGeneration: run.cancellationGeneration })
      : run;
    await scanProofDocx(bytes);

    const source = await putBlob(ownerUserId, "proof-source", bytes);
    sourceObjectKey = source.objectKey;
    await withDatabaseContext({ userId: "agmt-proof-worker", tenantId: run.tenantId, runtimeRole: "worker" }, async () => {
      await markBlobClean(ownerUserId, source.objectKey);
    });
    await recordArtifact(sql, { run, kind: "source", objectKey: source.objectKey, contentType, byteSize: bytes.byteLength, sha256: source.sha256 });

    const processing = await withDatabaseContext({ userId: "agmt-proof-worker", tenantId: run.tenantId, runtimeRole: "worker" }, async () =>
      transitionProductRun(sql, { tenantId: run.tenantId, ownerUserId, runId: run.runId, from: scanning.status, to: "processing", cancellationGeneration: scanning.cancellationGeneration }),
    );
    if (Date.now() >= processing.deadlines.processingDeadline) throw new Error("processing_deadline_reached");
    const exported = await exportProofDocx(bytes);
    const exporting = await withDatabaseContext({ userId: "agmt-proof-worker", tenantId: run.tenantId, runtimeRole: "worker" }, async () =>
      transitionProductRun(sql, { tenantId: run.tenantId, ownerUserId, runId: run.runId, from: "processing", to: "exporting", cancellationGeneration: processing.cancellationGeneration }),
    );
    if (Date.now() >= exporting.deadlines.processingDeadline) throw new Error("processing_deadline_reached");
    const output = await putBlob(ownerUserId, "proof-marked-docx", exported.bytes);
    outputObjectKey = output.objectKey;
    await withDatabaseContext({ userId: "agmt-proof-worker", tenantId: run.tenantId, runtimeRole: "worker" }, async () => {
      await markBlobClean(ownerUserId, output.objectKey);
    });
    const outputArtifactId = await recordArtifact(sql, { run, kind: "marked_docx", objectKey: output.objectKey, contentType, byteSize: exported.bytes.byteLength, sha256: output.sha256 });
    const ready = await withDatabaseContext({ userId: "agmt-proof-worker", tenantId: run.tenantId, runtimeRole: "worker" }, async () =>
      markRunReady(sql, exporting, outputArtifactId, exported.receipt.plan.findings.filter((f) => f.kind === "correction").length, exported.receipt.plan.findings.filter((f) => f.kind === "comment").length + exported.receipt.plan.notices.length, exported.analysis.coverage as "complete" | "limited"),
    );
    return response(ready);
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 96) : "proof_failed";
    await withDatabaseContext({ userId: "agmt-proof-worker", tenantId: run.tenantId, runtimeRole: "worker" }, async () => {
      if (sourceObjectKey) await deleteBlob(ownerUserId, sourceObjectKey);
      if (outputObjectKey) await deleteBlob(ownerUserId, outputObjectKey);
      const current = await sql.query<{ status: RunStatus; cancellationGeneration: number }>("select status, cancellation_generation as \"cancellationGeneration\" from product_run where tenant_id = $1 and run_id = $2", [run.tenantId, run.runId]);
      const status = current[0]?.status;
      if (status && status !== "rejected" && status !== "failed" && status !== "deleted" && status !== "deleting") {
        await setRunError(sql, { ...run, status, cancellationGeneration: Number(current[0]?.cancellationGeneration ?? 0) } as ProductRunRow, code, status === "scanning");
      }
    });
    const failed = await sql.query<Record<string, unknown>>("select status, error_code as \"errorCode\" from product_run where tenant_id = $1 and run_id = $2", [run.tenantId, run.runId]);
    return { ...response(run), status: (failed[0]?.status as RunStatus) ?? "failed", errorCode: String(failed[0]?.errorCode ?? code) };
  }
}

export async function authenticatedProofUpload(ownerUserId: string, bytes: Buffer, idempotencyKey: string, contentType?: string): Promise<ProofResponse> {
  await requireVerified(ownerUserId);
  return uploadAndProcessProof(ownerUserId, bytes, idempotencyKey, contentType);
}

export async function proofDownload(ownerUserId: string, runId: string): Promise<Buffer> {
  const sql = await getSql();
  const rows = await sql.query<{ objectKey: string; contentType: string }>(
    "select a.storage_key as \"objectKey\", a.content_type as \"contentType\" from product_artifact a join product_run r on r.run_id = a.run_id and r.tenant_id = a.tenant_id where a.tenant_id = $1 and a.owner_user_id = $2 and a.run_id = $3 and a.kind = 'marked_docx' and a.state = 'published' and r.status = 'ready' and r.access_deadline > now()",
    [tenantId(), ownerUserId, runId],
  );
  if (!rows[0]) throw new Error("proof_not_available");
  const bytes = await getBlob(ownerUserId, rows[0].objectKey);
  if (!bytes) throw new Error("proof_object_missing");
  return bytes;
}

export async function deleteProofRun(ownerUserId: string, runId: string): Promise<void> {
  const sql = await getSql();
  const rows = await sql.query<{ status: RunStatus; cancellationGeneration: number }>("select status, cancellation_generation as \"cancellationGeneration\" from product_run where tenant_id = $1 and owner_user_id = $2 and run_id = $3", [tenantId(), ownerUserId, runId]);
  const row = rows[0];
  if (!row || row.status === "deleted") return;
  const run = { tenantId: tenantId(), ownerUserId, runId, status: row.status, cancellationGeneration: Number(row.cancellationGeneration) } as ProductRunRow;
  await transitionProductRun(sql, { ...run, from: row.status, to: "deleting" });
  const artifacts = await sql.query<{ objectKey: string }>("select storage_key as \"objectKey\" from product_artifact where tenant_id = $1 and owner_user_id = $2 and run_id = $3 and state <> 'deleted'", [run.tenantId, ownerUserId, runId]);
  for (const artifact of artifacts) await deleteBlob(ownerUserId, artifact.objectKey);
  await sql.query("update product_artifact set state = 'deleted', deleted_at = now() where tenant_id = $1 and owner_user_id = $2 and run_id = $3 and state <> 'deleted'", [run.tenantId, ownerUserId, runId]);
  const deleted = await transitionProductRun(sql, { ...run, from: "deleting", to: "deleted", cancellationGeneration: run.cancellationGeneration + 1 });
  await sql.query("update product_run set deletion_verified_at = now() where tenant_id = $1 and run_id = $2 and status = 'deleted'", [deleted.tenantId, deleted.runId]);
}

export async function purgeDueProofRuns(): Promise<number> {
  const sql = await getSql();
  const maintenance = { userId: "agmt-proof-purge", tenantId: "agmt-maintenance", runtimeRole: "worker" as const };
  const due = await withDatabaseContext(maintenance, async () => sql.query<{ runId: string; tenantId: string; ownerUserId: string }>("select run_id as \"runId\", tenant_id as \"tenantId\", owner_user_id as \"ownerUserId\" from agmt_private.list_due_product_runs($1)", [25]));
  let count = 0;
  for (const item of due) {
    await withDatabaseContext({ userId: "agmt-proof-purge", tenantId: item.tenantId, runtimeRole: "worker" }, async () => {
      await deleteProofRun(item.ownerUserId, item.runId);
    });
    count++;
  }
  return count;
}
