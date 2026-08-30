import assert from "node:assert/strict";
import test from "node:test";

import { withDatabaseContext } from "../db-context.server.ts";
import { createSql } from "../db-transaction.ts";
import { sha256Hex } from "../agmt/crypto.ts";
import {
  MemoryObjectStore,
  installObjectStore,
  storageKeyFor,
} from "./object-store.ts";
import {
  reconcileBlobAfterTransactionFailure,
  type BlobPublicationArtifact,
} from "./blobs.ts";

type StoredManifest = {
  objectKey: string;
  tenantId: string;
  ownerUserId: string;
  kind: string;
  contentType: string;
  storageProvider: string;
  storageKey: string;
  state: string;
  sha256: string;
  ciphertextSha256: string;
  byteSize: number;
  ciphertextByteSize: number;
  wrappedDataKey: string;
  cipherMetadata: string;
};

const store = new MemoryObjectStore();
installObjectStore(store);

function makeArtifact(
  suffix: string,
  objectKey = "obj_123e4567-e89b-12d3-a456-426614174000",
): { artifact: BlobPublicationArtifact; ciphertext: Buffer } {
  const plain = Buffer.from("plain-" + suffix, "utf8");
  const ciphertext = Buffer.from("ciphertext-" + suffix, "utf8");
  const tenantId = "tenant-1";

  return {
    ciphertext,
    artifact: {
      tenantId,
      ownerUserId: "user-1",
      kind: "original",
      objectKey,
      contentType: "application/octet-stream",
      storageProvider: "memory",
      storageKey: storageKeyFor(tenantId, objectKey),
      sha256: sha256Hex(plain),
      byteSize: plain.byteLength,
      ciphertextSha256: sha256Hex(ciphertext),
      ciphertextByteSize: ciphertext.byteLength,
      wrappedDataKey: "wrapped-data-key-" + suffix,
      cipherMetadata: {
        alg: "AES-256-GCM",
        iv: "a",
        tag: "b",
        v: 1,
      },
    },
  };
}

function manifestFromParams(params: unknown[]): StoredManifest {
  return {
    objectKey: String(params[0]),
    tenantId: String(params[1]),
    ownerUserId: String(params[2]),
    kind: String(params[3]),
    storageProvider: String(params[4]),
    storageKey: String(params[5]),
    state: "staged",
    contentType: String(params[6]),
    sha256: String(params[7]),
    ciphertextSha256: String(params[8]),
    byteSize: Number(params[9]),
    ciphertextByteSize: Number(params[10]),
    wrappedDataKey: String(params[11]),
    cipherMetadata: String(params[12]),
  };
}

function manifestSql(seed: StoredManifest | null = null): {
  sql: ReturnType<typeof createSql>;
  getManifest: () => StoredManifest | null;
} {
  let manifest = seed;

  const run = async <T = Record<string, unknown>>(
    text: string,
    params: unknown[],
  ): Promise<T[]> => {
    const query = text.toLowerCase();

    if (query.includes("insert into object_manifest")) {
      if (!manifest) manifest = manifestFromParams(params);
      return [];
    }

    if (query.includes("from object_manifest where object_key")) {
      return manifest ? [manifest as unknown as T] : [];
    }

    if (query.includes("update object_manifest set state = 'deleted'")) {
      if (
        !manifest ||
        manifest.objectKey !== String(params[0]) ||
        manifest.tenantId !== String(params[1]) ||
        manifest.ownerUserId !== String(params[2]) ||
        manifest.storageProvider !== String(params[3]) ||
        manifest.storageKey !== String(params[4]) ||
        manifest.sha256 !== String(params[5]) ||
        manifest.ciphertextSha256 !== String(params[6]) ||
        manifest.byteSize !== Number(params[7]) ||
        manifest.ciphertextByteSize !== Number(params[8]) ||
        manifest.state !== "staged"
      ) {
        return [];
      }
      manifest = { ...manifest, state: "deleted" };
      return [{ objectKey: manifest.objectKey } as unknown as T];
    }

    throw new Error("unexpected SQL in blob reconciliation test: " + text);
  };

  return {
    sql: createSql(
      async <T = Record<string, unknown>>(text, params) => run<T>(text, params),
      async () => {
        throw new Error("nested transaction is not expected in this test");
      },
    ),
    getManifest: () => manifest,
  };
}

async function putSyntheticObject(
  artifact: BlobPublicationArtifact,
  ciphertext: Buffer,
): Promise<void> {
  await store.put({
    tenantId: artifact.tenantId,
    objectKey: artifact.objectKey,
    bytes: ciphertext,
    sha256: artifact.ciphertextSha256,
    byteSize: artifact.ciphertextByteSize,
    contentType: artifact.contentType,
  });
}

test("confirmed rollback deletes the exact provider object and tombstones its staged manifest", async () => {
  const { artifact, ciphertext } = makeArtifact("rollback");
  await putSyntheticObject(artifact, ciphertext);
  const fake = manifestSql();

  const result = await withDatabaseContext(
    { userId: "user-1", tenantId: "tenant-1", runtimeRole: "app" },
    () =>
      reconcileBlobAfterTransactionFailure(fake.sql, artifact, {
        allowDeletion: true,
      }),
  );

  assert.deepEqual(result, { status: "deleted" });
  assert.equal(fake.getManifest()?.state, "deleted");
  assert.equal(
    await store.get({
      tenantId: artifact.tenantId,
      objectKey: artifact.objectKey,
      expectedSha256: artifact.ciphertextSha256,
      expectedByteSize: artifact.ciphertextByteSize,
    }),
    null,
  );
});

test("unknown outcome records a staged manifest and retains the provider object", async () => {
  const { artifact, ciphertext } = makeArtifact("unknown", "obj_223e4567-e89b-12d3-a456-426614174001");
  await putSyntheticObject(artifact, ciphertext);
  const fake = manifestSql();

  const result = await withDatabaseContext(
    { userId: "user-1", tenantId: "tenant-1", runtimeRole: "app" },
    () =>
      reconcileBlobAfterTransactionFailure(fake.sql, artifact, {
        allowDeletion: false,
      }),
  );

  assert.deepEqual(result, { status: "recorded" });
  assert.equal(fake.getManifest()?.state, "staged");
  assert.ok(
    await store.get({
      tenantId: artifact.tenantId,
      objectKey: artifact.objectKey,
      expectedSha256: artifact.ciphertextSha256,
      expectedByteSize: artifact.ciphertextByteSize,
    }),
  );
});

test("a mismatched manifest fails closed without deleting provider bytes", async () => {
  const { artifact, ciphertext } = makeArtifact("mismatch", "obj_323e4567-e89b-12d3-a456-426614174002");
  await putSyntheticObject(artifact, ciphertext);
  const mismatched = {
    ...artifact,
    ciphertextSha256: sha256Hex(Buffer.from("different-ciphertext", "utf8")),
  };
  const fake = manifestSql(manifestFromParams([
    mismatched.objectKey,
    mismatched.tenantId,
    mismatched.ownerUserId,
    mismatched.kind,
    mismatched.storageProvider,
    mismatched.storageKey,
    mismatched.contentType,
    mismatched.sha256,
    mismatched.ciphertextSha256,
    mismatched.byteSize,
    mismatched.ciphertextByteSize,
    mismatched.wrappedDataKey,
    JSON.stringify(mismatched.cipherMetadata),
  ]));

  const result = await withDatabaseContext(
    { userId: "user-1", tenantId: "tenant-1", runtimeRole: "app" },
    () =>
      reconcileBlobAfterTransactionFailure(fake.sql, artifact, {
        allowDeletion: true,
      }),
  );

  assert.equal(result.status, "unresolved");
  assert.ok(result.recordError instanceof Error);
  assert.ok(result.deleteError instanceof Error);
  assert.ok(
    await store.get({
      tenantId: artifact.tenantId,
      objectKey: artifact.objectKey,
      expectedSha256: artifact.ciphertextSha256,
      expectedByteSize: artifact.ciphertextByteSize,
    }),
  );
  assert.equal(fake.getManifest()?.state, "staged");
});
