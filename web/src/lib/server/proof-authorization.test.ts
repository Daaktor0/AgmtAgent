import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ProofAuthorizationError,
  assertTrustedMutationOrigin,
  authorizeProofAction,
  parseProofRunId,
  type ProofActor,
} from "./proof-authorization.ts";

const ownerA: ProofActor = {
  userId: "owner-a",
  tenantId: "tenant-1",
  emailVerified: true,
  accountStatus: "active",
  sessionState: "valid",
};
const ownerB: ProofActor = { ...ownerA, userId: "owner-b" };
const otherTenant: ProofActor = { ...ownerA, userId: "owner-c", tenantId: "tenant-2" };
const run = { runId: "run_2f8c1a9b0d4e6f70", tenantId: "tenant-1", ownerUserId: "owner-a" };

test("PWC-20 same-tenant other owner and foreign tenant are 404, not existence leaks", () => {
  const owned = authorizeProofAction({ actor: ownerA, action: "status", runId: run.runId, resource: run });
  assert.equal(owned.resource?.ownerUserId, "owner-a");
  assert.throws(
    () => authorizeProofAction({ actor: ownerB, action: "download", runId: run.runId, resource: run }),
    (error: unknown) => error instanceof ProofAuthorizationError && error.status === 404 && error.code === "not_found",
  );
  assert.throws(
    () => authorizeProofAction({ actor: otherTenant, action: "status", runId: run.runId, resource: run }),
    (error: unknown) => error instanceof ProofAuthorizationError && error.status === 404,
  );
  assert.throws(
    () => authorizeProofAction({ actor: ownerA, action: "status", runId: run.runId, resource: null }),
    (error: unknown) => error instanceof ProofAuthorizationError && error.status === 404,
  );
});

test("PWC-20 unverified sessions cannot download; authenticated owners can still delete", () => {
  const unverified = { ...ownerA, emailVerified: false };
  assert.throws(
    () => authorizeProofAction({ actor: unverified, action: "download", runId: run.runId, resource: run }),
    (error: unknown) => error instanceof ProofAuthorizationError && error.code === "unverified_email" && error.status === 403,
  );
  const deleted = authorizeProofAction({ actor: unverified, action: "delete", runId: run.runId, resource: run });
  assert.equal(deleted.resource?.runId, run.runId);
});

test("PWC-20 revoked, expired and missing sessions are 401; malformed ids are 400", () => {
  for (const sessionState of ["revoked", "expired", "missing"] as const) {
    assert.throws(
      () => authorizeProofAction({ actor: { ...ownerA, sessionState }, action: "status", runId: run.runId, resource: run }),
      (error: unknown) => error instanceof ProofAuthorizationError && error.status === 401,
    );
  }
  assert.throws(() => parseProofRunId("../etc/passwd"), ProofAuthorizationError);
  assert.throws(() => parseProofRunId("short"), ProofAuthorizationError);
});

test("PWC-20 cookie mutations require a trusted origin", () => {
  assert.doesNotThrow(() => assertTrustedMutationOrigin({
    method: "POST",
    origin: "https://app.agmt.legal",
    trustedOrigins: ["https://app.agmt.legal"],
  }));
  assert.throws(
    () => assertTrustedMutationOrigin({
      method: "DELETE",
      origin: "https://evil.example",
      trustedOrigins: ["https://app.agmt.legal"],
    }),
    (error: unknown) => error instanceof ProofAuthorizationError && error.code === "forbidden_origin",
  );
  assert.doesNotThrow(() => assertTrustedMutationOrigin({
    method: "GET",
    origin: "https://evil.example",
    trustedOrigins: ["https://app.agmt.legal"],
  }));
});
