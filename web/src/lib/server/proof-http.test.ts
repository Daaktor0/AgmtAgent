import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { handleProofRequest, MemoryProofRunCatalog, type ProofHttpDeps } from "./proof-http.ts";
import type { ProofActor } from "./proof-authorization.ts";
import { PROOF_DOCX_MIME } from "./proof-upload.ts";

const ORIGIN = "https://app.agmt.legal";
const NOW = 1_800_000_000_000;
const SHA = "a".repeat(64);

const ownerA: ProofActor = {
  userId: "owner-a",
  tenantId: "tenant-1",
  emailVerified: true,
  accountStatus: "active",
  sessionState: "valid",
};
const ownerB: ProofActor = { ...ownerA, userId: "owner-b" };
const otherTenant: ProofActor = { ...ownerA, userId: "owner-c", tenantId: "tenant-2" };

function deps(overrides: Partial<ProofHttpDeps> & { catalog: MemoryProofRunCatalog }): ProofHttpDeps {
  return {
    now: () => NOW,
    actor: ownerA,
    trustedOrigins: [ORIGIN],
    acceptingUploads: true,
    transfer: {
      async putSource() {
        /* local test broker */
      },
    },
    ...overrides,
  };
}

function request(method: string, path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (method !== "GET" && !headers.has("origin")) headers.set("origin", ORIGIN);
  return new Request(`https://app.agmt.legal/api/proof/${path}`, { method, ...init, headers });
}

test("PWC-19 create-run persists and source PUT streams without processing when the broker is wired", async () => {
  const catalog = new MemoryProofRunCatalog();
  let transferred = 0;
  const bytes = Buffer.from("PK\u0003\u0004synthetic");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const created = await handleProofRequest(
    request("POST", "runs", {
      headers: { "content-type": "application/json", "idempotency-key": "proof-key-1", origin: ORIGIN },
      body: JSON.stringify({ sizeBytes: bytes.byteLength, sha256: sha, profile: "agreement", language: "en-GB" }),
    }),
    deps({ catalog }),
  );
  assert.equal(created.status, 201);
  const summary = await created.json() as { runId: string; status: string; correctionCount: number | null };
  assert.equal(summary.status, "uploading");
  assert.equal(summary.correctionCount, null);

  const replay = await handleProofRequest(
    request("POST", "runs", {
      headers: { "content-type": "application/json", "idempotency-key": "proof-key-1", origin: ORIGIN },
      body: JSON.stringify({ sizeBytes: bytes.byteLength, sha256: sha, profile: "agreement", language: "en-GB" }),
    }),
    deps({ catalog }),
  );
  assert.equal(replay.status, 200);

  const put = await handleProofRequest(
    request("PUT", `runs/${summary.runId}/source`, {
      headers: {
        "content-type": PROOF_DOCX_MIME,
        "content-length": String(bytes.byteLength),
        origin: ORIGIN,
      },
      body: bytes,
    }),
    deps({
      catalog,
      transfer: {
        async putSource(input) {
          transferred += 1;
          assert.equal(input.sha256, sha);
        },
      },
    }),
  );
  assert.equal(put.status, 202);
  const after = await put.json() as { status: string; download: { available: boolean } };
  assert.equal(after.status, "scanning");
  assert.equal(after.download.available, false);
  assert.equal(transferred, 1);
});

test("PWC-19 source PUT is not complete when the transfer broker is disconnected", async () => {
  const catalog = new MemoryProofRunCatalog();
  const created = await handleProofRequest(
    request("POST", "runs", {
      headers: { "content-type": "application/json", "idempotency-key": "proof-key-2", origin: ORIGIN },
      body: JSON.stringify({ sizeBytes: 12, sha256: SHA, profile: "agreement", language: "en-GB" }),
    }),
    deps({ catalog }),
  );
  const summary = await created.json() as { runId: string };
  const put = await handleProofRequest(
    request("PUT", `runs/${summary.runId}/source`, {
      headers: { "content-type": PROOF_DOCX_MIME, "content-length": "12", origin: ORIGIN },
      body: Buffer.alloc(12),
    }),
    deps({ catalog, transfer: null }),
  );
  assert.equal(put.status, 503);
  const body = await put.json() as { error: { code: string } };
  assert.equal(body.error.code, "processing_unavailable");
});

test("PWC-19 paused uploads never read the create-run body", async () => {
  const catalog = new MemoryProofRunCatalog();
  let jsonCalled = false;
  const req = request("POST", "runs", {
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ sizeBytes: 12, sha256: SHA, profile: "agreement", language: "en-GB" }),
  });
  const original = req.json.bind(req);
  req.json = async () => {
    jsonCalled = true;
    return original();
  };
  const paused = await handleProofRequest(req, deps({ catalog, acceptingUploads: false }));
  assert.equal(paused.status, 503);
  assert.equal(jsonCalled, false);
  assert.equal(catalog.runs.size, 0);
});

test("PWC-20 route handlers isolate two owners in one tenant, another tenant, and direct guesses", async () => {
  const catalog = new MemoryProofRunCatalog();
  const created = await handleProofRequest(
    request("POST", "runs", {
      headers: { "content-type": "application/json", "idempotency-key": "proof-key-3", origin: ORIGIN },
      body: JSON.stringify({ sizeBytes: 12, sha256: SHA, profile: "agreement", language: "en-GB" }),
    }),
    deps({ catalog }),
  );
  const { runId } = await created.json() as { runId: string };

  const asB = await handleProofRequest(request("GET", `runs/${runId}`), deps({ catalog, actor: ownerB }));
  assert.equal(asB.status, 404);
  const asOtherTenant = await handleProofRequest(request("GET", `runs/${runId}`), deps({ catalog, actor: otherTenant }));
  assert.equal(asOtherTenant.status, 404);
  const guessed = await handleProofRequest(request("GET", "runs/run_ffffffffffffffff"), deps({ catalog }));
  assert.equal(guessed.status, 404);
  const signedOut = await handleProofRequest(request("GET", `runs/${runId}`), deps({ catalog, actor: null }));
  assert.equal(signedOut.status, 401);

  const unverified = await handleProofRequest(
    request("GET", `download/${runId}`),
    deps({ catalog, actor: { ...ownerA, emailVerified: false } }),
  );
  assert.equal(unverified.status, 403);
  const deleteUnverified = await handleProofRequest(
    request("DELETE", `runs/${runId}`),
    deps({ catalog, actor: { ...ownerA, emailVerified: false } }),
  );
  assert.equal(deleteUnverified.status, 202);

  const revoked = await handleProofRequest(
    request("GET", `runs/${runId}`),
    deps({ catalog, actor: { ...ownerA, sessionState: "revoked" } }),
  );
  assert.equal(revoked.status, 401);

  const evilOrigin = await handleProofRequest(
    request("DELETE", `runs/${runId}`, { headers: { origin: "https://evil.example" } }),
    deps({ catalog }),
  );
  assert.equal(evilOrigin.status, 403);
});
