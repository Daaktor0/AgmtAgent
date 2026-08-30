import { getSql, type Sql } from "../db.ts";
import { currentDatabaseContext } from "../db-context.server.ts";
import {
  decryptBytes,
  encryptBytes,
  sha256Hex,
  type Envelope,
} from "../agmt/crypto.ts";
import { newId } from "../agmt/ids.ts";
import {
  getObjectStore,
  ObjectStoreError,
} from "./object-store.ts";
import {
  reconcileExternalPublication,
  type ReconciliationResult,
} from "./object-reconciliation.ts";

function requireBlobScope(ownerUserId: string): { tenantId: string } {
  const context = currentDatabaseContext();
  if (
    !context?.tenantId ||
    (context.runtimeRole !== "app" && context.runtimeRole !== "worker") ||
    (context.runtimeRole === "app" && context.userId !== ownerUserId)
  ) {
    throw new ObjectStoreError(
      "database_context_required",
      "A matching server-derived tenant context is required for object access",
    );
  }
  return { tenantId: context.tenantId };
}

export type BlobPublicationArtifact = {
  tenantId: string;
  ownerUserId: string;
  kind: string;
  objectKey: string;
  contentType: string;
  storageProvider: "memory" | "s3";
  storageKey: string;
  sha256: string;
  byteSize: number;
  ciphertextSha256: string;
  ciphertextByteSize: number;
  wrappedDataKey: string;
  cipherMetadata: Envelope["cipherMetadata"];
};

export type PutBlobResult = {
  objectKey: string;
  sha256: string;
  envelope: Envelope;
  artifact: BlobPublicationArtifact;
};

export class BlobPublicationError extends ObjectStoreError {
  readonly artifact: BlobPublicationArtifact;
  readonly causeError: unknown;

  constructor(artifact: BlobPublicationArtifact, causeError: unknown) {
    super(
      "object_manifest_publication_failed",
      "The external object was written but its relational manifest could not be published",
    );
    this.name = "BlobPublicationError";
    this.artifact = artifact;
    this.causeError = causeError;
  }
}

export function blobPublicationArtifactFromError(
  error: unknown,
): BlobPublicationArtifact | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (current instanceof BlobPublicationError) return current.artifact;
    current = (current as { causeError?: unknown }).causeError;
  }
  return null;
}

export async function putBlob(
  ownerUserId: string,
  kind: string,
  bytes: Buffer,
  transactionSql?: Sql,
): Promise<PutBlobResult> {
  const { tenantId } = requireBlobScope(ownerUserId);
  if (!kind.trim()) {
    throw new ObjectStoreError("invalid_object_request", "Object kind is required");
  }
  if (!Buffer.isBuffer(bytes)) {
    throw new ObjectStoreError("invalid_object_request", "Object bytes must be a Buffer");
  }

  const envelope = encryptBytes(bytes);
  const objectKey = "obj_" + newId();
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const store = getObjectStore();
  const receipt = await store.put({
    tenantId,
    objectKey,
    bytes: ciphertext,
    sha256: sha256Hex(ciphertext),
    byteSize: ciphertext.byteLength,
    contentType: "application/octet-stream",
    metadata: { agmt_envelope: "agmt-envelope-v1" },
  });
  const artifact: BlobPublicationArtifact = {
    tenantId,
    ownerUserId,
    kind: kind.trim(),
    objectKey,
    contentType: "application/octet-stream",
    storageProvider: receipt.provider,
    storageKey: receipt.storageKey,
    sha256: sha256Hex(bytes),
    byteSize: bytes.byteLength,
    ciphertextSha256: receipt.sha256,
    ciphertextByteSize: receipt.byteSize,
    wrappedDataKey: envelope.wrappedDataKey,
    cipherMetadata: envelope.cipherMetadata,
  };

  const sql = transactionSql ?? (await getSql());
  try {
    await sql.query(
      "insert into object_manifest (" +
        "object_key, tenant_id, owner_user_id, kind, storage_provider, storage_key, " +
        "state, content_type, sha256, ciphertext_sha256, byte_size, ciphertext_byte_size, " +
        "wrapped_data_key, cipher_metadata" +
        ") values ($1, $2, $3, $4, $5, $6, 'staged', $7, $8, $9, $10, $11, $12, $13)",
      [
        artifact.objectKey,
        artifact.tenantId,
        artifact.ownerUserId,
        artifact.kind,
        artifact.storageProvider,
        artifact.storageKey,
        artifact.contentType,
        artifact.sha256,
        artifact.ciphertextSha256,
        artifact.byteSize,
        artifact.ciphertextByteSize,
        artifact.wrappedDataKey,
        JSON.stringify(artifact.cipherMetadata),
      ],
    );
  } catch (error) {
    throw new BlobPublicationError(artifact, error);
  }

  return {
    objectKey: artifact.objectKey,
    sha256: artifact.sha256,
    envelope,
    artifact,
  };
}


type BlobManifestRow = {
  tenantId: string;
  ownerUserId: string;
  kind: string;
  contentType: string;
  storageProvider: string;
  storageKey: string;
  state: string;
  sha256: string;
  ciphertextSha256: string;
  byteSize: number | string;
  ciphertextByteSize: number | string;
  wrappedDataKey: string;
  cipherMetadata: unknown;
};

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  };
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  return (
    "{" +
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item))
      .join(",") +
    "}"
  );
}

function manifestMatches(
  row: BlobManifestRow,
  artifact: BlobPublicationArtifact,
): boolean {
  let rowMetadata: unknown = row.cipherMetadata;
  if (typeof rowMetadata === "string") {
    try {
      rowMetadata = JSON.parse(rowMetadata);
    } catch {
      return false;
    }
  }
  return (
    row.tenantId === artifact.tenantId &&
    row.ownerUserId === artifact.ownerUserId &&
    row.kind === artifact.kind &&
    row.contentType === artifact.contentType &&
    row.storageProvider === artifact.storageProvider &&
    row.storageKey === artifact.storageKey &&
    row.sha256 === artifact.sha256 &&
    row.ciphertextSha256 === artifact.ciphertextSha256 &&
    Number(row.byteSize) === artifact.byteSize &&
    Number(row.ciphertextByteSize) === artifact.ciphertextByteSize &&
    row.wrappedDataKey === artifact.wrappedDataKey &&
    stableJson(rowMetadata) === stableJson(artifact.cipherMetadata)
  );
}

async function findBlobManifest(
  sql: Sql,
  objectKey: string,
): Promise<BlobManifestRow | null> {
  const rows = await sql.query<BlobManifestRow>(
    "select tenant_id as \"tenantId\", owner_user_id as \"ownerUserId\", kind, " +
      "content_type as \"contentType\", storage_provider as \"storageProvider\", " +
      "storage_key as \"storageKey\", state, sha256, " +
      "ciphertext_sha256 as \"ciphertextSha256\", byte_size as \"byteSize\", " +
      "ciphertext_byte_size as \"ciphertextByteSize\", " +
      "wrapped_data_key as \"wrappedDataKey\", cipher_metadata as \"cipherMetadata\" " +
      "from object_manifest where object_key = $1",
    [objectKey],
  );
  return rows[0] ?? null;
}

async function recordStagedBlobManifest(
  sql: Sql,
  artifact: BlobPublicationArtifact,
): Promise<void> {
  await sql.query(
    "insert into object_manifest (" +
      "object_key, tenant_id, owner_user_id, kind, storage_provider, storage_key, " +
      "state, content_type, sha256, ciphertext_sha256, byte_size, ciphertext_byte_size, " +
      "wrapped_data_key, cipher_metadata" +
      ") values ($1, $2, $3, $4, $5, $6, 'staged', $7, $8, $9, $10, $11, $12, $13) " +
      "on conflict (object_key) do nothing",
    [
      artifact.objectKey,
      artifact.tenantId,
      artifact.ownerUserId,
      artifact.kind,
      artifact.storageProvider,
      artifact.storageKey,
      artifact.contentType,
      artifact.sha256,
      artifact.ciphertextSha256,
      artifact.byteSize,
      artifact.ciphertextByteSize,
      artifact.wrappedDataKey,
      JSON.stringify(artifact.cipherMetadata),
    ],
  );

  const row = await findBlobManifest(sql, artifact.objectKey);
  if (!row || !manifestMatches(row, artifact) || row.state !== "staged") {
    throw new ObjectStoreError(
      "object_reconciliation_conflict",
      "The existing object manifest does not exactly match the failed publication",
    );
  }
}

async function deleteExactBlob(
  sql: Sql,
  artifact: BlobPublicationArtifact,
): Promise<void> {
  const existing = await findBlobManifest(sql, artifact.objectKey);
  if (existing && (!manifestMatches(existing, artifact) || existing.state !== "staged")) {
    throw new ObjectStoreError(
      "object_reconciliation_conflict",
      "Refusing to delete an object with an ambiguous manifest",
    );
  }

  const store = getObjectStore();
  if (store.provider !== artifact.storageProvider) {
    throw new ObjectStoreError(
      "object_provider_mismatch",
      "The configured object provider does not match the failed publication",
    );
  }

  const ciphertext = await store.get({
    tenantId: artifact.tenantId,
    objectKey: artifact.objectKey,
    expectedSha256: artifact.ciphertextSha256,
    expectedByteSize: artifact.ciphertextByteSize,
  });
  if (ciphertext !== null) {
    await store.delete({
      tenantId: artifact.tenantId,
      objectKey: artifact.objectKey,
    });
  }

  if (existing) {
    const updated = await sql.query(
      "update object_manifest set state = 'deleted', deleted_at = now() " +
        "where object_key = $1 and tenant_id = $2 and owner_user_id = $3 " +
        "and storage_provider = $4 and storage_key = $5 " +
        "and sha256 = $6 and ciphertext_sha256 = $7 " +
        "and byte_size = $8 and ciphertext_byte_size = $9 " +
        "and state = 'staged' returning object_key",
      [
        artifact.objectKey,
        artifact.tenantId,
        artifact.ownerUserId,
        artifact.storageProvider,
        artifact.storageKey,
        artifact.sha256,
        artifact.ciphertextSha256,
        artifact.byteSize,
        artifact.ciphertextByteSize,
      ],
    );
    if (!updated[0]) {
      throw new ObjectStoreError(
        "object_reconciliation_conflict",
        "The object manifest changed during reconciliation",
      );
    }
  }
}

export async function reconcileBlobAfterTransactionFailure(
  sql: Sql,
  artifact: BlobPublicationArtifact,
  options: { allowDeletion: boolean },
): Promise<ReconciliationResult> {
  const scope = requireBlobScope(artifact.ownerUserId);
  if (scope.tenantId !== artifact.tenantId) {
    throw new ObjectStoreError(
      "database_context_required",
      "The failed publication tenant does not match the database context",
    );
  }

  return reconcileExternalPublication({
    allowDeletion: options.allowDeletion,
    record: () => recordStagedBlobManifest(sql, artifact),
    deleteExact: () => deleteExactBlob(sql, artifact),
  });
}

export async function markBlobClean(
  ownerUserId: string,
  objectKey: string,
  transactionSql?: Sql,
): Promise<void> {
  const { tenantId } = requireBlobScope(ownerUserId);
  if (currentDatabaseContext()?.runtimeRole !== "worker") {
    throw new ObjectStoreError("worker_context_required", "Only the worker may release a scanned object");
  }
  const sql = transactionSql ?? (await getSql());
  const rows = await sql.query(
    "update object_manifest set state = 'clean', clean_at = now() " +
      "where tenant_id = $1 and object_key = $2 and state = 'staged' returning object_key",
    [tenantId, objectKey],
  );
  if (!rows[0]) {
    throw new ObjectStoreError("object_state_conflict", "Only a staged object can be marked clean");
  }
}

export async function deleteBlob(
  ownerUserId: string,
  objectKey: string,
  transactionSql?: Sql,
): Promise<void> {
  const { tenantId } = requireBlobScope(ownerUserId);
  const sql = transactionSql ?? (await getSql());
  const rows = await sql.query<{
    storageProvider: string;
    state: string;
  }>(
    "select storage_provider as \"storageProvider\", state from object_manifest " +
      "where tenant_id = $1 and object_key = $2 and owner_user_id = $3",
    [tenantId, objectKey, ownerUserId],
  );
  const manifest = rows[0];
  if (!manifest || manifest.state === "deleted") return;
  const store = getObjectStore();
  if (manifest.storageProvider !== store.provider) {
    throw new ObjectStoreError(
      "object_provider_mismatch",
      "The configured object provider does not match the manifest",
    );
  }
  await store.delete({ tenantId, objectKey });
  await sql.query(
    "update object_manifest set state = 'deleted', deleted_at = now() " +
      "where tenant_id = $1 and object_key = $2 and owner_user_id = $3 " +
      "and state <> 'deleted'",
    [tenantId, objectKey, ownerUserId],
  );
}

export async function getBlob(
  ownerUserId: string,
  objectKey: string,
): Promise<Buffer | null> {
  const { tenantId } = requireBlobScope(ownerUserId);
  const sql = await getSql();
  const rows = await sql.query<{
    storageProvider: string;
    state: string;
    sha256: string;
    ciphertextSha256: string;
    byteSize: number;
    ciphertextByteSize: number;
    wrappedDataKey: string;
    cipherMetadata: unknown;
  }>(
    "select storage_provider as \"storageProvider\", state, sha256, " +
      "ciphertext_sha256 as \"ciphertextSha256\", byte_size as \"byteSize\", " +
      "ciphertext_byte_size as \"ciphertextByteSize\", wrapped_data_key as \"wrappedDataKey\", " +
      "cipher_metadata as \"cipherMetadata\" from object_manifest " +
      "where tenant_id = $1 and object_key = $2 and owner_user_id = $3",
    [tenantId, objectKey, ownerUserId],
  );
  const manifest = rows[0];
  if (!manifest || manifest.state !== "clean") return null;

  const store = getObjectStore();
  if (manifest.storageProvider !== store.provider) {
    throw new ObjectStoreError(
      "object_provider_mismatch",
      "The configured object provider does not match the manifest",
    );
  }
  const ciphertext = await store.get({
    tenantId,
    objectKey,
    expectedSha256: manifest.ciphertextSha256,
    expectedByteSize: Number(manifest.ciphertextByteSize),
  });
  if (!ciphertext) {
    throw new ObjectStoreError("object_missing", "The object manifest has no provider object");
  }

  const cipherMetadata =
    typeof manifest.cipherMetadata === "string"
      ? JSON.parse(manifest.cipherMetadata)
      : manifest.cipherMetadata;
  const plain = decryptBytes({
    wrappedDataKey: manifest.wrappedDataKey,
    cipherMetadata: cipherMetadata as Envelope["cipherMetadata"],
    ciphertext: ciphertext.toString("base64"),
  });
  if (
    plain.byteLength !== Number(manifest.byteSize) ||
    sha256Hex(plain) !== manifest.sha256
  ) {
    throw new ObjectStoreError(
      "object_integrity_mismatch",
      "Decrypted bytes do not match the relational manifest",
    );
  }
  return plain;
}
