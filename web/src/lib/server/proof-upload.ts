/**
 * Bounded Proof source upload (PWC-19).
 *
 * Create-run and source PUT contracts only. The Worker must not process the
 * document inside the upload request. The legacy whole-buffer POST remains
 * disabled. Live R2/multipart staging is still outstanding.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { PROOF_MAX_SOURCE_BYTES } from "../products/capabilities.ts";
import { ProofErrorResponseSchema, PROOF_API_VERSION, parseRunSummaryV2, type ProofErrorResponse, type RunSummaryV2 } from "../products/api-contracts.ts";

export const PROOF_UPLOAD_VERSION = "proof-upload-v1";
export const PROOF_UPLOAD_PART_BYTES = 8 * 1024 * 1024;
export const PROOF_UPLOAD_MAX_PARTS = 4;
export const PROOF_UPLOAD_TRANSFER_MS = 120_000;
export const PROOF_UPLOAD_IDLE_MS = 20_000;
export const PROOF_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const LEGACY_PROOF_UPLOAD_CODE = "upgrade_needed";

export const CreateProofRunRequestSchema = z.strictObject({
  sizeBytes: z.number().int().positive().max(PROOF_MAX_SOURCE_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  profile: z.enum(["agreement", "general"]),
  language: z.enum(["en-GB", "en-US"]),
});
export type CreateProofRunRequest = z.infer<typeof CreateProofRunRequestSchema>;

export class ProofUploadError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "ProofUploadError";
    this.code = code;
    this.status = status;
  }
}

export function parseCreateProofRunRequest(value: unknown): CreateProofRunRequest {
  const parsed = CreateProofRunRequestSchema.safeParse(value);
  if (!parsed.success) throw new ProofUploadError("invalid_upload_request", 400, "Create-run request is invalid");
  return parsed.data;
}

export function legacyProofUploadClosed(serverNow = Date.now()): { status: 410; body: ProofErrorResponse } {
  const body = ProofErrorResponseSchema.parse({
    error: {
      code: LEGACY_PROOF_UPLOAD_CODE,
      messageKey: LEGACY_PROOF_UPLOAD_CODE,
      retryable: false,
      supportId: "a1b2c3d4e5f60718",
    },
    serverNow,
  });
  return { status: 410, body };
}

export function assertSourceHeaders(input: {
  contentType: string | null;
  contentLength: string | null;
  declaredSize: number;
}): { contentLength: number } {
  const mime = (input.contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime !== PROOF_DOCX_MIME) {
    throw new ProofUploadError("unsupported_content_type", 415, "Only a native Word document can be uploaded");
  }
  if (input.contentLength == null || input.contentLength === "") {
    throw new ProofUploadError("invalid_upload_request", 400, "Content-Length is required");
  }
  const length = Number(input.contentLength);
  if (!Number.isSafeInteger(length) || length <= 0 || length > PROOF_MAX_SOURCE_BYTES) {
    throw new ProofUploadError("source_too_large", 413, "This file exceeds the 25 MiB limit");
  }
  if (length !== input.declaredSize) {
    throw new ProofUploadError("invalid_upload_request", 400, "Declared size does not match Content-Length");
  }
  return { contentLength: length };
}

export async function consumeProofSourceStream(input: {
  stream: AsyncIterable<Uint8Array>;
  expectedBytes: number;
  expectedSha256: string;
  now?: () => number;
  startedAt?: number;
  idleMs?: number;
  transferMs?: number;
}): Promise<{ bytes: Uint8Array; sha256: string; byteSize: number }> {
  const now = input.now ?? Date.now;
  const startedAt = input.startedAt ?? now();
  const idleMs = input.idleMs ?? PROOF_UPLOAD_IDLE_MS;
  const transferMs = input.transferMs ?? PROOF_UPLOAD_TRANSFER_MS;
  const chunks: Uint8Array[] = [];
  let size = 0;
  let last = startedAt;
  const digest = createHash("sha256");
  for await (const chunk of input.stream) {
    const t = now();
    if (t - startedAt > transferMs) throw new ProofUploadError("upload_timeout", 504, "The upload did not finish in time");
    if (t - last > idleMs) throw new ProofUploadError("upload_timeout", 504, "The upload was idle for too long");
    last = t;
    size += chunk.byteLength;
    if (size > input.expectedBytes || size > PROOF_MAX_SOURCE_BYTES) {
      throw new ProofUploadError("source_too_large", 413, "The upload exceeded the declared size");
    }
    chunks.push(chunk);
    digest.update(chunk);
  }
  if (size !== input.expectedBytes) {
    throw new ProofUploadError("invalid_upload_request", 400, "The upload ended before the declared size");
  }
  const sha256 = digest.digest("hex");
  if (sha256 !== input.expectedSha256.toLowerCase()) {
    throw new ProofUploadError("upload_hash_mismatch", 409, "The uploaded bytes do not match the declared digest");
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, sha256, byteSize: size };
}

export function sourcePutAccepted(summary: RunSummaryV2): { status: 202; summary: RunSummaryV2 } {
  const parsed = parseRunSummaryV2(summary);
  if (parsed.status !== "scanning" && parsed.status !== "uploading") {
    throw new ProofUploadError("invalid_proof_contract", 500, "Source PUT must not process the document");
  }
  return { status: 202, summary: parsed };
}

export function partCountFor(byteSize: number): number {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > PROOF_MAX_SOURCE_BYTES) {
    throw new ProofUploadError("source_too_large", 413, "DOCX file size is outside the upload limit");
  }
  const count = Math.ceil(byteSize / PROOF_UPLOAD_PART_BYTES);
  if (count > PROOF_UPLOAD_MAX_PARTS) {
    throw new ProofUploadError("source_too_large", 413, "The upload would exceed the sequential part limit");
  }
  return count;
}

void PROOF_API_VERSION;