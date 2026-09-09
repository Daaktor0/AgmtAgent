import { newId } from "../agmt/ids.ts";
import { executableProduct } from "../products/registry.ts";
import type { ProductId, RunDeadlines, RunStatus } from "../products/contracts.ts";
import { assertProofDeadlines, proofDeadlines } from "./retention.ts";
import { currentDatabaseContext } from "../db-context.server.ts";
import type { Sql } from "../db-transaction.ts";

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const PRODUCT_RUN_MAX_ATTEMPTS = 3;
export const PRODUCT_RUN_OUTBOX_AGGREGATE = "product_run" as const;
const CONTENT_CANARY = /\b(filename|canonical_text|quote|bytes|tenantId)\b/;

export type ProductRunInput = {
  tenantId: string;
  ownerUserId: string;
  productId: ProductId;
  idempotencyKey: string;
  parserVersion: string;
  ruleSetVersion: string;
  exporterVersion: string;
  sourceSize?: number | null;
  sourceSha256?: string | null;
  profile?: "agreement" | "general" | null;
  language?: "en-GB" | "en-US" | null;
};

export type ProductRunRow = {
  runId: string;
  tenantId: string;
  ownerUserId: string;
  productId: "proof";
  retentionPolicy: "temporary_2h";
  status: RunStatus;
  deadlines: RunDeadlines;
  cancellationGeneration: number;
  attemptCount: number;
  parserVersion: string;
  ruleSetVersion: string;
  exporterVersion: string;
  idempotencyKey: string;
  sourceSize: number | null;
  sourceSha256: string | null;
  outputArtifactId: string | null;
  correctionCount: number;
  commentCount: number;
  coverageStatus: "complete" | "limited" | null;
  errorCode: string | null;
  deletedAt: number | null;
  deletionVerifiedAt: number | null;
  profile: "agreement" | "general" | null;
  language: "en-GB" | "en-US" | null;
  noticeCount: number;
  leaseToken: string | null;
};

export class ProductRunError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProductRunError";
    this.code = code;
  }
}

function requireTenantContext(tenantId: string, ownerUserId: string, roles: readonly ("app" | "worker")[] = ["app"]): void {
  const context = currentDatabaseContext();
  if (!context || !roles.includes(context.runtimeRole as "app" | "worker") || context.tenantId !== tenantId) {
    throw new ProductRunError("database_context_required", "A matching server-derived tenant context is required");
  }
  if (context.runtimeRole === "app" && context.userId !== ownerUserId) {
    throw new ProductRunError("owner_context_mismatch", "The application user does not own this run");
  }
}

function token(value: string, field: string): string {
  if (typeof value !== "string") throw new ProductRunError("invalid_run_request", `${field} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) {
    throw new ProductRunError("invalid_run_request", `${field} must be an ASCII token of at most 128 characters`);
  }
  return normalized;
}

function version(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 128) {
    throw new ProductRunError("invalid_run_request", `${field} is required`);
  }
  return value.trim();
}

export function validateProductRunInput(input: ProductRunInput, uploadStartedAt = Date.now()): {
  productId: "proof";
  idempotencyKey: string;
  parserVersion: string;
  ruleSetVersion: string;
  exporterVersion: string;
  sourceSize: number | null;
  sourceSha256: string | null;
  deadlines: RunDeadlines;
} {
  requireTenantContext(input.tenantId, input.ownerUserId);
  let productId: "proof";
  try {
    productId = executableProduct(input.productId);
  } catch {
    throw new ProductRunError("product_unavailable", "The requested product is not executable");
  }
  const idempotencyKey = token(input.idempotencyKey, "idempotencyKey");
  const parserVersion = version(input.parserVersion, "parserVersion");
  const ruleSetVersion = version(input.ruleSetVersion, "ruleSetVersion");
  const exporterVersion = version(input.exporterVersion, "exporterVersion");
  const sourceSize = input.sourceSize == null ? null : input.sourceSize;
  if (sourceSize !== null && (!Number.isSafeInteger(sourceSize) || sourceSize <= 0 || sourceSize > MAX_SOURCE_BYTES)) {
    throw new ProductRunError("invalid_run_request", "sourceSize exceeds the 25 MiB Proof limit");
  }
  const sourceSha256 = input.sourceSha256 == null ? null : input.sourceSha256.toLowerCase();
  if ((sourceSize === null) !== (sourceSha256 === null)) {
    throw new ProductRunError("invalid_run_request", "sourceSize and sourceSha256 must be supplied together");
  }
  if (sourceSha256 !== null && !/^[0-9a-f]{64}$/.test(sourceSha256)) {
    throw new ProductRunError("invalid_run_request", "sourceSha256 must be a SHA-256 hex digest");
  }
  let deadlines: RunDeadlines;
  try {
    deadlines = proofDeadlines(uploadStartedAt);
  } catch {
    throw new ProductRunError("invalid_run_request", "uploadStartedAt is invalid");
  }
  return { productId, idempotencyKey, parserVersion, ruleSetVersion, exporterVersion, sourceSize, sourceSha256, deadlines };
}

function millis(value: unknown, field: string): number {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new ProductRunError("invalid_run_row", `${field} is invalid`);
  return parsed;
}

function hydrate(row: Record<string, unknown>): ProductRunRow {
  const deadlines = {
    uploadStartedAt: millis(row.uploadStartedAt, "uploadStartedAt"),
    retentionDeadline: millis(row.retentionDeadline, "retentionDeadline"),
    accessDeadline: millis(row.accessDeadline, "accessDeadline"),
    processingDeadline: millis(row.processingDeadline, "processingDeadline"),
    uploadGrantDeadline: millis(row.uploadGrantDeadline, "uploadGrantDeadline"),
  } as RunDeadlines;
  assertProofDeadlines(deadlines);
  return {
    runId: String(row.runId), tenantId: String(row.tenantId), ownerUserId: String(row.ownerUserId),
    productId: "proof", retentionPolicy: "temporary_2h", status: row.status as RunStatus,
    deadlines, cancellationGeneration: Number(row.cancellationGeneration), attemptCount: Number(row.attemptCount),
    parserVersion: String(row.parserVersion), ruleSetVersion: String(row.ruleSetVersion), exporterVersion: String(row.exporterVersion),
    idempotencyKey: String(row.idempotencyKey), sourceSize: row.sourceSize == null ? null : Number(row.sourceSize),
    sourceSha256: row.sourceSha256 == null ? null : String(row.sourceSha256), outputArtifactId: row.outputArtifactId == null ? null : String(row.outputArtifactId),
    correctionCount: Number(row.correctionCount), commentCount: Number(row.commentCount),
    coverageStatus: row.coverageStatus == null ? null : row.coverageStatus as "complete" | "limited",
    errorCode: row.errorCode == null ? null : String(row.errorCode), deletedAt: row.deletedAt == null ? null : millis(row.deletedAt, "deletedAt"),
    deletionVerifiedAt: row.deletionVerifiedAt == null ? null : millis(row.deletionVerifiedAt, "deletionVerifiedAt"),
    profile: row.profile == null ? null : row.profile as "agreement" | "general",
    language: row.language == null ? null : row.language as "en-GB" | "en-US",
    noticeCount: row.noticeCount == null ? 0 : Number(row.noticeCount),
    leaseToken: row.leaseToken == null ? null : String(row.leaseToken),
  };
}

const selectColumns = "run_id as \"runId\", tenant_id as \"tenantId\", owner_user_id as \"ownerUserId\", product_id as \"productId\", retention_policy as \"retentionPolicy\", status, upload_started_at as \"uploadStartedAt\", retention_deadline as \"retentionDeadline\", access_deadline as \"accessDeadline\", processing_deadline as \"processingDeadline\", upload_grant_deadline as \"uploadGrantDeadline\", cancellation_generation as \"cancellationGeneration\", attempt_count as \"attemptCount\", parser_version as \"parserVersion\", rule_set_version as \"ruleSetVersion\", exporter_version as \"exporterVersion\", idempotency_key as \"idempotencyKey\", source_size as \"sourceSize\", source_sha256 as \"sourceSha256\", output_artifact_id as \"outputArtifactId\", correction_count as \"correctionCount\", comment_count as \"commentCount\", coverage_status as \"coverageStatus\", error_code as \"errorCode\", deleted_at as \"deletedAt\", deletion_verified_at as \"deletionVerifiedAt\", profile, language, notice_count as \"noticeCount\", lease_token as \"leaseToken\"";

export async function createProductRun(sql: Sql, input: ProductRunInput, uploadStartedAt = Date.now()): Promise<ProductRunRow> {
  const valid = validateProductRunInput(input, uploadStartedAt);
  return sql.transaction(async (tx) => {
    const runId = newId();
    const inserted = await tx.query<Record<string, unknown>>(
      `insert into product_run (run_id, tenant_id, owner_user_id, product_id, retention_policy, status, upload_started_at, retention_deadline, access_deadline, processing_deadline, upload_grant_deadline, authorised_at, parser_version, rule_set_version, exporter_version, idempotency_key, source_size, source_sha256, profile, language)
       values ($1,$2,$3,$4,'temporary_2h','uploading', now(), now() + interval '2 hours', now() + interval '2 hours' - interval '5 minutes', now() + interval '2 hours' - interval '10 minutes', least(now() + interval '15 minutes', now() + interval '2 hours' - interval '10 minutes'), now(), $5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (tenant_id, owner_user_id, product_id, idempotency_key) do nothing returning ${selectColumns}`,
      [runId, input.tenantId, input.ownerUserId, valid.productId, valid.parserVersion, valid.ruleSetVersion, valid.exporterVersion, valid.idempotencyKey, valid.sourceSize, valid.sourceSha256, input.profile ?? null, input.language ?? null],
    );
    if (inserted[0]) return hydrate(inserted[0]);
    const existing = await tx.query<Record<string, unknown>>(`select ${selectColumns} from product_run where tenant_id = $1 and owner_user_id = $2 and product_id = 'proof' and idempotency_key = $3`, [input.tenantId, input.ownerUserId, valid.idempotencyKey]);
    if (!existing[0]) throw new ProductRunError("idempotency_race", "Product run disappeared during idempotent creation");
    const row = hydrate(existing[0]);
    if (row.parserVersion !== valid.parserVersion || row.ruleSetVersion !== valid.ruleSetVersion || row.exporterVersion !== valid.exporterVersion || row.sourceSize !== valid.sourceSize || row.sourceSha256 !== valid.sourceSha256) {
      throw new ProductRunError("idempotency_conflict", "Idempotency key is bound to different Proof inputs");
    }
    return row;
  });
}

const transitions: Record<RunStatus, readonly RunStatus[]> = {
  uploading: ["scanning", "failed", "deleting"],
  scanning: ["queued", "rejected", "failed", "deleting"],
  queued: ["processing", "failed", "deleting"],
  processing: ["exporting", "queued", "failed", "deleting"],
  exporting: ["ready", "queued", "failed", "deleting"],
  ready: ["deleting"],
  rejected: ["deleting"],
  failed: ["scanning", "queued", "deleting"],
  deleting: ["deleting", "deleted"],
  deleted: [],
};

export function canTransitionProductRun(from: RunStatus, to: RunStatus): boolean { return transitions[from]?.includes(to) ?? false; }
export function assertProductRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransitionProductRun(from, to)) throw new ProductRunError("invalid_state_transition", `Invalid product run transition: ${from} -> ${to}`);
}

export async function transitionProductRun(sql: Sql, input: { tenantId: string; ownerUserId: string; runId: string; from: RunStatus; to: RunStatus; cancellationGeneration: number }): Promise<ProductRunRow> {
  requireTenantContext(input.tenantId, input.ownerUserId, ["app", "worker"]);
  assertProductRunTransition(input.from, input.to);
  if (!Number.isSafeInteger(input.cancellationGeneration) || input.cancellationGeneration < 0) throw new ProductRunError("invalid_generation", "Cancellation generation is invalid");
  return sql.transaction(async (tx) => {
    const rows = await tx.query<Record<string, unknown>>(`update product_run set status = $1, cancellation_generation = cancellation_generation + case when $1 = 'deleting' then 1 else 0 end, deleted_at = case when $1 = 'deleted' then now() else deleted_at end, updated_at = now() where run_id = $2 and tenant_id = $3 and owner_user_id = $4 and status = $5 and cancellation_generation = $6 returning ${selectColumns}`, [input.to, input.runId, input.tenantId, input.ownerUserId, input.from, input.cancellationGeneration]);
    if (!rows[0]) throw new ProductRunError("stale_run", "Product run state or cancellation generation is stale");
    return hydrate(rows[0]);
  });
}

export function retryDestination(input: {
  status: RunStatus;
  attemptCount: number;
  processingDeadline: number;
  now: number;
  hasCleanScanReceipt: boolean;
}): "scanning" | "queued" {
  if (input.status !== "failed") throw new ProductRunError("retry_ineligible", "Only a failed run can be retried");
  if (!Number.isSafeInteger(input.attemptCount) || input.attemptCount < 0 || input.attemptCount >= PRODUCT_RUN_MAX_ATTEMPTS) {
    throw new ProductRunError("retry_ineligible", "Retry attempt budget is exhausted");
  }
  if (!Number.isSafeInteger(input.now) || input.now >= input.processingDeadline) {
    throw new ProductRunError("retry_ineligible", "Original processing deadline has passed");
  }
  return input.hasCleanScanReceipt ? "queued" : "scanning";
}

export async function getOwnedProductRun(sql: Sql, input: {
  tenantId: string;
  ownerUserId: string;
  runId: string;
}): Promise<ProductRunRow | null> {
  requireTenantContext(input.tenantId, input.ownerUserId, ["app", "worker"]);
  const rows = await sql.query<Record<string, unknown>>(
    `select ${selectColumns} from product_run where tenant_id = $1 and owner_user_id = $2 and run_id = $3`,
    [input.tenantId, input.ownerUserId, input.runId],
  );
  return rows[0] ? hydrate(rows[0]) : null;
}

export async function listOwnedProductRuns(sql: Sql, input: {
  tenantId: string;
  ownerUserId: string;
  limit?: number;
}): Promise<ProductRunRow[]> {
  requireTenantContext(input.tenantId, input.ownerUserId, ["app", "worker"]);
  const limit = input.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new ProductRunError("invalid_run_request", "List limit must be between 1 and 20");
  }
  const rows = await sql.query<Record<string, unknown>>(
    `select ${selectColumns} from product_run where tenant_id = $1 and owner_user_id = $2 order by upload_started_at desc limit $3`,
    [input.tenantId, input.ownerUserId, limit],
  );
  return rows.map(hydrate);
}

export async function retryProductRun(sql: Sql, input: {
  tenantId: string;
  ownerUserId: string;
  runId: string;
  cancellationGeneration: number;
  hasCleanScanReceipt: boolean;
}): Promise<ProductRunRow> {
  requireTenantContext(input.tenantId, input.ownerUserId, ["app", "worker"]);
  return sql.transaction(async (tx) => {
    const current = await tx.query<Record<string, unknown>>(
      `select ${selectColumns} from product_run where run_id = $1 and tenant_id = $2 and owner_user_id = $3`,
      [input.runId, input.tenantId, input.ownerUserId],
    );
    if (!current[0]) throw new ProductRunError("stale_run", "Product run state or cancellation generation is stale");
    const row = hydrate(current[0]);
    if (row.cancellationGeneration !== input.cancellationGeneration) throw new ProductRunError("stale_run", "Product run state or cancellation generation is stale");
    const next = retryDestination({
      status: row.status,
      attemptCount: row.attemptCount,
      processingDeadline: row.deadlines.processingDeadline,
      now: Date.parse(String((await tx.query<{ now: string }>("select now() as now"))[0]?.now ?? "")) || Date.now(),
      hasCleanScanReceipt: input.hasCleanScanReceipt,
    });
    const updated = await tx.query<Record<string, unknown>>(
      `update product_run set status = $1, lease_token = null, lease_expires_at = null, retry_after = null, updated_at = now()
       where run_id = $2 and tenant_id = $3 and owner_user_id = $4 and status = 'failed' and cancellation_generation = $5
         and attempt_count < $6 and processing_deadline > now()
       returning ${selectColumns}`,
      [next, input.runId, input.tenantId, input.ownerUserId, input.cancellationGeneration, PRODUCT_RUN_MAX_ATTEMPTS],
    );
    if (!updated[0]) throw new ProductRunError("stale_run", "Product run state or cancellation generation is stale");
    const retried = hydrate(updated[0]);
    if (retried.deadlines.uploadStartedAt !== row.deadlines.uploadStartedAt
      || retried.deadlines.retentionDeadline !== row.deadlines.retentionDeadline
      || retried.deadlines.accessDeadline !== row.deadlines.accessDeadline
      || retried.deadlines.processingDeadline !== row.deadlines.processingDeadline) {
      throw new ProductRunError("deadline_mutated", "Retry must not change original deadlines");
    }
    return retried;
  });
}

export async function claimProductRunAttempt(sql: Sql, input: {
  tenantId: string;
  ownerUserId: string;
  runId: string;
  cancellationGeneration: number;
  leaseToken: string;
  leaseSeconds?: number;
}): Promise<ProductRunRow> {
  requireTenantContext(input.tenantId, input.ownerUserId, ["worker"]);
  const leaseSeconds = input.leaseSeconds ?? 30;
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds <= 0 || leaseSeconds > 900) {
    throw new ProductRunError("invalid_lease", "Lease duration is invalid");
  }
  const leaseToken = token(input.leaseToken, "leaseToken");
  return sql.transaction(async (tx) => {
    const rows = await tx.query<Record<string, unknown>>(
      `update product_run
       set status = 'processing',
           attempt_count = attempt_count + 1,
           lease_token = $1,
           lease_expires_at = now() + ($2::integer * interval '1 second'),
           last_heartbeat_at = now(),
           updated_at = now()
       where run_id = $3 and tenant_id = $4 and owner_user_id = $5
         and status = 'queued' and cancellation_generation = $6
         and attempt_count < $7 and processing_deadline > now()
       returning ${selectColumns}`,
      [leaseToken, leaseSeconds, input.runId, input.tenantId, input.ownerUserId, input.cancellationGeneration, PRODUCT_RUN_MAX_ATTEMPTS],
    );
    if (!rows[0]) throw new ProductRunError("stale_run", "Product run state or cancellation generation is stale");
    return hydrate(rows[0]);
  });
}

export async function publishReadyProductRun(sql: Sql, input: {
  tenantId: string;
  ownerUserId: string;
  runId: string;
  cancellationGeneration: number;
  correctionCount: number;
  commentCount: number;
  noticeCount: number;
  coverageStatus: "complete" | "limited";
  coverageManifest: Record<string, unknown> | null;
  outputArtifactId: string;
}): Promise<ProductRunRow> {
  requireTenantContext(input.tenantId, input.ownerUserId, ["app", "worker"]);
  if ([input.correctionCount, input.commentCount, input.noticeCount].some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new ProductRunError("invalid_ready_counts", "Ready counts must be non-negative integers");
  }
  if (input.coverageManifest && CONTENT_CANARY.test(JSON.stringify(input.coverageManifest))) {
    throw new ProductRunError("invalid_coverage_manifest", "Coverage manifest must not contain content fields");
  }
  return sql.transaction(async (tx) => {
    const rows = await tx.query<Record<string, unknown>>(
      `update product_run
       set status = 'ready',
           correction_count = $1,
           comment_count = $2,
           notice_count = $3,
           coverage_status = $4,
           coverage_manifest = $5::jsonb,
           output_artifact_id = $6,
           updated_at = now()
       where run_id = $7 and tenant_id = $8 and owner_user_id = $9
         and status = 'exporting' and cancellation_generation = $10
       returning ${selectColumns}`,
      [
        input.correctionCount,
        input.commentCount,
        input.noticeCount,
        input.coverageStatus,
        input.coverageManifest ? JSON.stringify(input.coverageManifest) : null,
        input.outputArtifactId,
        input.runId,
        input.tenantId,
        input.ownerUserId,
        input.cancellationGeneration,
      ],
    );
    if (!rows[0]) throw new ProductRunError("stale_run", "Product run state or cancellation generation is stale");
    return hydrate(rows[0]);
  });
}

export async function registerProductArtifact(sql: Sql, input: {
  tenantId: string;
  ownerUserId: string;
  runId: string;
  kind: "source" | "analysis" | "export_plan" | "marked_docx";
  storageKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  attemptId: string;
  expectedSize?: number | null;
}): Promise<{ artifactId: string }> {
  requireTenantContext(input.tenantId, input.ownerUserId, ["app", "worker"]);
  const storageKey = token(input.storageKey, "storageKey");
  const attemptId = token(input.attemptId, "attemptId");
  const sha256 = input.sha256.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new ProductRunError("invalid_artifact", "sha256 must be a SHA-256 hex digest");
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 0) throw new ProductRunError("invalid_artifact", "byteSize is invalid");
  const artifactId = newId();
  const rows = await sql.query<{ artifactId: string }>(
    `insert into product_artifact (
        artifact_id, run_id, tenant_id, owner_user_id, kind, storage_key, state,
        content_type, byte_size, sha256, attempt_id, generation, expected_size, write_status
     )
     select $1, run_id, tenant_id, owner_user_id, $2, $3, 'staged', $4, $5, $6, $7, cancellation_generation, $8, 'reserved'
     from product_run
     where run_id = $9 and tenant_id = $10 and owner_user_id = $11
     returning artifact_id as "artifactId"`,
    [
      artifactId,
      input.kind,
      storageKey,
      input.contentType,
      input.byteSize,
      sha256,
      attemptId,
      input.expectedSize ?? input.byteSize,
      input.runId,
      input.tenantId,
      input.ownerUserId,
    ],
  );
  if (!rows[0]) throw new ProductRunError("artifact_owner_mismatch", "Artifact must bind the run owner");
  return rows[0];
}

export async function enqueueProductRunOutbox(sql: Sql, input: {
  tenantId: string;
  ownerUserId: string;
  runId: string;
  jobType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  requireTenantContext(input.tenantId, input.ownerUserId, ["app", "worker"]);
  const jobType = token(input.jobType, "jobType");
  const idempotencyKey = token(input.idempotencyKey, "idempotencyKey");
  const encoded = JSON.stringify(input.payload);
  if (CONTENT_CANARY.test(encoded)) throw new ProductRunError("invalid_outbox_payload", "Outbox payload must not contain content fields");
  await sql.query(
    `insert into job_outbox (
        outbox_id, tenant_id, created_by_user_id, aggregate_type, aggregate_id,
        job_type, idempotency_key, payload
     ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     on conflict (tenant_id, job_type, idempotency_key) do nothing`,
    [newId(), input.tenantId, input.ownerUserId, PRODUCT_RUN_OUTBOX_AGGREGATE, input.runId, jobType, idempotencyKey, encoded],
  );
}
