import assert from "node:assert/strict";
import { test } from "node:test";
import { proofDeadlines } from "../server/retention.ts";
import {
  CONTENT_CANARY_FIELDS,
  PROOF_API_VERSION,
  PROOF_UI_COPY,
  PROOF_UI_FIXTURES,
  PROOF_UI_STATE_IDS,
  ProofContractError,
  parseProofCapabilitiesV2,
  parseProofErrorResponse,
  parseRunSummaryV2,
} from "./api-contracts.ts";
import { PROOF_CAPABILITIES_FALLBACK, PROOF_UPLOADS_PAUSED_HEADING } from "./capabilities.ts";

const STARTED = 1_800_000_000_000;
const CANARY = "CONFIDENTIAL_CLIENT_SNIPPET Agreement.docx https://files.example/source.docx";

function readySummary(overrides: Record<string, unknown> = {}) {
  return {
    apiVersion: PROOF_API_VERSION,
    runId: "run_2f8c1a9b0d4e6f70",
    status: "ready",
    stage: "ready",
    serverNow: STARTED + 60_000,
    deadlines: proofDeadlines(STARTED),
    correctionCount: 2,
    commentCount: 1,
    noticeCount: 0,
    coverage: { status: "complete", checked: [{ code: "language_typo_allowlist", count: 2 }], skipped: [], notApplicable: [] },
    retry: { allowed: false, code: null },
    download: { available: true },
    deletion: { requestedAt: null, verifiedAt: null, reason: null },
    error: null,
    ...overrides,
  };
}

test("PWC-02 round-trips v2 DTOs and keeps pre-result counts null", () => {
  const ready = parseRunSummaryV2(readySummary());
  assert.equal(ready.apiVersion, 2);
  assert.equal(ready.correctionCount, 2);
  assert.equal(ready.noticeCount, 0);
  assert.deepEqual(parseRunSummaryV2(JSON.parse(JSON.stringify(ready))), ready);

  const queued = parseRunSummaryV2(readySummary({
    status: "queued",
    stage: "queued",
    correctionCount: null,
    commentCount: null,
    noticeCount: null,
    coverage: null,
    download: { available: false },
  }));
  assert.equal(queued.correctionCount, null);
  assert.equal(queued.coverage, null);
  assert.equal(queued.download.available, false);

  const error = parseProofErrorResponse({
    error: { code: "uploads_paused", messageKey: "uploads_paused", retryable: true, supportId: "a1b2c3d4e5f60718" },
    serverNow: STARTED,
  });
  assert.equal(error.error.retryable, true);
  assert.deepEqual(parseProofCapabilitiesV2(PROOF_CAPABILITIES_FALLBACK).profiles, ["agreement", "general"]);
});

test("PWC-02 rejects extra fields, content canaries, tenant fields, invalid deadlines and premature zeros", () => {
  for (const field of CONTENT_CANARY_FIELDS) {
    assert.throws(() => parseRunSummaryV2(readySummary({ [field]: CANARY })), ProofContractError);
  }
  assert.throws(() => parseRunSummaryV2(readySummary({ findings: [{ quote: CANARY }] })), ProofContractError);
  assert.throws(() => parseRunSummaryV2(readySummary({ tenantId: "tenant-from-client" })), ProofContractError);
  assert.throws(() => parseRunSummaryV2(readySummary({ deadlines: { ...proofDeadlines(STARTED), accessDeadline: STARTED } })), ProofContractError);
  assert.throws(() => parseRunSummaryV2(readySummary({ status: "queued", stage: "queued", correctionCount: 0, commentCount: 0, noticeCount: 0, coverage: null, download: { available: false } })), ProofContractError);
  assert.throws(() => parseRunSummaryV2(readySummary({ status: "processing", stage: "processing", correctionCount: null, commentCount: null, noticeCount: null, coverage: null, download: { available: true } })), ProofContractError);
  assert.throws(() => parseRunSummaryV2(readySummary({ stage: "validating", status: "ready" })), ProofContractError);
  assert.throws(() => parseRunSummaryV2(readySummary({ coverage: { status: "limited", checked: [], skipped: [{ code: "future_enum", count: 1, reason: "future_enum" }], notApplicable: [] } })), ProofContractError);
  assert.throws(() => parseProofErrorResponse({ error: { code: "uploads_paused", messageKey: "uploads_paused", retryable: true, supportId: "a1b2c3d4e5f60718", stack: CANARY }, serverNow: STARTED }), ProofContractError);
  assert.throws(() => parseProofCapabilitiesV2({ ...PROOF_CAPABILITIES_FALLBACK, filename: "Agreement.docx" }), ProofContractError);
  const encoded = JSON.stringify(parseRunSummaryV2(readySummary()));
  assert.doesNotMatch(encoded, /Agreement\.docx|CONFIDENTIAL|files\.example|tenant-from-client/);
});

test("PWC-02 fixtures cover every section 9 state without ad hoc copy drift", () => {
  assert.equal(PROOF_UI_STATE_IDS.length, 36);
  assert.equal(PROOF_UI_FIXTURES.length, 36);
  const seen = new Set<string>();
  for (const fixture of PROOF_UI_FIXTURES) {
    seen.add(fixture.state);
    assert.equal(fixture.copy.heading, PROOF_UI_COPY[fixture.state].heading);
    assert.ok(fixture.copy.heading.length > 0);
    if (fixture.run) {
      const roundTrip = parseRunSummaryV2(JSON.parse(JSON.stringify(fixture.run)));
      assert.deepEqual(roundTrip, fixture.run);
      const json = JSON.stringify(fixture.run);
      assert.doesNotMatch(json, /Agreement\.docx|CONFIDENTIAL|exactQuote|\/word\/document\.xml/);
    }
  }
  assert.equal(seen.size, 36);
  assert.equal(PROOF_UI_COPY.uploads_paused.heading, PROOF_UPLOADS_PAUSED_HEADING);
  assert.equal(PROOF_UI_COPY.ready_zero.heading, "No issues found by the completed checks.");
  assert.equal(PROOF_UI_COPY.first_visit.heading, "Proofread your Word document.");
  const limited = PROOF_UI_FIXTURES.find((f) => f.state === "limited")!.run!;
  assert.equal(limited.coverage?.status, "limited");
  assert.equal(limited.noticeCount, 1);
  const queued = PROOF_UI_FIXTURES.find((f) => f.state === "queued")!.run!;
  assert.equal(queued.correctionCount, null);
  const expired = PROOF_UI_FIXTURES.find((f) => f.state === "expired_not_verified")!.run!;
  assert.equal(expired.download.available, false);
  assert.ok(expired.serverNow >= expired.deadlines.accessDeadline);
});
