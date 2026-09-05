import { newId } from "../agmt/ids.ts";
import { executableProduct } from "../products/registry.ts";
import type { ProductId, RunDeadlines, RunStatus } from "../products/contracts.ts";
import { assertProofDeadlines, proofDeadlines } from "./retention.ts";
import { currentDatabaseContext } from "../db-context.server.ts";
import type { Sql } from "../db-transaction.ts";

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

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
  };
}

const selectColumns = "run_id as \"runId\", tenant_id as \"tenantId\", owner_user_id as \"ownerUserId\", product_id as \"productId\", retention_policy as \"retentionPolicy\", status, upload_started_at as \"uploadStartedAt\", retention_deadline as \"retentionDeadline\", access_deadline as \"accessDeadline\", processing_deadline as \"processingDeadline\", upload_grant_deadline as \"uploadGrantDeadline\", cancellation_generation as \"cancellationGeneration\", attempt_count as \"attemptCount\", parser_version as \"parserVersion\", rule_set_version as \"ruleSetVersion\", exporter_version as \"exporterVersion\", idempotency_key as \"idempotencyKey\", source_size as \"sourceSize\", source_sha256 as \"sourceSha256\", output_artifact_id as \"outputArtifactId\", correction_count as \"correctionCount\", comment_count as \"commentCount\", coverage_status as \"coverageStatus\", error_code as \"errorCode\", deleted_at as \"deletedAt\", deletion_verified_at as \"deletionVerifiedAt\"";

export async function createProductRun(sql: Sql, input: ProductRunInput, uploadStartedAt = Date.now()): Promise<ProductRunRow> {
  const valid = validateProductRunInput(input, uploadStartedAt);
  return sql.transaction(async (tx) => {
    const runId = newId();
    const d = valid.deadlines;
    const inserted = await tx.query<Record<string, unknown>>(
      `insert into product_run (run_id, tenant_id, owner_user_id, product_id, retention_policy, status, upload_started_at, retention_deadline, access_deadline, processing_deadline, upload_grant_deadline, parser_version, rule_set_version, exporter_version, idempotency_key, source_size, source_sha256)
       values ($1,$2,$3,$4,'temporary_2h','uploading',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (tenant_id, owner_user_id, product_id, idempotency_key) do nothing returning ${selectColumns}`,
      [runId, input.tenantId, input.ownerUserId, valid.productId, new Date(d.uploadStartedAt).toISOString(), new Date(d.retentionDeadline).toISOString(), new Date(d.accessDeadline).toISOString(), new Date(d.processingDeadline).toISOString(), new Date(d.uploadGrantDeadline).toISOString(), valid.parserVersion, valid.ruleSetVersion, valid.exporterVersion, valid.idempotencyKey, valid.sourceSize, valid.sourceSha256],
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
  uploading: ["scanning", "failed", "deleting"], scanning: ["queued", "rejected", "failed", "deleting"], queued: ["processing", "deleting"], processing: ["exporting", "queued", "failed", "deleting"], exporting: ["ready", "queued", "failed", "deleting"], ready: ["deleting"], rejected: ["deleting"], failed: ["deleting"], deleting: ["deleted"], deleted: [],
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
