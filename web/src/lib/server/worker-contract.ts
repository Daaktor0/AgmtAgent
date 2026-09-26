import { validateObjectKey } from "./object-store.ts";

export const WORKER_MESSAGE_VERSION = "worker-v1" as const;
export const MAX_WORKER_MESSAGE_BYTES = 64 * 1024;
export const MAX_WORKER_ATTEMPTS = 3;

export class WorkerContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkerContractError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new WorkerContractError(code, message);
}

function text(value: unknown, field: string, maxLength = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    fail("invalid_worker_message", field + " is invalid");
  }
  return value.trim();
}

function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    fail("invalid_worker_message", "sourceSha256 must be a SHA-256 hex digest");
  }
  return value.toLowerCase();
}

function key(value: unknown): string {
  const normalized = text(value, "idempotencyKey", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) {
    fail("invalid_worker_message", "idempotencyKey is invalid");
  }
  return normalized;
}

export type IngestWorkerMessage = {
  version: typeof WORKER_MESSAGE_VERSION;
  jobId: string;
  tenantId: string;
  uploadIntentId: string;
  objectKey: string;
  sourceSha256: string;
  parserVersion: string;
  idempotencyKey: string;
  attempt: number;
  traceId: string;
};

export type IngestWorkerMessageInput = Omit<IngestWorkerMessage, "version">;

const messageFields = new Set([
  "version",
  "jobId",
  "tenantId",
  "uploadIntentId",
  "objectKey",
  "sourceSha256",
  "parserVersion",
  "idempotencyKey",
  "attempt",
  "traceId",
]);

export function validateIngestWorkerMessage(value: unknown): IngestWorkerMessage {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_worker_message", "Worker message must be an object");
  }
  const record = value as Record<string, unknown>;
  for (const field of Object.keys(record)) {
    if (!messageFields.has(field)) fail("invalid_worker_message", "Unknown worker message field: " + field);
  }
  if (record.version !== WORKER_MESSAGE_VERSION) {
    fail("invalid_worker_message", "Unsupported worker message version");
  }
  const attempt = record.attempt;
  if (!Number.isSafeInteger(attempt) || Number(attempt) < 1 || Number(attempt) > MAX_WORKER_ATTEMPTS) {
    fail("invalid_worker_message", "attempt must be within the bounded worker limit");
  }
  const message: IngestWorkerMessage = {
    version: WORKER_MESSAGE_VERSION,
    jobId: text(record.jobId, "jobId"),
    tenantId: text(record.tenantId, "tenantId"),
    uploadIntentId: text(record.uploadIntentId, "uploadIntentId"),
    objectKey: validateObjectKey(text(record.objectKey, "objectKey")),
    sourceSha256: digest(record.sourceSha256),
    parserVersion: text(record.parserVersion, "parserVersion", 128),
    idempotencyKey: key(record.idempotencyKey),
    attempt: Number(attempt),
    traceId: text(record.traceId, "traceId", 256),
  };
  let encoded: string;
  try {
    encoded = JSON.stringify(message);
  } catch {
    fail("invalid_worker_message", "Worker message cannot be serialized");
  }
  if (Buffer.byteLength(encoded, "utf8") > MAX_WORKER_MESSAGE_BYTES) {
    fail("worker_message_too_large", "Worker message exceeds the bounded message size");
  }
  return message;
}

export function buildIngestWorkerMessage(input: IngestWorkerMessageInput): IngestWorkerMessage {
  return validateIngestWorkerMessage({ version: WORKER_MESSAGE_VERSION, ...input });
}

export type WorkerExecutionOutcome =
  | "completed"
  | "duplicate"
  | "retryable_error"
  | "fatal"
  | "timeout"
  | "crash";

export type WorkerDisposition = {
  action: "ack" | "retry" | "dead_letter";
  jobStatus: "succeeded" | "queued" | "dead_letter";
  reasonCode: string;
};

export function dispositionForWorkerOutcome(input: {
  outcome: WorkerExecutionOutcome;
  attempt: number;
  maxAttempts?: number;
}): WorkerDisposition {
  const maxAttempts = input.maxAttempts ?? MAX_WORKER_ATTEMPTS;
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1 || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_WORKER_ATTEMPTS || input.attempt > maxAttempts) {
    fail("invalid_worker_attempt", "Worker attempt is outside the bounded retry policy");
  }
  if (input.outcome === "completed") return { action: "ack", jobStatus: "succeeded", reasonCode: "completed" };
  if (input.outcome === "duplicate") return { action: "ack", jobStatus: "succeeded", reasonCode: "duplicate" };
  if (input.outcome === "fatal") return { action: "dead_letter", jobStatus: "dead_letter", reasonCode: "worker_fatal" };
  const reasonCode = input.outcome === "timeout" ? "worker_timeout" : input.outcome === "crash" ? "worker_crash" : "worker_retryable_error";
  if (input.attempt < maxAttempts) return { action: "retry", jobStatus: "queued", reasonCode };
  return { action: "dead_letter", jobStatus: "dead_letter", reasonCode };
}