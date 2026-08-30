import assert from "node:assert/strict";
import test from "node:test";
import { FILE_BYTE_CAP } from "../agmt/config.ts";
import {
  DIRECT_UPLOAD_PART_SIZE,
  DIRECT_UPLOAD_TTL_SECONDS,
  assertUploadOwnership,
  buildDirectUploadGrant,
  createDirectUploadPlan,
  isDirectUploadExpired,
  validateCompletedUpload,
} from "./direct-upload.ts";

const now = Date.parse("2026-08-30T00:00:00.000Z");
const tenantId = "tenant-one";
const ownerUserId = "user-one";
const matterId = "matter-one";
const sha256 = "a".repeat(64);

function request(overrides = {}) {
  return {
    tenantId,
    ownerUserId,
    matterId,
    fileName: "agreement.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteSize: FILE_BYTE_CAP,
    sha256,
    idempotencyKey: "upload-1",
    ...overrides,
  };
}

test("OBJ-02 creates a bounded quarantine plan without exposing tenant names", () => {
  const plan = createDirectUploadPlan(request(), now);
  assert.equal(plan.partSize, DIRECT_UPLOAD_PART_SIZE);
  assert.equal(plan.partCount, 5);
  assert.equal(plan.byteSize, FILE_BYTE_CAP);
  assert.equal(plan.sha256, sha256);
  assert.match(plan.objectKey, /^obj_[0-9a-f-]{36}$/);
  assert.match(plan.quarantineStorageKey, /^quarantine\/tenants\/[0-9a-f]{32}\/objects\/obj_/);
  assert.doesNotMatch(plan.quarantineStorageKey, /tenant-one/);
  assert.equal(plan.expiresAt, new Date(now + DIRECT_UPLOAD_TTL_SECONDS * 1000).toISOString());
});

test("OBJ-02 fails closed on size, type, filename, digest and expiry violations", () => {
  assert.throws(() => createDirectUploadPlan(request({ byteSize: FILE_BYTE_CAP + 1 }), now), /file size/);
  assert.throws(() => createDirectUploadPlan(request({ byteSize: 0 }), now), /file size/);
  assert.throws(() => createDirectUploadPlan(request({ contentType: "application/pdf" }), now), /DOCX/);
  assert.throws(() => createDirectUploadPlan(request({ fileName: "../agreement.docx" }), now), /filename/);
  assert.throws(() => createDirectUploadPlan(request({ fileName: "agreement.pdf" }), now), /DOCX/);
  assert.throws(() => createDirectUploadPlan(request({ sha256: "not-a-digest" }), now), /SHA-256/);
  assert.throws(() => createDirectUploadPlan(request({ expiresAt: new Date(now - 1).toISOString() }), now), /expiry/);
  assert.throws(() => createDirectUploadPlan(request({ expiresAt: new Date(now + DIRECT_UPLOAD_TTL_SECONDS * 1000 + 1).toISOString() }), now), /expiry/);
});

test("OBJ-02 binds every plan to the server-derived tenant, owner and Matter", () => {
  const plan = createDirectUploadPlan(request(), now);
  assert.doesNotThrow(() => assertUploadOwnership(plan, { tenantId, ownerUserId, matterId }));
  assert.throws(() => assertUploadOwnership(plan, { tenantId: "tenant-two", ownerUserId, matterId }), /belong.*tenant/i);
  assert.throws(() => assertUploadOwnership(plan, { tenantId, ownerUserId: "user-two", matterId }), /ownership/);
  assert.throws(() => assertUploadOwnership(plan, { tenantId, ownerUserId, matterId: "matter-two" }), /ownership/);
});

test("OBJ-02 exposes only short-lived HTTPS part grants and verifies provider completion", () => {
  const plan = createDirectUploadPlan(request({ byteSize: DIRECT_UPLOAD_PART_SIZE + 1 }), now);
  const partUrls = Array.from({ length: plan.partCount }, (_, index) => "https://s3.example.test/part/" + (index + 1));
  const grant = buildDirectUploadGrant(
    plan,
    { uploadId: "multipart-1", expiresAt: new Date(now + 60_000).toISOString() },
    partUrls,
  );
  assert.equal(grant.objectKey, plan.objectKey);
  assert.equal(grant.key, plan.quarantineStorageKey);
  assert.equal(grant.parts.length, plan.partCount);
  assert.equal(grant.expectedSha256, sha256);
  assert.equal(grant.expectedByteSize, plan.byteSize);
  assert.equal(isDirectUploadExpired(plan, now), false);
  assert.equal(isDirectUploadExpired(plan, Date.parse(plan.expiresAt)), true);
  assert.doesNotThrow(() => validateCompletedUpload(plan, { storageKey: plan.quarantineStorageKey, sha256, byteSize: plan.byteSize }));
  assert.throws(() => validateCompletedUpload(plan, { storageKey: plan.quarantineStorageKey, sha256: "b".repeat(64), byteSize: plan.byteSize }), /hash/);
  assert.throws(() => validateCompletedUpload(plan, { storageKey: plan.quarantineStorageKey, sha256, byteSize: plan.byteSize - 1 }), /size/);
  assert.throws(() => buildDirectUploadGrant(plan, { uploadId: "multipart-1", expiresAt: new Date(now + 60_000).toISOString() }, Array.from({ length: plan.partCount }, (_, index) => "http://not-tls.example/part/" + (index + 1))), /HTTPS/);
});