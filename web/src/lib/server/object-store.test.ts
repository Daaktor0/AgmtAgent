import assert from "node:assert/strict";
import test from "node:test";

import { sha256Hex } from "../agmt/crypto.ts";
import {
  MemoryObjectStore,
  ObjectStoreError,
  S3ObjectStore,
  storageKeyFor,
} from "./object-store.ts";

const objectKey = "obj_123e4567-e89b-12d3-a456-426614174000";
const tenantId = "tenant-one";
const otherTenantId = "tenant-two";

function request(overrides = {}) {
  const bytes = Buffer.from("synthetic object bytes", "utf8");
  return {
    tenantId,
    objectKey,
    bytes,
    sha256: sha256Hex(bytes),
    byteSize: bytes.byteLength,
    contentType: "application/octet-stream",
    ...overrides,
  };
}

test("memory object store round-trips exact bytes and verifies the manifest hash", async () => {
  const store = new MemoryObjectStore();
  const input = request();
  const receipt = await store.put(input);

  assert.equal(receipt.provider, "memory");
  assert.equal(receipt.sha256, input.sha256);
  assert.equal(receipt.byteSize, input.byteSize);
  assert.match(receipt.storageKey, /^tenants\/[0-9a-f]{32}\/objects\/obj_/);
  assert.doesNotMatch(receipt.storageKey, /tenant-one/);

  const result = await store.get({
    tenantId,
    objectKey,
    expectedSha256: input.sha256,
    expectedByteSize: input.byteSize,
  });
  assert.ok(result);
  assert.deepEqual(result, input.bytes);

  input.bytes[0] = 0;
  const secondRead = await store.get({
    tenantId,
    objectKey,
    expectedSha256: input.sha256,
    expectedByteSize: input.byteSize,
  });
  assert.ok(secondRead);
  assert.equal(secondRead.toString("utf8"), "synthetic object bytes");
});

test("object keys are immutable and exact retries are idempotent", async () => {
  const store = new MemoryObjectStore();
  const input = request();
  const first = await store.put(input);
  const retry = await store.put({ ...input, bytes: Buffer.from(input.bytes) });

  assert.deepEqual(retry, first);
  await assert.rejects(
    store.put({
      ...input,
      bytes: Buffer.from("different bytes", "utf8"),
      sha256: sha256Hex("different bytes"),
      byteSize: "different bytes".length,
    }),
    (error) => error instanceof ObjectStoreError && error.code === "object_key_reused",
  );
});

test("tenant scope is part of the storage key and cross-tenant reads are denied", async () => {
  const store = new MemoryObjectStore();
  const input = request();
  await store.put(input);

  assert.equal(
    storageKeyFor(tenantId, objectKey),
    storageKeyFor(tenantId, objectKey),
  );
  assert.notEqual(
    storageKeyFor(tenantId, objectKey),
    storageKeyFor(otherTenantId, objectKey),
  );
  assert.equal(
    await store.get({
      tenantId: otherTenantId,
      objectKey,
      expectedSha256: input.sha256,
      expectedByteSize: input.byteSize,
    }),
    null,
  );
});

test("integrity mismatches fail closed before bytes are returned", async () => {
  const store = new MemoryObjectStore();
  const input = request();
  await store.put(input);

  await assert.rejects(
    store.get({
      tenantId,
      objectKey,
      expectedSha256: sha256Hex("wrong"),
      expectedByteSize: input.byteSize,
    }),
    (error) => error instanceof ObjectStoreError && error.code === "object_integrity_mismatch",
  );
  await assert.rejects(
    store.get({
      tenantId,
      objectKey,
      expectedSha256: input.sha256,
      expectedByteSize: input.byteSize + 1,
    }),
    (error) => error instanceof ObjectStoreError && error.code === "object_integrity_mismatch",
  );
});

test("S3 adapter checks immutable keys and validates downloaded bytes", async () => {
  const objects = new Map();
  const client = {
    async headObject({ key }) {
      const value = objects.get(key);
      return value
        ? { sha256: value.sha256, byteSize: value.body.byteLength }
        : null;
    },
    async putObject({ key, body }) {
      objects.set(key, { body: Buffer.from(body), sha256: sha256Hex(body) });
    },
    async getObject({ key }) {
      return objects.get(key)?.body ?? null;
    },
    async deleteObject({ key }) {
      objects.delete(key);
    },
  };
  const store = new S3ObjectStore(client);
  const input = request();
  const receipt = await store.put(input);

  assert.equal(receipt.provider, "s3");
  assert.deepEqual(
    await store.get({
      tenantId,
      objectKey,
      expectedSha256: input.sha256,
      expectedByteSize: input.byteSize,
    }),
    input.bytes,
  );

  const value = objects.get(receipt.storageKey);
  value.body[0] ^= 1;
  await assert.rejects(
    store.get({
      tenantId,
      objectKey,
      expectedSha256: input.sha256,
      expectedByteSize: input.byteSize,
    }),
    (error) => error instanceof ObjectStoreError && error.code === "object_integrity_mismatch",
  );
});
