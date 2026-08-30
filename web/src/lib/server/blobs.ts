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

export type PutBlobResult = {
  objectKey: string;
  sha256: string;
  envelope: Envelope;
};

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

  const sql = transactionSql ?? (await getSql());
  try {
    await sql.query(
      "insert into object_manifest (" +
        "object_key, tenant_id, owner_user_id, kind, storage_provider, storage_key, " +
        "state, content_type, sha256, ciphertext_sha256, byte_size, ciphertext_byte_size, " +
        "wrapped_data_key, cipher_metadata" +
        ") values ($1, $2, $3, $4, $5, $6, 'staged', $7, $8, $9, $10, $11, $12, $13)",
      [
        objectKey,
        tenantId,
        ownerUserId,
        kind.trim(),
        receipt.provider,
        receipt.storageKey,
        "application/octet-stream",
        sha256Hex(bytes),
        receipt.sha256,
        bytes.byteLength,
        receipt.byteSize,
        envelope.wrappedDataKey,
        JSON.stringify(envelope.cipherMetadata),
      ],
    );
  } catch (error) {
    try {
      await store.delete({ tenantId, objectKey });
    } catch {
      // The reconciler will detect a provider object without a relational manifest.
    }
    throw error;
  }

  return { objectKey, sha256: sha256Hex(bytes), envelope };
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
