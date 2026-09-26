import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { LAUNCH_RULE_SET_VERSION } from "../agmt/proof/registry.ts";
import { canTransitionProductRun } from "../server/product-runs.ts";
import {
  PROOF_CAPABILITIES_FALLBACK,
  PROOF_LANGUAGES,
  PROOF_MAX_SOURCE_BYTES,
  PROOF_PROFILES,
  PROOF_PURGE_FRESHNESS_MS,
  PROOF_RULE_SET_VERSION,
  PROOF_SCANNER_FRESHNESS_MS,
  PROOF_SUPPORT_MATRIX_VERSION,
  PROOF_UPLOADS_PAUSED_DETAIL,
  PROOF_UPLOADS_PAUSED_HEADING,
  PROOF_VALIDATOR_FRESHNESS_MS,
  PROOF_BUDGET_FRESHNESS_MS,
  assertProofUploadsAccepted,
  getProofCapabilities,
  parseProofCapabilities,
  parseProofUploadsSwitch,
  proofAcceptingUploads,
  proofAvailabilityCopy,
  proofCapabilitiesFromReadiness,
  proofCapabilitiesPath,
  proofRouteRequiresUploadAdmission,
  proofUploadAdmissionResponse,
  reportProofReadiness,
  resetProofReadinessForTests,
  type ProofReadinessInput,
} from "./capabilities.ts";

const NOW = 1_800_000_000_000;
const here = dirname(fileURLToPath(import.meta.url));

function ready(overrides: Partial<ProofReadinessInput> = {}): ProofReadinessInput {
  return {
    productId: "proof",
    uploadsSwitch: true,
    purgeReadyAt: NOW,
    scannerReadyAt: NOW,
    validatorReadyAt: NOW,
    budgetReadyAt: NOW,
    budgetAllowsAdmission: true,
    now: NOW,
    ...overrides,
  };
}

test("PWC-01 missing, false and unknown readiness deny uploads", () => {
  assert.equal(proofAcceptingUploads(ready({ uploadsSwitch: null })), false);
  assert.equal(proofAcceptingUploads(ready({ uploadsSwitch: false })), false);
  assert.equal(parseProofUploadsSwitch(undefined), null);
  assert.equal(parseProofUploadsSwitch(""), null);
  assert.equal(parseProofUploadsSwitch("maybe"), null);
  assert.equal(parseProofUploadsSwitch("true"), true);
  assert.equal(parseProofUploadsSwitch("1"), true);
  assert.equal(parseProofUploadsSwitch("false"), false);
  assert.equal(proofAcceptingUploads(ready({ purgeReadyAt: null })), false);
  assert.equal(proofAcceptingUploads(ready({ scannerReadyAt: null })), false);
  assert.equal(proofAcceptingUploads(ready({ validatorReadyAt: null })), false);
  assert.equal(proofAcceptingUploads(ready({ budgetReadyAt: null })), false);
  assert.equal(proofAcceptingUploads(ready({ budgetAllowsAdmission: false })), false);
  assert.equal(proofAcceptingUploads(ready({ productId: "review" })), false);
  assert.equal(proofAcceptingUploads(ready({ productId: "other" })), false);
  assert.equal(proofAcceptingUploads(ready({ productId: null })), false);
});

test("PWC-01 stale and future readiness timestamps deny; inclusive expiry boundary accepts", () => {
  assert.equal(proofAcceptingUploads(ready({ now: NOW + PROOF_PURGE_FRESHNESS_MS })), true);
  assert.equal(proofAcceptingUploads(ready({ now: NOW + PROOF_PURGE_FRESHNESS_MS + 1 })), false);
  assert.equal(proofAcceptingUploads(ready({ scannerReadyAt: NOW - PROOF_SCANNER_FRESHNESS_MS })), true);
  assert.equal(proofAcceptingUploads(ready({ scannerReadyAt: NOW - PROOF_SCANNER_FRESHNESS_MS - 1 })), false);
  assert.equal(proofAcceptingUploads(ready({ validatorReadyAt: NOW - PROOF_VALIDATOR_FRESHNESS_MS - 1 })), false);
  assert.equal(proofAcceptingUploads(ready({ budgetReadyAt: NOW - PROOF_BUDGET_FRESHNESS_MS - 1 })), false);
  assert.equal(proofAcceptingUploads(ready({ purgeReadyAt: NOW + 1 })), false);
  assert.equal(proofAcceptingUploads(ready({ scannerReadyAt: Number.NaN })), false);
  assert.equal(proofAcceptingUploads(ready()), true);
  const dto = proofCapabilitiesFromReadiness(ready());
  assert.equal(dto.apiVersion, 2);
  assert.equal(dto.acceptingUploads, true);
  assert.equal(dto.maxSourceBytes, PROOF_MAX_SOURCE_BYTES);
  assert.deepEqual(dto.profiles, [...PROOF_PROFILES]);
  assert.deepEqual(dto.languages, [...PROOF_LANGUAGES]);
});

test("PWC-01 public DTO parse fails closed on malformed payloads", () => {
  assert.equal(parseProofCapabilities(null).acceptingUploads, false);
  assert.equal(parseProofCapabilities({ apiVersion: 2, acceptingUploads: true }).acceptingUploads, false);
  assert.equal(parseProofCapabilities({
    ...PROOF_CAPABILITIES_FALLBACK,
    acceptingUploads: true,
  }).acceptingUploads, true);
  assert.equal(parseProofCapabilities({
    ...PROOF_CAPABILITIES_FALLBACK,
    acceptingUploads: "true",
  }).acceptingUploads, false);
  assert.equal(parseProofCapabilities({
    ...PROOF_CAPABILITIES_FALLBACK,
    acceptingUploads: true,
    maxSourceBytes: PROOF_MAX_SOURCE_BYTES + 1,
  }).acceptingUploads, false);
  assert.equal(PROOF_RULE_SET_VERSION, LAUNCH_RULE_SET_VERSION);
  assert.equal(PROOF_SUPPORT_MATRIX_VERSION, "proof-support-matrix-v1");
});

test("PWC-01 home and Proof share paused copy; upload admission is POST-only", () => {
  assert.deepEqual(proofAvailabilityCopy(false), {
    heading: PROOF_UPLOADS_PAUSED_HEADING,
    detail: PROOF_UPLOADS_PAUSED_DETAIL,
  });
  assert.equal(proofAvailabilityCopy(true), null);
  assert.equal(PROOF_UPLOADS_PAUSED_HEADING, "Proof is temporarily unavailable for new uploads.");
  assert.equal(PROOF_UPLOADS_PAUSED_DETAIL, "Existing downloads and deletion remain available.");
  assert.equal(proofRouteRequiresUploadAdmission("POST", ["upload"]), true);
  assert.equal(proofRouteRequiresUploadAdmission("POST", ["runs"]), true);
  assert.equal(proofRouteRequiresUploadAdmission("PUT", ["runs", "run-1", "source"]), true);
  assert.equal(proofRouteRequiresUploadAdmission("POST", ["upload", "extra"]), false);
  assert.equal(proofRouteRequiresUploadAdmission("GET", ["download", "run-1"]), false);
  assert.equal(proofRouteRequiresUploadAdmission("DELETE", ["run", "run-1"]), false);
  assert.equal(proofRouteRequiresUploadAdmission("GET", ["capabilities"]), false);
  assert.equal(proofCapabilitiesPath(["capabilities"], "GET"), true);
  assert.equal(proofCapabilitiesPath(["upload"], "POST"), false);
});

test("PWC-01 live capabilities default deny and do not consume an upload body", async () => {
  const previous = process.env.PROOF_UPLOADS_ENABLED;
  resetProofReadinessForTests();
  delete process.env.PROOF_UPLOADS_ENABLED;
  try {
    const caps = getProofCapabilities(NOW);
    assert.equal(caps.acceptingUploads, false);
    assert.equal(caps.apiVersion, 2);
    assert.throws(() => assertProofUploadsAccepted(NOW), { code: "uploads_paused", status: 503 });
    const denied = proofUploadAdmissionResponse(NOW);
    assert.ok(denied);
    assert.equal(denied.status, 503);
    const body = await denied.json() as { error: string };
    assert.equal(body.error, "uploads_paused");
    assert.equal(proofRouteRequiresUploadAdmission("POST", ["upload"]), true);
    assert.equal(denied.headers.get("cache-control"), "private, no-store");
  } finally {
    if (previous === undefined) delete process.env.PROOF_UPLOADS_ENABLED;
    else process.env.PROOF_UPLOADS_ENABLED = previous;
    resetProofReadinessForTests();
  }
});

test("PWC-01 all signals required; download and delete stay ungated; scanning→processing remains invalid", () => {
  const previous = process.env.PROOF_UPLOADS_ENABLED;
  resetProofReadinessForTests();
  process.env.PROOF_UPLOADS_ENABLED = "true";
  try {
    assert.equal(getProofCapabilities(NOW).acceptingUploads, false);
    reportProofReadiness({
      purgeReadyAt: NOW,
      scannerReadyAt: NOW,
      validatorReadyAt: NOW,
      budgetReadyAt: NOW,
      budgetAllowsAdmission: true,
    });
    assert.equal(getProofCapabilities(NOW).acceptingUploads, true);
    reportProofReadiness({ purgeReadyAt: NOW - PROOF_PURGE_FRESHNESS_MS - 1 });
    assert.equal(getProofCapabilities(NOW).acceptingUploads, false);
    assert.equal(proofUploadAdmissionResponse(NOW)?.status, 503);
    assert.equal(canTransitionProductRun("scanning", "processing"), false);
    assert.equal(canTransitionProductRun("scanning", "queued"), true);
    assert.equal(proofRouteRequiresUploadAdmission("GET", ["download", "ready-run"]), false);
    assert.equal(proofRouteRequiresUploadAdmission("DELETE", ["run", "ready-run"]), false);
  } finally {
    if (previous === undefined) delete process.env.PROOF_UPLOADS_ENABLED;
    else process.env.PROOF_UPLOADS_ENABLED = previous;
    resetProofReadinessForTests();
  }
});

test("PWC-01 upload handlers admit before reading bytes and do not add scanning→processing", () => {
  const service = readFileSync(join(here, "../server/proof-service.ts"), "utf8");
  const api = readFileSync(join(here, "../../routes/api/proof/$.ts"), "utf8");
  const http = readFileSync(join(here, "../server/proof-http.ts"), "utf8");
  const runs = readFileSync(join(here, "../server/product-runs.ts"), "utf8");
  const home = readFileSync(join(here, "../../routes/index.tsx"), "utf8");
  const proof = readFileSync(join(here, "../../routes/proof.index.tsx"), "utf8");
  const uploadFn = service.slice(service.indexOf("export async function uploadAndProcessProof"));
  assert.match(uploadFn.slice(0, 280), /assertProofUploadsAccepted\(\)/);
  assert.match(api, /liveGate/);
  assert.match(api, /proofAcceptingUploads/);
  assert.match(api, /admitProofBudget/);
  assert.match(http, /proofRouteRequiresUploadAdmission/);
  assert.ok(http.indexOf("proofRouteRequiresUploadAdmission") < http.indexOf("request.json()"));
  assert.doesNotMatch(api, /request\.arrayBuffer\(\)/);
  assert.doesNotMatch(http, /request\.arrayBuffer\(\)/);
  // The home page is now executed copies (browser-only, no upload); it must
  // not advertise server uploads either way.
  assert.match(home, /ExecuteApp/);
  assert.match(proof, /ProofLocalExperience/);
  assert.doesNotMatch(home, /proofAvailabilityCopy/);
  assert.doesNotMatch(proof, /proofAvailabilityCopy/);
  assert.match(runs, /scanning: \["queued", "rejected", "failed", "deleting"\]/);
  assert.doesNotMatch(runs, /scanning: \[[^\]]*processing/);
});
