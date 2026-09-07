import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { ObjectStoreError } from "./object-store.ts";
import {
  MemoryProofR2Bucket,
  PROOF_OBJECT_ENCRYPTION,
  createProofObjectStore,
  expiryMinuteUtc,
  formatProofObjectKey,
  parseProofObjectKey,
  type ProofObjectKeyParts,
} from "./proof-objects.ts";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function store() {
  return createProofObjectStore({
    mode: "local-test",
    quarantine: new MemoryProofR2Bucket(),
    temporary: new MemoryProofR2Bucket(),
  });
}

test("PWC-17 opaque keys parse round-trip and reject filenames", () => {
  const parts: ProofObjectKeyParts = {
    version: "v2",
    expiryMinute: "20260101T0210",
    runToken: "a".repeat(32),
    generation: 0,
    attempt: 1,
    kind: "source",
    objectId: "b".repeat(32),
  };
  const key = formatProofObjectKey(parts);
  assert.equal(key, `proof/v2/20260101T0210/${"a".repeat(32)}/0/1/source-${"b".repeat(32)}`);
  assert.deepEqual(parseProofObjectKey(key), parts);
  assert.equal(/client|acme|\.docx|tenant/i.test(key), false);
  assert.throws(
    () => parseProofObjectKey("tenants/abc/objects/obj_123"),
    (error: unknown) => error instanceof ObjectStoreError && error.code === "invalid_object_key",
  );
  assert.throws(
    () => parseProofObjectKey("proof/v2/20260101T0210/not-hex/0/1/source-file.docx"),
    (error: unknown) => error instanceof ObjectStoreError && error.code === "invalid_object_key",
  );
  assert.equal(expiryMinuteUtc(Date.UTC(2026, 0, 1, 2, 10, 59, 123)), "20260101T0210");
});

test("PWC-17 writes require reservation, are immutable, and bind checksum/size receipts", async () => {
  const objects = store();
  const bytes = Buffer.from("synthetic proof source", "utf8");
  const reservation = objects.reserve({
    deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0),
    generation: 0,
    attempt: 1,
    kind: "source",
    runToken: "c".repeat(32),
  });
  assert.match(reservation.key, /^proof\/v2\/20260101T0400\//);
  assert.equal(reservation.bucketRole, "quarantine");

  await assert.rejects(
    objects.write({
      key: formatProofObjectKey({
        version: "v2",
        expiryMinute: "20260101T0400",
        runToken: "c".repeat(32),
        generation: 0,
        attempt: 1,
        kind: "source",
        objectId: "d".repeat(32),
      }),
      bytes,
      sha256: sha256(bytes),
      byteSize: bytes.byteLength,
      deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0),
    }),
    (error: unknown) => error instanceof ObjectStoreError && error.code === "object_not_reserved",
  );

  const first = await objects.write({
    key: reservation.key,
    bytes,
    sha256: sha256(bytes),
    byteSize: bytes.byteLength,
    deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0),
  });
  assert.equal(first.provider, "r2");
  assert.equal(first.encryption.atRest, "r2_managed");
  assert.equal(first.encryption.appManagedEnvelope, false);
  assert.equal(first.sha256, sha256(bytes));
  assert.equal(first.byteSize, bytes.byteLength);
  assert.ok(first.etag);

  const retry = await objects.write({
    key: reservation.key,
    bytes: Buffer.from(bytes),
    sha256: sha256(bytes),
    byteSize: bytes.byteLength,
    deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0),
  });
  assert.deepEqual(retry.sha256, first.sha256);

  await assert.rejects(
    objects.write({
      key: reservation.key,
      bytes: Buffer.from("different"),
      sha256: sha256(Buffer.from("different")),
      byteSize: Buffer.byteLength("different"),
      deadlineMs: Date.UTC(2026, 0, 1, 4, 0, 0),
    }),
    (error: unknown) => error instanceof ObjectStoreError && error.code === "object_key_reused",
  );

  const headed = await objects.head({ key: reservation.key });
  assert.ok(headed);
  assert.equal(headed.sha256, first.sha256);
  assert.equal(headed.byteSize, first.byteSize);
});

test("PWC-17 lists paginate inside proof/v2 and delete/abort stay key-scoped", async () => {
  const quarantine = new MemoryProofR2Bucket();
  const temporary = new MemoryProofR2Bucket();
  const objects = createProofObjectStore({ mode: "local-test", quarantine, temporary });
  const deadlineMs = Date.UTC(2026, 0, 2, 12, 0, 0);
  const runToken = "e".repeat(32);
  const keys: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const reservation = objects.reserve({
      deadlineMs,
      generation: 0,
      attempt: 1,
      kind: "source",
      runToken,
    });
    const payload = Buffer.from(`synthetic-${index}`);
    await objects.write({
      key: reservation.key,
      bytes: payload,
      sha256: sha256(payload),
      byteSize: payload.byteLength,
      deadlineMs,
    });
    keys.push(reservation.key);
  }
  const output = objects.reserve({
    deadlineMs,
    generation: 0,
    attempt: 1,
    kind: "marked_docx",
    runToken,
  });
  const marked = Buffer.from("marked");
  await objects.write({
    key: output.key,
    bytes: marked,
    sha256: sha256(marked),
    byteSize: marked.byteLength,
    deadlineMs,
  });

  const firstPage = await objects.list({
    bucketRole: "quarantine",
    prefix: `proof/v2/${expiryMinuteUtc(deadlineMs)}/${runToken}/`,
    limit: 2,
  });
  assert.equal(firstPage.keys.length, 2);
  assert.ok(firstPage.cursor);
  const secondPage = await objects.list({
    bucketRole: "quarantine",
    prefix: `proof/v2/${expiryMinuteUtc(deadlineMs)}/${runToken}/`,
    cursor: firstPage.cursor ?? undefined,
    limit: 2,
  });
  assert.equal(secondPage.keys.length, 1);
  assert.equal([...firstPage.keys, ...secondPage.keys].sort().join("|"), keys.sort().join("|"));

  const otherPrefix = await objects.list({
    bucketRole: "quarantine",
    prefix: `proof/v2/${expiryMinuteUtc(deadlineMs)}/${"f".repeat(32)}/`,
  });
  assert.deepEqual(otherPrefix.keys, []);

  await assert.rejects(
    objects.list({ bucketRole: "quarantine", prefix: "tenants/" }),
    (error: unknown) => error instanceof ObjectStoreError && error.code === "invalid_object_key",
  );

  await objects.delete({ key: keys[0] });
  assert.equal(await objects.head({ key: keys[0] }), null);

  const upload = await quarantine.createMultipartUpload(keys[1]);
  await objects.abortMultipart({ key: keys[1], uploadId: upload.uploadId });

  assert.equal(
    (await objects.list({ bucketRole: "temporary", prefix: `proof/v2/${expiryMinuteUtc(deadlineMs)}/${runToken}/` })).keys.length,
    1,
  );
});

test("PWC-17 deployed mode rejects a memory provider", () => {
  const memory = new MemoryProofR2Bucket();
  assert.throws(
    () => createProofObjectStore({ mode: "deployed", quarantine: memory, temporary: memory }),
    (error: unknown) => error instanceof ObjectStoreError && error.code === "object_store_unconfigured",
  );
});
