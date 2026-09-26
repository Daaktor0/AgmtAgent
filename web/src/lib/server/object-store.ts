import { sha256Hex } from "../agmt/crypto.ts";
import { runtimeBinding, serverEnv } from "../runtime-env.server.ts";

export type ObjectStoreProvider = "memory" | "s3" | "r2";

export type ObjectStorePutInput = {
  tenantId: string;
  objectKey: string;
  bytes: Uint8Array;
  sha256: string;
  byteSize: number;
  contentType?: string | null;
  metadata?: Readonly<Record<string, string>>;
};

export type ObjectStoreReceipt = {
  provider: ObjectStoreProvider;
  storageKey: string;
  sha256: string;
  byteSize: number;
};

export type ObjectStoreGetInput = {
  tenantId: string;
  objectKey: string;
  expectedSha256: string;
  expectedByteSize: number;
};

export type ObjectStoreDeleteInput = {
  tenantId: string;
  objectKey: string;
};

export interface ObjectStore {
  readonly provider: ObjectStoreProvider;
  put(input: ObjectStorePutInput): Promise<ObjectStoreReceipt>;
  get(input: ObjectStoreGetInput): Promise<Buffer | null>;
  delete(input: ObjectStoreDeleteInput): Promise<void>;
}

export type S3ObjectHead = {
  sha256: string;
  byteSize: number;
};

export interface S3ObjectClient {
  headObject(input: { key: string }): Promise<S3ObjectHead | null>;
  putObject(input: {
    key: string;
    body: Buffer;
    contentType: string | null;
    metadata: Readonly<Record<string, string>>;
  }): Promise<void>;
  getObject(input: { key: string }): Promise<Uint8Array | null>;
  deleteObject(input: { key: string }): Promise<void>;
}

export class ObjectStoreError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "ObjectStoreError";
    this.code = code;
  }
}

function nonEmptyText(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ObjectStoreError("invalid_object_request", field + " is required");
  }
  if (value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ObjectStoreError("invalid_object_request", field + " contains invalid characters");
  }
  return value;
}

export function validateObjectKey(value: string): string {
  const key = nonEmptyText(value, "objectKey");
  if (!/^obj_[0-9a-f-]{36}$/i.test(key)) {
    throw new ObjectStoreError("invalid_object_key", "objectKey is not an immutable Agmt object key");
  }
  return key;
}

function validateTenantId(value: string): string {
  return nonEmptyText(value, "tenantId");
}

function validateSha(value: string, field: string): string {
  const sha = nonEmptyText(value, field).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) {
    throw new ObjectStoreError("invalid_object_request", field + " must be a SHA-256 hex digest");
  }
  return sha;
}

function validateByteSize(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ObjectStoreError("invalid_object_request", field + " must be a non-negative integer");
  }
  return value;
}

function normalizedPut(input: ObjectStorePutInput): ObjectStorePutInput & { bytes: Buffer } {
  const tenantId = validateTenantId(input.tenantId);
  const objectKey = validateObjectKey(input.objectKey);
  const sha256 = validateSha(input.sha256, "sha256");
  const byteSize = validateByteSize(input.byteSize, "byteSize");
  const bytes = Buffer.from(input.bytes);
  if (bytes.byteLength !== byteSize || sha256Hex(bytes) !== sha256) {
    throw new ObjectStoreError("object_integrity_mismatch", "object bytes do not match the supplied manifest");
  }
  return {
    ...input,
    tenantId,
    objectKey,
    bytes,
    sha256,
    byteSize,
    contentType: input.contentType ?? null,
  };
}

function normalizedGet(input: ObjectStoreGetInput): ObjectStoreGetInput {
  return {
    tenantId: validateTenantId(input.tenantId),
    objectKey: validateObjectKey(input.objectKey),
    expectedSha256: validateSha(input.expectedSha256, "expectedSha256"),
    expectedByteSize: validateByteSize(input.expectedByteSize, "expectedByteSize"),
  };
}

export function storageKeyFor(tenantId: string, objectKey: string): string {
  const normalizedTenant = validateTenantId(tenantId);
  const normalizedObject = validateObjectKey(objectKey);
  return "tenants/" + sha256Hex(normalizedTenant).slice(0, 32) + "/objects/" + normalizedObject;
}

function verifyDownloadedBytes(
  bytes: Uint8Array,
  expectedSha256: string,
  expectedByteSize: number,
): Buffer {
  const copy = Buffer.from(bytes);
  if (copy.byteLength !== expectedByteSize || sha256Hex(copy) !== expectedSha256) {
    throw new ObjectStoreError(
      "object_integrity_mismatch",
      "downloaded object bytes do not match the relational manifest",
    );
  }
  return copy;
}

type MemoryRecord = {
  tenantId: string;
  objectKey: string;
  receipt: ObjectStoreReceipt;
  bytes: Buffer;
  deleted: boolean;
};

export class MemoryObjectStore implements ObjectStore {
  readonly provider = "memory" as const;
  private readonly records = new Map<string, MemoryRecord>();

  async put(input: ObjectStorePutInput): Promise<ObjectStoreReceipt> {
    const normalized = normalizedPut(input);
    const storageKey = storageKeyFor(normalized.tenantId, normalized.objectKey);
    const existing = this.records.get(storageKey);
    if (existing?.deleted) {
      throw new ObjectStoreError("object_key_reused", "deleted object keys cannot be reused");
    }
    if (existing) {
      if (
        existing.receipt.sha256 !== normalized.sha256 ||
        existing.receipt.byteSize !== normalized.byteSize
      ) {
        throw new ObjectStoreError("object_key_reused", "immutable object key already has different bytes");
      }
      return existing.receipt;
    }

    const receipt = {
      provider: this.provider,
      storageKey,
      sha256: normalized.sha256,
      byteSize: normalized.byteSize,
    } satisfies ObjectStoreReceipt;
    this.records.set(storageKey, {
      tenantId: normalized.tenantId,
      objectKey: normalized.objectKey,
      receipt,
      bytes: Buffer.from(normalized.bytes),
      deleted: false,
    });
    return receipt;
  }

  async get(input: ObjectStoreGetInput): Promise<Buffer | null> {
    const normalized = normalizedGet(input);
    const record = this.records.get(storageKeyFor(normalized.tenantId, normalized.objectKey));
    if (!record || record.deleted || record.tenantId !== normalized.tenantId) return null;
    return verifyDownloadedBytes(
      record.bytes,
      normalized.expectedSha256,
      normalized.expectedByteSize,
    );
  }

  async delete(input: ObjectStoreDeleteInput): Promise<void> {
    const tenantId = validateTenantId(input.tenantId);
    const objectKey = validateObjectKey(input.objectKey);
    const storageKey = storageKeyFor(tenantId, objectKey);
    const existing = this.records.get(storageKey);
    if (existing) {
      existing.deleted = true;
      existing.bytes = Buffer.alloc(0);
    }
  }
}

export class S3ObjectStore implements ObjectStore {
  readonly provider = "s3" as const;
  private readonly deletedKeys = new Set<string>();

  private readonly client: S3ObjectClient;

  constructor(client: S3ObjectClient) {
    this.client = client;
  }

  async put(input: ObjectStorePutInput): Promise<ObjectStoreReceipt> {
    const normalized = normalizedPut(input);
    const storageKey = storageKeyFor(normalized.tenantId, normalized.objectKey);
    if (this.deletedKeys.has(storageKey)) {
      throw new ObjectStoreError("object_key_reused", "deleted object keys cannot be reused");
    }
    const existing = await this.client.headObject({ key: storageKey });
    if (existing) {
      if (existing.sha256 !== normalized.sha256 || existing.byteSize !== normalized.byteSize) {
        throw new ObjectStoreError("object_key_reused", "immutable object key already has different bytes");
      }
      return {
        provider: this.provider,
        storageKey,
        sha256: existing.sha256,
        byteSize: existing.byteSize,
      };
    }

    const metadata = {
      ...(normalized.metadata ?? {}),
      agmt_sha256: normalized.sha256,
      agmt_byte_size: String(normalized.byteSize),
    };
    await this.client.putObject({
      key: storageKey,
      body: Buffer.from(normalized.bytes),
      contentType: normalized.contentType ?? null,
      metadata,
    });
    return {
      provider: this.provider,
      storageKey,
      sha256: normalized.sha256,
      byteSize: normalized.byteSize,
    };
  }

  async get(input: ObjectStoreGetInput): Promise<Buffer | null> {
    const normalized = normalizedGet(input);
    const storageKey = storageKeyFor(normalized.tenantId, normalized.objectKey);
    const bytes = await this.client.getObject({ key: storageKey });
    if (bytes === null) return null;
    return verifyDownloadedBytes(
      bytes,
      normalized.expectedSha256,
      normalized.expectedByteSize,
    );
  }

  async delete(input: ObjectStoreDeleteInput): Promise<void> {
    const tenantId = validateTenantId(input.tenantId);
    const objectKey = validateObjectKey(input.objectKey);
    const storageKey = storageKeyFor(tenantId, objectKey);
    await this.client.deleteObject({ key: storageKey });
    this.deletedKeys.add(storageKey);
  }
}

type R2ObjectLike = {
  arrayBuffer(): Promise<ArrayBuffer>;
  size?: number;
  customMetadata?: Readonly<Record<string, string>>;
};

type R2BucketLike = {
  head(key: string): Promise<R2ObjectLike | null>;
  get(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: Uint8Array, options?: {
    httpMetadata?: { contentType?: string | null };
    customMetadata?: Readonly<Record<string, string>>;
  }): Promise<unknown>;
  delete(key: string): Promise<void>;
};

/** Cloudflare R2 adapter. The bucket binding is resolved per request/method. */
export class R2ObjectStore implements ObjectStore {
  readonly provider = "r2" as const;
  private readonly deletedKeys = new Set<string>();

  private bucket(): R2BucketLike {
    const bucket = runtimeBinding<R2BucketLike>("AGMT_OBJECTS");
    if (!bucket || typeof bucket.put !== "function") {
      throw new ObjectStoreError(
        "object_store_unconfigured",
        "AGMT_OBJECTS R2 binding is not configured",
      );
    }
    return bucket;
  }

  private async head(storageKey: string): Promise<S3ObjectHead | null> {
    const object = await this.bucket().head(storageKey);
    if (!object) return null;
    const metadata = object.customMetadata ?? {};
    const sha256 = metadata.agmt_sha256;
    const byteSize = Number(metadata.agmt_byte_size ?? "");
    if (!sha256 || !/^[0-9a-f]{64}$/i.test(sha256) || !Number.isSafeInteger(byteSize)) {
      throw new ObjectStoreError(
        "object_metadata_invalid",
        "R2 object metadata does not contain a valid Agmt integrity manifest",
      );
    }
    return { sha256: sha256.toLowerCase(), byteSize };
  }

  async put(input: ObjectStorePutInput): Promise<ObjectStoreReceipt> {
    const normalized = normalizedPut(input);
    const storageKey = storageKeyFor(normalized.tenantId, normalized.objectKey);
    if (this.deletedKeys.has(storageKey)) {
      throw new ObjectStoreError("object_key_reused", "deleted object keys cannot be reused");
    }
    const existing = await this.head(storageKey);
    if (existing) {
      if (existing.sha256 !== normalized.sha256 || existing.byteSize !== normalized.byteSize) {
        throw new ObjectStoreError("object_key_reused", "immutable object key already has different bytes");
      }
      return { provider: this.provider, storageKey, sha256: existing.sha256, byteSize: existing.byteSize };
    }
    await this.bucket().put(storageKey, normalized.bytes, {
      httpMetadata: { contentType: normalized.contentType },
      customMetadata: {
        ...(normalized.metadata ?? {}),
        agmt_sha256: normalized.sha256,
        agmt_byte_size: String(normalized.byteSize),
      },
    });
    return { provider: this.provider, storageKey, sha256: normalized.sha256, byteSize: normalized.byteSize };
  }

  async get(input: ObjectStoreGetInput): Promise<Buffer | null> {
    const normalized = normalizedGet(input);
    const object = await this.bucket().get(storageKeyFor(normalized.tenantId, normalized.objectKey));
    if (!object) return null;
    return verifyDownloadedBytes(
      new Uint8Array(await object.arrayBuffer()),
      normalized.expectedSha256,
      normalized.expectedByteSize,
    );
  }

  async delete(input: ObjectStoreDeleteInput): Promise<void> {
    const tenantId = validateTenantId(input.tenantId);
    const objectKey = validateObjectKey(input.objectKey);
    const storageKey = storageKeyFor(tenantId, objectKey);
    await this.bucket().delete(storageKey);
    this.deletedKeys.add(storageKey);
  }
}

const globalRef = globalThis as typeof globalThis & {
  __agmtObjectStore__?: ObjectStore;
};

function deployedRuntime(): boolean {
  return Boolean(
    serverEnv("VERCEL") ||
      serverEnv("VERCEL_ENV") ||
      serverEnv("CF_PAGES") ||
      serverEnv("CLOUDFLARE_ENV"),
  );
}

/**
 * The memory provider is deliberately local-only. A deployed runtime must
 * have an explicitly wired R2 adapter; it must never silently place document
 * bytes in PostgreSQL or process-local memory.
 */
export function getObjectStore(): ObjectStore {
  if (globalRef.__agmtObjectStore__) return globalRef.__agmtObjectStore__;
  const configured = serverEnv("AGMT_OBJECT_STORE")?.toLowerCase();
  if (!deployedRuntime() && (!configured || configured === "memory")) {
    globalRef.__agmtObjectStore__ = new MemoryObjectStore();
    return globalRef.__agmtObjectStore__;
  }
  if (configured === "r2" || deployedRuntime()) {
    globalRef.__agmtObjectStore__ = new R2ObjectStore();
    return globalRef.__agmtObjectStore__;
  }
  throw new ObjectStoreError(
    "object_store_unconfigured",
    configured === "s3"
      ? "S3 object-store adapter is not wired in this runtime"
      : "Set AGMT_OBJECT_STORE=memory for local synthetic data or configure the AGMT_OBJECTS R2 binding before deploying",
  );
}

/** Install the provider during process bootstrap; never accept a client-selected provider. */
export function installObjectStore(store: ObjectStore): void {
  if (typeof window !== "undefined") {
    throw new ObjectStoreError("server_only", "object-store providers are server-only");
  }
  if (globalRef.__agmtObjectStore__ && globalRef.__agmtObjectStore__ !== store) {
    throw new ObjectStoreError("object_store_already_installed", "object-store provider is already installed");
  }
  globalRef.__agmtObjectStore__ = store;
}
