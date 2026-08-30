import { FILE_BYTE_CAP } from "../agmt/config.ts";
import { newId } from "../agmt/ids.ts";
import { validateObjectKey, storageKeyFor } from "./object-store.ts";

export const SUPPORTED_DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const DIRECT_UPLOAD_TTL_SECONDS = 15 * 60;
export const DIRECT_UPLOAD_PART_SIZE = 5 * 1024 * 1024;
export const DIRECT_UPLOAD_MAX_PARTS = 10_000;

export class DirectUploadError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DirectUploadError";
    this.code = code;
  }
}

function invalid(code: string, message: string): never {
  throw new DirectUploadError(code, message);
}

function safeText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") invalid("invalid_upload_request", field + " is required");
  const normalized = value.trim();
  if (!normalized) invalid("invalid_upload_request", field + " is required");
  if (normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    invalid("invalid_upload_request", field + " contains invalid characters");
  }
  return normalized;
}

function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    invalid("invalid_upload_digest", "sha256 must be a SHA-256 hex digest");
  }
  return value.toLowerCase();
}

function idempotencyKey(value: unknown): string {
  const key = safeText(value, "idempotencyKey", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(key)) {
    invalid("invalid_idempotency_key", "Idempotency key must be an ASCII token");
  }
  return key;
}

function fileName(value: unknown): string {
  const name = safeText(value, "fileName", 255);
  if (name.includes("/") || name.includes("\\") || !/\.docx$/i.test(name)) {
    invalid("unsupported_file", "Only a native DOCX filename is accepted");
  }
  return name;
}

function positiveBytes(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > FILE_BYTE_CAP) {
    invalid("file_size_exceeded", "DOCX file size must be between 1 byte and 25 MiB");
  }
  return Number(value);
}

function expiry(value: string | null | undefined, now: number): string {
  const candidate = value ?? new Date(now + DIRECT_UPLOAD_TTL_SECONDS * 1000).toISOString();
  const timestamp = Date.parse(candidate);
  const latest = now + DIRECT_UPLOAD_TTL_SECONDS * 1000;
  if (!Number.isFinite(timestamp) || timestamp <= now || timestamp > latest) {
    invalid("invalid_upload_expiry", "Upload expiry must be within the server upload window");
  }
  return new Date(timestamp).toISOString();
}

export function partCountFor(byteSize: number): number {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > FILE_BYTE_CAP) {
    invalid("file_size_exceeded", "DOCX file size is outside the upload limit");
  }
  const count = Math.ceil(byteSize / DIRECT_UPLOAD_PART_SIZE);
  if (count > DIRECT_UPLOAD_MAX_PARTS) {
    invalid("multipart_limit_exceeded", "Multipart upload has too many parts");
  }
  return Math.max(1, count);
}

export function quarantineStorageKeyFor(tenantId: string, objectKey: string): string {
  return "quarantine/" + storageKeyFor(tenantId, validateObjectKey(objectKey));
}

export type DirectUploadRequest = {
  tenantId: string;
  ownerUserId: string;
  matterId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  idempotencyKey: string;
  expiresAt?: string | null;
};

export type DirectUploadPlan = {
  uploadIntentId: string;
  tenantId: string;
  ownerUserId: string;
  matterId: string;
  objectKey: string;
  quarantineStorageKey: string;
  fileName: string;
  contentType: typeof SUPPORTED_DOCX_MIME;
  byteSize: number;
  sha256: string;
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
  partSize: number;
  partCount: number;
};

export function createDirectUploadPlan(
  request: DirectUploadRequest,
  now = Date.now(),
): DirectUploadPlan {
  if (!Number.isFinite(now)) invalid("invalid_upload_request", "Upload clock is invalid");
  const tenantId = safeText(request.tenantId, "tenantId", 256);
  const ownerUserId = safeText(request.ownerUserId, "ownerUserId", 256);
  const matterId = safeText(request.matterId, "matterId", 256);
  const name = fileName(request.fileName);
  if (request.contentType !== SUPPORTED_DOCX_MIME) {
    invalid("unsupported_file", "Only the supported DOCX content type is accepted");
  }
  const byteSize = positiveBytes(request.byteSize);
  const sha256 = digest(request.sha256);
  const key = idempotencyKey(request.idempotencyKey);
  const createdAt = new Date(now).toISOString();
  const expiresAt = expiry(request.expiresAt, now);
  const objectKey = "obj_" + newId();
  return {
    uploadIntentId: newId(),
    tenantId,
    ownerUserId,
    matterId,
    objectKey,
    quarantineStorageKey: quarantineStorageKeyFor(tenantId, objectKey),
    fileName: name,
    contentType: SUPPORTED_DOCX_MIME,
    byteSize,
    sha256,
    idempotencyKey: key,
    createdAt,
    expiresAt,
    partSize: DIRECT_UPLOAD_PART_SIZE,
    partCount: partCountFor(byteSize),
  };
}

export function isDirectUploadExpired(plan: DirectUploadPlan, now = Date.now()): boolean {
  const timestamp = Date.parse(plan.expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= now;
}

export function assertUploadOwnership(
  plan: DirectUploadPlan,
  owner: { tenantId: string; ownerUserId: string; matterId: string },
): void {
  if (
    plan.tenantId !== owner.tenantId ||
    plan.ownerUserId !== owner.ownerUserId ||
    plan.matterId !== owner.matterId
  ) {
    invalid("upload_ownership_mismatch", "Upload does not belong to this tenant, user and Matter");
  }
}

export type MultipartUploadSession = {
  uploadId: string;
  expiresAt: string;
};

export type DirectUploadGrant = {
  uploadIntentId: string;
  objectKey: string;
  key: string;
  uploadId: string;
  expectedSha256: string;
  expectedByteSize: number;
  partSize: number;
  expiresAt: string;
  parts: Array<{ partNumber: number; url: string }>;
};

function uploadId(value: unknown): string {
  return safeText(value, "uploadId", 512);
}

export function buildDirectUploadGrant(
  plan: DirectUploadPlan,
  session: MultipartUploadSession,
  partUrls: readonly string[],
): DirectUploadGrant {
  const sessionExpiry = Date.parse(session.expiresAt);
  const planCreated = Date.parse(plan.createdAt);
  const planExpiry = Date.parse(plan.expiresAt);
  if (
    !Number.isFinite(sessionExpiry) ||
    sessionExpiry <= planCreated ||
    sessionExpiry > planExpiry
  ) {
    invalid("invalid_upload_expiry", "Multipart session cannot outlive the upload intent");
  }
  if (!Array.isArray(partUrls) || partUrls.length !== plan.partCount) {
    invalid("invalid_multipart_grant", "Multipart grant must contain one URL per bounded part");
  }
  const parts = partUrls.map((value, index) => {
    if (typeof value !== "string" || value.length > 4096) {
      invalid("invalid_multipart_grant", "Multipart URL is invalid");
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      invalid("invalid_multipart_grant", "Multipart URL is invalid");
    }
    if (parsed.protocol !== "https:") {
      invalid("invalid_multipart_grant", "Multipart URL must use HTTPS");
    }
    return { partNumber: index + 1, url: value };
  });
  return {
    uploadIntentId: plan.uploadIntentId,
    objectKey: plan.objectKey,
    key: plan.quarantineStorageKey,
    uploadId: uploadId(session.uploadId),
    expectedSha256: plan.sha256,
    expectedByteSize: plan.byteSize,
    partSize: plan.partSize,
    expiresAt: new Date(sessionExpiry).toISOString(),
    parts,
  };
}

export type CompletedUploadHead = {
  storageKey: string;
  sha256: string;
  byteSize: number;
};

export function validateCompletedUpload(
  plan: DirectUploadPlan,
  completed: CompletedUploadHead,
): void {
  if (completed.storageKey !== plan.quarantineStorageKey) {
    invalid("upload_prefix_mismatch", "Completed object is outside the quarantine prefix");
  }
  if (completed.sha256.toLowerCase() !== plan.sha256) {
    invalid("upload_hash_mismatch", "Completed object hash does not match the upload intent");
  }
  if (completed.byteSize !== plan.byteSize) {
    invalid("upload_size_mismatch", "Completed object size does not match the upload intent");
  }
}

export interface DirectUploadGateway {
  createMultipart(input: {
    key: string;
    contentType: string;
    expectedSha256: string;
    expectedByteSize: number;
    expiresAt: string;
    tags: Readonly<Record<string, string>>;
  }): Promise<MultipartUploadSession>;
  presignPart(input: {
    key: string;
    uploadId: string;
    partNumber: number;
    expiresAt: string;
  }): Promise<string>;
  completeMultipart(input: {
    key: string;
    uploadId: string;
    partCount: number;
  }): Promise<CompletedUploadHead>;
  abortMultipart(input: { key: string; uploadId: string }): Promise<void>;
  headObject(input: { key: string }): Promise<CompletedUploadHead | null>;
}