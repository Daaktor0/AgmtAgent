import { newId } from "../agmt/ids.ts";
import {
  currentDatabaseContext,
  type DatabaseRuntimeRole,
} from "../db-context.server.ts";
import type { Sql } from "../db-transaction.ts";

export type UploadIntentStatus =
  | "created"
  | "uploading"
  | "uploaded"
  | "scan_pending"
  | "clean"
  | "rejected"
  | "expired"
  | "aborted"
  | "consumed";

export type IngestJobStatus =
  | "queued"
  | "leased"
  | "succeeded"
  | "retryable_failed"
  | "dead_letter"
  | "cancelled";

export type OutboxStatus =
  | "pending"
  | "leased"
  | "published"
  | "failed"
  | "dead_letter";

export type JobPlaneKind = "upload_intent" | "ingest_job" | "job_outbox";

const transitions: Record<JobPlaneKind, Record<string, readonly string[]>> = {
  upload_intent: {
    created: ["uploading", "expired", "aborted"],
    uploading: ["uploaded", "expired", "aborted"],
    uploaded: ["scan_pending", "expired", "aborted"],
    scan_pending: ["clean", "rejected", "expired"],
    clean: ["consumed", "aborted"],
    rejected: [],
    expired: [],
    aborted: [],
    consumed: [],
  },
  ingest_job: {
    queued: ["leased", "cancelled"],
    leased: ["queued", "succeeded", "retryable_failed", "dead_letter", "cancelled"],
    retryable_failed: ["queued", "leased", "dead_letter", "cancelled"],
    succeeded: [],
    dead_letter: [],
    cancelled: [],
  },
  job_outbox: {
    pending: ["leased", "dead_letter"],
    leased: ["pending", "published", "failed", "dead_letter"],
    failed: ["pending", "leased", "dead_letter"],
    published: [],
    dead_letter: [],
  },
};

export class JobStateError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "JobStateError";
    this.code = code;
  }
}

export function canTransition(
  kind: JobPlaneKind,
  from: string,
  to: string,
): boolean {
  return transitions[kind]?.[from]?.includes(to) ?? false;
}

export function assertTransition(
  kind: JobPlaneKind,
  from: string,
  to: string,
): void {
  if (!canTransition(kind, from, to)) {
    throw new JobStateError(
      "invalid_state_transition",
      "Invalid " + kind + " transition: " + from + " -> " + to,
    );
  }
}

export function validateIdempotencyKey(value: string): string {
  if (typeof value !== "string") {
    throw new JobStateError("invalid_idempotency_key", "Idempotency key is required");
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new JobStateError("invalid_idempotency_key", "Idempotency key is required");
  }
  if (normalized.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) {
    throw new JobStateError(
      "invalid_idempotency_key",
      "Idempotency key must be an ASCII token of at most 128 characters",
    );
  }
  return normalized;
}

function validateDigest(value: string, field: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new JobStateError("invalid_job_request", field + " must be a SHA-256 hex digest");
  }
  return value.toLowerCase();
}

function validatePositiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new JobStateError("invalid_job_request", field + " must be a positive integer");
  }
  return value;
}

function validateTenantScope(
  tenantId: string,
  allowedRoles: readonly DatabaseRuntimeRole[],
  ownerUserId?: string,
): void {
  const context = currentDatabaseContext();
  if (
    !context ||
    !context.tenantId ||
    context.tenantId !== tenantId ||
    !allowedRoles.includes(context.runtimeRole)
  ) {
    throw new JobStateError(
      "database_context_required",
      "A matching server-derived tenant context is required",
    );
  }
  if (ownerUserId && context.runtimeRole === "app" && context.userId !== ownerUserId) {
    throw new JobStateError(
      "owner_context_mismatch",
      "The application user does not own this job-plane request",
    );
  }
}

function validateLeaseToken(value: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) {
    throw new JobStateError("invalid_lease_token", "A lease token is required");
  }
  return value;
}

export function isLeaseExpired(
  leaseExpiresAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!leaseExpiresAt) return true;
  const deadline = Date.parse(leaseExpiresAt);
  return !Number.isFinite(deadline) || deadline <= now;
}

export function leaseExpiryIso(seconds: number, now = Date.now()): string {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new JobStateError("invalid_lease", "Lease duration must be a positive integer");
  }
  if (seconds > 900) {
    throw new JobStateError("invalid_lease", "Lease duration exceeds the maximum lease");
  }
  if (!Number.isFinite(now)) {
    throw new JobStateError("invalid_lease", "Lease start time is invalid");
  }
  return new Date(now + seconds * 1000).toISOString();
}

type UploadIntentInput = {
  tenantId: string;
  ownerUserId: string;
  matterId: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  idempotencyKey: string;
  expiresAt: string;
};

type UploadIntentRow = {
  uploadIntentId: string;
  tenantId: string;
  ownerUserId: string;
  matterId: string;
  objectKey: string;
  status: UploadIntentStatus;
  idempotencyKey: string;
  expiresAt: string;
};

export async function createUploadIntent(
  sql: Sql,
  input: UploadIntentInput,
): Promise<UploadIntentRow> {
  validateTenantScope(input.tenantId, ["app"], input.ownerUserId);
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const sha256 = validateDigest(input.sha256, "sha256");
  const byteSize = validatePositiveInteger(input.byteSize, "byteSize");
  const expiresAt = new Date(input.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new JobStateError("invalid_job_request", "Upload intent expiry must be in the future");
  }

  const uploadIntentId = newId();
  const inserted = await sql.query<UploadIntentRow>(
    "insert into upload_intent (" +
      "upload_intent_id, tenant_id, owner_user_id, matter_id, object_key, " +
      "content_type, byte_size, sha256, idempotency_key, status, expires_at" +
      ") values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'created', $10) " +
      "on conflict (tenant_id, idempotency_key) do nothing " +
      "returning upload_intent_id as \"uploadIntentId\", tenant_id as \"tenantId\", " +
      "owner_user_id as \"ownerUserId\", matter_id as \"matterId\", object_key as \"objectKey\", " +
      "status, idempotency_key as \"idempotencyKey\", expires_at as \"expiresAt\"",
    [
      uploadIntentId,
      input.tenantId,
      input.ownerUserId,
      input.matterId,
      input.objectKey,
      input.contentType,
      byteSize,
      sha256,
      idempotencyKey,
      expiresAt.toISOString(),
    ],
  );
  if (inserted[0]) return inserted[0];

  const existing = await sql.query<UploadIntentRow>(
    "select upload_intent_id as \"uploadIntentId\", tenant_id as \"tenantId\", " +
      "owner_user_id as \"ownerUserId\", matter_id as \"matterId\", object_key as \"objectKey\", " +
      "status, idempotency_key as \"idempotencyKey\", expires_at as \"expiresAt\" " +
      "from upload_intent where tenant_id = $1 and idempotency_key = $2",
    [input.tenantId, idempotencyKey],
  );
  if (!existing[0]) {
    throw new JobStateError("idempotency_race", "Upload intent disappeared during idempotent creation");
  }
  if (
    existing[0].ownerUserId !== input.ownerUserId ||
    existing[0].matterId !== input.matterId ||
    existing[0].objectKey !== input.objectKey
  ) {
    throw new JobStateError(
      "idempotency_conflict",
      "Idempotency key is already bound to a different upload intent",
    );
  }
  return existing[0];
}

type IngestJobInput = {
  tenantId: string;
  ownerUserId: string;
  uploadIntentId: string;
  objectKey: string;
  sourceSha256: string;
  parserVersion: string;
  idempotencyKey: string;
};

type IngestJobRow = {
  jobId: string;
  tenantId: string;
  ownerUserId: string;
  uploadIntentId: string;
  objectKey: string;
  status: IngestJobStatus;
  idempotencyKey: string;
};

export async function enqueueIngestJob(
  sql: Sql,
  input: IngestJobInput,
): Promise<IngestJobRow> {
  validateTenantScope(input.tenantId, ["app", "worker"], input.ownerUserId);
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const sourceSha256 = validateDigest(input.sourceSha256, "sourceSha256");
  if (!input.parserVersion.trim()) {
    throw new JobStateError("invalid_job_request", "parserVersion is required");
  }

  return sql.transaction(async (transactionSql) => {
    const jobId = newId();
    const inserted = await transactionSql.query<IngestJobRow>(
      "insert into ingest_job (" +
        "job_id, tenant_id, owner_user_id, upload_intent_id, object_key, " +
        "source_sha256, parser_version, idempotency_key, status, available_at, attempt_count" +
        ") values ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', now(), 0) " +
        "on conflict (tenant_id, idempotency_key) do nothing " +
        "returning job_id as \"jobId\", tenant_id as \"tenantId\", owner_user_id as \"ownerUserId\", " +
        "upload_intent_id as \"uploadIntentId\", object_key as \"objectKey\", status, " +
        "idempotency_key as \"idempotencyKey\"",
      [
        jobId,
        input.tenantId,
        input.ownerUserId,
        input.uploadIntentId,
        input.objectKey,
        sourceSha256,
        input.parserVersion.trim(),
        idempotencyKey,
      ],
    );

    let job = inserted[0];
    if (!job) {
      const existing = await transactionSql.query<IngestJobRow>(
        "select job_id as \"jobId\", tenant_id as \"tenantId\", owner_user_id as \"ownerUserId\", " +
          "upload_intent_id as \"uploadIntentId\", object_key as \"objectKey\", status, " +
          "idempotency_key as \"idempotencyKey\" from ingest_job " +
          "where tenant_id = $1 and idempotency_key = $2",
        [input.tenantId, idempotencyKey],
      );
      job = existing[0];
      if (!job) {
        throw new JobStateError("idempotency_race", "Ingest job disappeared during idempotent creation");
      }
      if (
        job.ownerUserId !== input.ownerUserId ||
        job.uploadIntentId !== input.uploadIntentId ||
        job.objectKey !== input.objectKey
      ) {
        throw new JobStateError(
          "idempotency_conflict",
          "Idempotency key is already bound to a different ingest job",
        );
      }
    }

    await transactionSql.query(
      "insert into job_outbox (" +
        "outbox_id, tenant_id, created_by_user_id, aggregate_type, aggregate_id, " +
        "job_type, idempotency_key, payload" +
        ") values ($1, $2, $3, 'ingest_job', $4, 'ingest', $5, $6) " +
        "on conflict (tenant_id, job_type, idempotency_key) do nothing",
      [
        newId(),
        input.tenantId,
        input.ownerUserId,
        job.jobId,
        idempotencyKey,
        JSON.stringify({
          jobId: job.jobId,
          uploadIntentId: input.uploadIntentId,
          objectKey: input.objectKey,
          sourceSha256,
          parserVersion: input.parserVersion.trim(),
        }),
      ],
    );

    return job;
  });
}

export async function transitionUploadIntent(
  sql: Sql,
  input: {
    tenantId: string;
    uploadIntentId: string;
    from: UploadIntentStatus;
    to: UploadIntentStatus;
  },
): Promise<void> {
  validateTenantScope(input.tenantId, ["app", "worker"]);
  assertTransition("upload_intent", input.from, input.to);
  const rows = await sql.query(
    "update upload_intent set status = $1, updated_at = now() " +
      "where tenant_id = $2 and upload_intent_id = $3 and status = $4 " +
      "returning upload_intent_id",
    [input.to, input.tenantId, input.uploadIntentId, input.from],
  );
  if (!rows[0]) {
    throw new JobStateError(
      "state_conflict",
      "Upload intent state changed before the requested transition",
    );
  }
}

export async function leaseNextIngestJob(
  sql: Sql,
  input: {
    tenantId: string;
    workerId: string;
    leaseToken: string;
    leaseSeconds: number;
  },
): Promise<Record<string, unknown> | null> {
  validateTenantScope(input.tenantId, ["worker"]);
  const workerId = input.workerId.trim();
  if (!workerId) throw new JobStateError("invalid_worker", "workerId is required");
  const leaseToken = validateLeaseToken(input.leaseToken);
  const leaseSeconds = validatePositiveInteger(input.leaseSeconds, "leaseSeconds");
  if (leaseSeconds > 900) {
    throw new JobStateError("invalid_lease", "Lease duration exceeds the maximum lease");
  }

  const rows = await sql.query(
    "with candidate as (" +
      " select job_id from ingest_job" +
      " where tenant_id = $1" +
      "   and available_at <= now()" +
      "   and (status in ('queued', 'retryable_failed')" +
      "        or (status = 'leased' and lease_expires_at <= now()))" +
      " order by available_at, created_at" +
      " for update skip locked limit 1" +
      ")" +
      " update ingest_job as job" +
      " set status = 'leased', lease_token = $3, lease_owner = $4," +
      "     lease_expires_at = now() + ($2 * interval '1 second')," +
      "     attempt_count = attempt_count + 1, updated_at = now()" +
      " from candidate" +
      " where job.job_id = candidate.job_id and job.tenant_id = $1" +
      " returning job.*",
    [input.tenantId, leaseSeconds, leaseToken, workerId],
  );
  return rows[0] ?? null;
}

export async function finishIngestJob(
  sql: Sql,
  input: {
    tenantId: string;
    jobId: string;
    leaseToken: string;
    to: Extract<IngestJobStatus, "queued" | "succeeded" | "retryable_failed" | "dead_letter" | "cancelled">;
    errorCode?: string | null;
  },
): Promise<Record<string, unknown>> {
  validateTenantScope(input.tenantId, ["worker"]);
  const leaseToken = validateLeaseToken(input.leaseToken);
  assertTransition("ingest_job", "leased", input.to);
  const rows = await sql.query(
    "update ingest_job set status = $1, lease_token = null, lease_owner = null," +
      " lease_expires_at = null, last_error_code = $2, updated_at = now()," +
      " completed_at = case when $1 in ('succeeded', 'dead_letter', 'cancelled')" +
      " then now() else completed_at end," +
      " available_at = case when $1 = 'queued' then now() else available_at end" +
      " where tenant_id = $3 and job_id = $4 and status = 'leased' and lease_token = $5" +
      " returning *",
    [input.to, input.errorCode ?? null, input.tenantId, input.jobId, leaseToken],
  );
  if (!rows[0]) {
    throw new JobStateError("lease_lost", "Ingest job lease is no longer held by this worker");
  }
  return rows[0];
}
