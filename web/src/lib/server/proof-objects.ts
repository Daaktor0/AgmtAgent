/**
 * New-lane Proof object adapter (PWC-17).
 *
 * Dedicated quarantine/temporary keys, R2-managed encryption, no legacy
 * envelope or object_manifest content path. The historical ObjectStore in
 * object-store.ts remains for draining old runs.
 *
 * Provisioning, residency and live bucket verification are not performed here.
 */
import { createHash, randomBytes } from "node:crypto";
import { ObjectStoreError } from "./object-store.ts";

export const PROOF_OBJECT_SCHEMA_VERSION = "proof-object-v1";
export const PROOF_OBJECT_KEY_VERSION = "v2";
export const PROOF_OBJECT_ENCRYPTION = Object.freeze({
  transport: "tls",
  atRest: "r2_managed",
  appManagedEnvelope: false,
  customerManagedKey: false,
  historicalLane: "preserve_existing_envelope_keys",
} as const);

export const PROOF_OBJECT_KINDS = ["source", "marked_docx", "analysis"] as const;
export type ProofObjectKind = (typeof PROOF_OBJECT_KINDS)[number];
export type ProofBucketRole = "quarantine" | "temporary";

export type ProofObjectKeyParts = {
  version: typeof PROOF_OBJECT_KEY_VERSION;
  expiryMinute: string;
  runToken: string;
  generation: number;
  attempt: number;
  kind: ProofObjectKind;
  objectId: string;
};

export type ProofObjectMetadata = {
  schemaVersion: typeof PROOF_OBJECT_SCHEMA_VERSION;
  deadlineMs: string;
  sha256: string;
  byteSize: string;
  generation: string;
  attempt: string;
  kind: ProofObjectKind;
};

export type ProofObjectReceipt = {
  provider: "r2";
  bucketRole: ProofBucketRole;
  key: string;
  sha256: string;
  byteSize: number;
  etag: string | null;
  encryption: typeof PROOF_OBJECT_ENCRYPTION;
};

export type ProofObjectReservation = {
  key: string;
  bucketRole: ProofBucketRole;
  uploadId: string | null;
};

export type ProofR2ListPage = {
  keys: string[];
  cursor: string | null;
};

export interface ProofR2Bucket {
  head(key: string): Promise<{
    size: number;
    etag: string | null;
    customMetadata: Readonly<Record<string, string>>;
  } | null>;
  put(
    key: string,
    body: Uint8Array,
    options: {
      httpMetadata?: { contentType?: string | null };
      customMetadata: Readonly<Record<string, string>>;
    },
  ): Promise<{ etag: string | null }>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  list(input: { prefix: string; cursor?: string; limit: number }): Promise<ProofR2ListPage>;
  createMultipartUpload(key: string): Promise<{ uploadId: string }>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
}

const KEY_RE =
  /^proof\/v2\/(\d{8}T\d{4})\/([0-9a-f]{32})\/(\d+)\/(\d+)\/(source|marked_docx|analysis)-([0-9a-f]{32})$/;

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function randomHex16(): string {
  return randomBytes(16).toString("hex");
}

export function expiryMinuteUtc(deadlineMs: number): string {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 0) {
    throw new ObjectStoreError("invalid_object_request", "deadlineMs must be a non-negative integer");
  }
  const date = new Date(deadlineMs);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}`;
}

export function formatProofObjectKey(parts: ProofObjectKeyParts): string {
  if (parts.version !== PROOF_OBJECT_KEY_VERSION) {
    throw new ObjectStoreError("invalid_object_key", "Proof object key version is not v2");
  }
  if (!/^\d{8}T\d{4}$/.test(parts.expiryMinute)) {
    throw new ObjectStoreError("invalid_object_key", "expiry minute is not a UTC YYYYMMDDTHHmm partition");
  }
  if (!/^[0-9a-f]{32}$/.test(parts.runToken) || !/^[0-9a-f]{32}$/.test(parts.objectId)) {
    throw new ObjectStoreError("invalid_object_key", "run token and object id must be 128-bit hex");
  }
  if (!Number.isSafeInteger(parts.generation) || parts.generation < 0) {
    throw new ObjectStoreError("invalid_object_key", "generation is invalid");
  }
  if (!Number.isSafeInteger(parts.attempt) || parts.attempt < 1) {
    throw new ObjectStoreError("invalid_object_key", "attempt is invalid");
  }
  if (!PROOF_OBJECT_KINDS.includes(parts.kind)) {
    throw new ObjectStoreError("invalid_object_key", "object kind is invalid");
  }
  return `proof/v2/${parts.expiryMinute}/${parts.runToken}/${parts.generation}/${parts.attempt}/${parts.kind}-${parts.objectId}`;
}

export function parseProofObjectKey(key: string): ProofObjectKeyParts {
  if (typeof key !== "string" || key.length > 512 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new ObjectStoreError("invalid_object_key", "object key contains invalid characters");
  }
  const match = KEY_RE.exec(key);
  if (!match) {
    throw new ObjectStoreError("invalid_object_key", "object key is not a proof/v2 opaque key");
  }
  return {
    version: PROOF_OBJECT_KEY_VERSION,
    expiryMinute: match[1],
    runToken: match[2],
    generation: Number(match[3]),
    attempt: Number(match[4]),
    kind: match[5] as ProofObjectKind,
    objectId: match[6],
  };
}

export function mintProofObjectKey(input: {
  deadlineMs: number;
  generation: number;
  attempt: number;
  kind: ProofObjectKind;
  runToken?: string;
}): ProofObjectKeyParts {
  return {
    version: PROOF_OBJECT_KEY_VERSION,
    expiryMinute: expiryMinuteUtc(input.deadlineMs),
    runToken: input.runToken ?? randomHex16(),
    generation: input.generation,
    attempt: input.attempt,
    kind: input.kind,
    objectId: randomHex16(),
  };
}

function bucketRoleFor(kind: ProofObjectKind): ProofBucketRole {
  return kind === "source" ? "quarantine" : "temporary";
}

function metadataFrom(input: {
  deadlineMs: number;
  sha256: string;
  byteSize: number;
  generation: number;
  attempt: number;
  kind: ProofObjectKind;
}): ProofObjectMetadata {
  return {
    schemaVersion: PROOF_OBJECT_SCHEMA_VERSION,
    deadlineMs: String(input.deadlineMs),
    sha256: input.sha256,
    byteSize: String(input.byteSize),
    generation: String(input.generation),
    attempt: String(input.attempt),
    kind: input.kind,
  };
}

function parseHeadMetadata(metadata: Readonly<Record<string, string>>, expectedSize: number | null): {
  sha256: string;
  byteSize: number;
  deadlineMs: number;
} {
  const sha256 = metadata.sha256?.toLowerCase();
  const byteSize = Number(metadata.byteSize ?? "");
  const deadlineMs = Number(metadata.deadlineMs ?? "");
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256) || !Number.isSafeInteger(byteSize) || byteSize < 0) {
    throw new ObjectStoreError("object_metadata_invalid", "R2 object metadata does not contain a valid Proof integrity receipt");
  }
  if (expectedSize != null && expectedSize !== byteSize) {
    throw new ObjectStoreError("object_integrity_mismatch", "R2 object size does not match the integrity receipt");
  }
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 0) {
    throw new ObjectStoreError("object_metadata_invalid", "R2 object metadata does not contain a valid deadline");
  }
  if (metadata.schemaVersion !== PROOF_OBJECT_SCHEMA_VERSION) {
    throw new ObjectStoreError("object_metadata_invalid", "R2 object schema version is not proof-object-v1");
  }
  return { sha256, byteSize, deadlineMs };
}

export type ProofObjectStoreOptions = {
  mode: "local-test" | "deployed";
  quarantine: ProofR2Bucket;
  temporary: ProofR2Bucket;
};

export class ProofObjectStore {
  readonly provider = "r2" as const;
  readonly encryption = PROOF_OBJECT_ENCRYPTION;
  private readonly mode: "local-test" | "deployed";
  private readonly buckets: Record<ProofBucketRole, ProofR2Bucket>;
  private readonly reserved = new Set<string>();

  constructor(options: ProofObjectStoreOptions) {
    if (!options.quarantine || !options.temporary) {
      throw new ObjectStoreError("object_store_unconfigured", "Proof quarantine and temporary buckets are required");
    }
    this.mode = options.mode;
    this.buckets = { quarantine: options.quarantine, temporary: options.temporary };
  }

  private bucket(role: ProofBucketRole): ProofR2Bucket {
    return this.buckets[role];
  }

  reserve(input: {
    deadlineMs: number;
    generation: number;
    attempt: number;
    kind: ProofObjectKind;
    runToken?: string;
  }): ProofObjectReservation {
    const parts = mintProofObjectKey(input);
    const key = formatProofObjectKey(parts);
    this.reserved.add(key);
    return { key, bucketRole: bucketRoleFor(input.kind), uploadId: null };
  }

  async write(input: {
    key: string;
    bytes: Uint8Array;
    sha256: string;
    byteSize: number;
    deadlineMs: number;
    contentType?: string | null;
  }): Promise<ProofObjectReceipt> {
    const parts = parseProofObjectKey(input.key);
    if (!this.reserved.has(input.key)) {
      throw new ObjectStoreError("object_not_reserved", "Proof object writes require a prior reservation");
    }
    const copy = Buffer.from(input.bytes);
    if (copy.byteLength !== input.byteSize || sha256Hex(copy) !== input.sha256.toLowerCase()) {
      throw new ObjectStoreError("object_integrity_mismatch", "object bytes do not match the supplied receipt");
    }
    const role = bucketRoleFor(parts.kind);
    const existing = await this.head({ key: input.key });
    if (existing) {
      if (existing.sha256 !== input.sha256.toLowerCase() || existing.byteSize !== input.byteSize) {
        throw new ObjectStoreError("object_key_reused", "immutable object key already has different bytes");
      }
      return existing;
    }
    const put = await this.bucket(role).put(input.key, copy, {
      httpMetadata: { contentType: input.contentType ?? "application/octet-stream" },
      customMetadata: metadataFrom({
        deadlineMs: input.deadlineMs,
        sha256: input.sha256.toLowerCase(),
        byteSize: input.byteSize,
        generation: parts.generation,
        attempt: parts.attempt,
        kind: parts.kind,
      }),
    });
    return {
      provider: "r2",
      bucketRole: role,
      key: input.key,
      sha256: input.sha256.toLowerCase(),
      byteSize: input.byteSize,
      etag: put.etag,
      encryption: PROOF_OBJECT_ENCRYPTION,
    };
  }

  async head(input: { key: string }): Promise<ProofObjectReceipt | null> {
    const parts = parseProofObjectKey(input.key);
    const role = bucketRoleFor(parts.kind);
    const object = await this.bucket(role).head(input.key);
    if (!object) return null;
    const meta = parseHeadMetadata(object.customMetadata, object.size);
    return {
      provider: "r2",
      bucketRole: role,
      key: input.key,
      sha256: meta.sha256,
      byteSize: meta.byteSize,
      etag: object.etag,
      encryption: PROOF_OBJECT_ENCRYPTION,
    };
  }

  async list(input: {
    bucketRole: ProofBucketRole;
    prefix: string;
    cursor?: string;
    limit?: number;
  }): Promise<ProofR2ListPage> {
    if (!input.prefix.startsWith("proof/v2/")) {
      throw new ObjectStoreError("invalid_object_key", "list prefix must stay inside proof/v2");
    }
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      throw new ObjectStoreError("invalid_object_request", "list limit is out of bounds");
    }
    return this.bucket(input.bucketRole).list({ prefix: input.prefix, cursor: input.cursor, limit });
  }

  async delete(input: { key: string }): Promise<void> {
    const parts = parseProofObjectKey(input.key);
    await this.bucket(bucketRoleFor(parts.kind)).delete(input.key);
  }

  async abortMultipart(input: { key: string; uploadId: string }): Promise<void> {
    const parts = parseProofObjectKey(input.key);
    if (!input.uploadId || input.uploadId.length > 256) {
      throw new ObjectStoreError("invalid_object_request", "multipart upload id is invalid");
    }
    await this.bucket(bucketRoleFor(parts.kind)).abortMultipartUpload(input.key, input.uploadId);
  }
}

export function createProofObjectStore(options: ProofObjectStoreOptions): ProofObjectStore {
  if (options.mode !== "local-test" && options.mode !== "deployed") {
    throw new ObjectStoreError("object_store_unconfigured", "Proof object store mode is invalid");
  }
  if (options.mode === "deployed" && (options.quarantine as { provider?: string }).provider === "memory") {
    throw new ObjectStoreError("object_store_unconfigured", "memory object store is not accepted in deployed mode");
  }
  return new ProofObjectStore(options);
}

/** In-memory bucket used only by local contract tests. Never a deployed provider. */
export class MemoryProofR2Bucket implements ProofR2Bucket {
  readonly provider = "memory" as const;
  private readonly objects = new Map<string, { body: Buffer; metadata: Record<string, string>; etag: string }>();
  private readonly uploads = new Map<string, string>();

  async head(key: string) {
    const value = this.objects.get(key);
    if (!value) return null;
    return { size: value.body.byteLength, etag: value.etag, customMetadata: value.metadata };
  }

  async put(
    key: string,
    body: Uint8Array,
    options: { customMetadata: Readonly<Record<string, string>> },
  ) {
    const stored = Buffer.from(body);
    const etag = `"${sha256Hex(stored).slice(0, 32)}"`;
    this.objects.set(key, { body: stored, metadata: { ...options.customMetadata }, etag });
    return { etag };
  }

  async get(key: string) {
    const value = this.objects.get(key);
    return value ? Buffer.from(value.body) : null;
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  async list(input: { prefix: string; cursor?: string; limit: number }): Promise<ProofR2ListPage> {
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(input.prefix)).sort();
    const start = input.cursor ? keys.findIndex((key) => key > input.cursor!) : 0;
    const from = start < 0 ? keys.length : input.cursor ? start : 0;
    const page = keys.slice(from, from + input.limit);
    const last = page[page.length - 1];
    const more = from + page.length < keys.length;
    return { keys: page, cursor: more && last ? last : null };
  }

  async createMultipartUpload(key: string) {
    const uploadId = randomHex16();
    this.uploads.set(uploadId, key);
    return { uploadId };
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    const existing = this.uploads.get(uploadId);
    if (existing && existing !== key) {
      throw new ObjectStoreError("invalid_object_request", "multipart upload id does not match key");
    }
    this.uploads.delete(uploadId);
  }
}
