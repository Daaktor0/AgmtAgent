import assert from "node:assert/strict";
import { test } from "node:test";
import { PROOF_UI_FIXTURES, PROOF_UI_STATE_IDS, type RunSummaryV2 } from "./api-contracts.ts";
import { proofDeadlines } from "../server/retention.ts";
import {
  COVERAGE_REASON_COPY,
  interpretFileSelection,
  isStaleSummary,
  presentProofRun,
  rejectRegressiveSummary,
  selectedFileError,
  type ProofLocalContext,
} from "./proof-state.ts";

const verified: ProofLocalContext = { auth: "verified", uploadsPaused: false };

function fixtureRun(state: string): RunSummaryV2 | null {
  return PROOF_UI_FIXTURES.find((item) => item.state === state)?.run ?? null;
}

test("PWC-29 presents every section 9 fixture with exact heading and disabled download except ready", () => {
  const seen = new Set<string>();
  for (const fixture of PROOF_UI_FIXTURES) {
    seen.add(fixture.state);
    const local: ProofLocalContext = {
      auth: fixture.state === "signed_out" ? "signed_out"
        : fixture.state === "unverified" || fixture.state === "verification_sent" ? "unverified"
        : fixture.state === "auth_loading" ? "loading"
        : fixture.state === "auth_unavailable" ? "unavailable"
        : "verified",
      authLoadingMs: fixture.state === "auth_unavailable" ? 20_000 : 0,
      verificationSent: fixture.state === "verification_sent",
      uploadsPaused: !fixture.capabilitiesAccepting,
      developmentFixture: true,
      selected: fixture.state === "selected" ? { name: "Agreement.docx", size: 2048 } : null,
      selectionError: fixture.state === "wrong_extension" ? "wrong_extension"
        : fixture.state === "too_large" ? "too_large"
        : fixture.state === "multiple_files" ? "multiple_files"
        : null,
      unknownRun: fixture.state === "unknown_run",
      quotaExceeded: fixture.state === "quota",
      connectionLost: fixture.state === "connection_lost",
      downloadStarted: fixture.state === "download_started",
      deleteConfirming: fixture.state === "delete_confirmation",
      deleteDelayed: fixture.state === "delete_delayed",
      uploading: fixture.state === "uploading" ? { sent: 512, total: 2048 } : null,
    };
    const view = presentProofRun(fixture.run, local);
    const expected = fixture.state === "coverage_details" ? "limited"
      : fixture.state === "privacy_before_upload" ? "first_visit"
      : fixture.state;
    assert.equal(view.state, expected);
    assert.ok(view.heading.length > 0);
    if (fixture.state === "ready_findings") {
      assert.match(view.heading, /proofread document is ready/);
      assert.match(view.main, /2 tracked corrections/);
      assert.equal(view.actions.download, true);
      assert.equal(view.counts?.corrections, 2);
    }
    if (fixture.state === "ready_zero") {
      assert.match(view.heading, /No issues found by the completed checks/);
      assert.match(view.detail ?? view.main, /does not confirm/);
      assert.equal(view.actions.download, true);
    }
    if (fixture.state === "limited") {
      assert.match(view.heading, /limited coverage/);
      assert.ok(view.coverageLines.some((line) => line.kind === "skipped"));
      assert.equal(view.actions.download, true);
    }
    if (["uploading", "scanning", "queued", "processing", "exporting", "validating"].includes(fixture.state)) {
      assert.equal(view.actions.download, false);
      assert.equal(view.counts, null);
    }
    if (fixture.state === "expired_not_verified") {
      assert.equal(view.actions.download, false);
      assert.match(view.heading, /expired/);
    }
    if (fixture.state === "deleted") {
      assert.equal(view.actions.download, false);
      assert.match(view.heading, /deleted from Agmt/);
    }
    if (fixture.state === "uploads_paused") {
      assert.match(view.heading, /temporarily unavailable/);
      assert.equal(view.actions.proofread, false);
    }
  }
  assert.equal(seen.size, PROOF_UI_STATE_IDS.length);
});

test("PWC-29 keeps null counts, distinguishes zero from limited, and uses server clock for expiry", () => {
  const queued = fixtureRun("queued");
  assert.ok(queued);
  const queuedView = presentProofRun(queued, verified);
  assert.equal(queuedView.counts, null);
  assert.equal(queuedView.downloadAvailable, false);

  const zero = fixtureRun("ready_zero");
  assert.ok(zero);
  assert.equal(zero.correctionCount, 0);
  const zeroView = presentProofRun(zero, verified);
  assert.equal(zeroView.counts?.corrections, 0);
  assert.equal(zeroView.state, "ready_zero");

  const limited = fixtureRun("limited");
  assert.ok(limited);
  const limitedView = presentProofRun(limited, verified);
  assert.equal(limitedView.state, "limited");
  assert.notEqual(limitedView.state, "ready_zero");

  const expired = fixtureRun("expired_not_verified");
  assert.ok(expired);
  assert.equal(presentProofRun(expired, verified).actions.download, false);
  assert.equal(COVERAGE_REASON_COPY.headers_footers_not_checked.includes("Headers and footers"), true);
});

test("PWC-29 out-of-order polling cannot regress a terminal state", () => {
  const ready = fixtureRun("ready_findings");
  const uploading = fixtureRun("uploading");
  assert.ok(ready && uploading);
  const held = rejectRegressiveSummary(ready, uploading);
  assert.equal(held.status, "ready");
  assert.equal(rejectRegressiveSummary(uploading, ready).status, "ready");
  const deleting = fixtureRun("deleting");
  assert.ok(deleting);
  assert.equal(rejectRegressiveSummary(deleting, uploading).status, "deleting");
});

test("PWC-29 stale pending summaries are flagged; terminal summaries are not", () => {
  const processing = fixtureRun("processing");
  const ready = fixtureRun("ready_findings");
  assert.ok(processing && ready);
  const now = processing.serverNow + 20_000;
  assert.equal(isStaleSummary(processing, processing.serverNow, now), true);
  assert.equal(isStaleSummary(ready, ready.serverNow, now), false);
});

test("PWC-29 timezone labels include an accessible ISO timestamp", () => {
  const ready = fixtureRun("ready_findings");
  assert.ok(ready);
  const view = presentProofRun(ready, verified);
  assert.ok(view.timestamps);
  assert.match(view.timestamps.accessIso, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(view.timestamps.accessIso, new Date(ready.deadlines.accessDeadline).toISOString());
});

test("PWC-29 file selection rejects extension/size and keeps the current file on multi-drop", () => {
  assert.equal(selectedFileError({ name: "Agreement.docx", size: 25 * 1024 * 1024 }), null);
  assert.ok(selectedFileError({ name: "a.pdf", size: 1 }));
  assert.ok(selectedFileError({ name: "a.docx", size: 0 }));
  const current = { name: "kept.docx", size: 100 };
  const multi = interpretFileSelection([current, { name: "other.docx", size: 200 }], current);
  assert.equal(multi.error, "multiple_files");
  assert.equal(multi.currentUnchanged, true);
  assert.equal(multi.file?.name, "kept.docx");
  assert.equal(interpretFileSelection([{ name: "x.pdf", size: 10 }], null).error, "wrong_extension");
  assert.equal(interpretFileSelection([{ name: "x.docx", size: 25 * 1024 * 1024 + 1 }], null).error, "too_large");
});

test("PWC-29 unknown coverage codes fall back without throwing", () => {
  const ready = fixtureRun("ready_findings");
  assert.ok(ready);
  const mutated: RunSummaryV2 = {
    ...ready,
    coverage: {
      status: "limited",
      checked: [],
      skipped: [{ code: "headers_footers_not_checked", count: 1, reason: "headers_footers_not_checked" }],
      notApplicable: ["fields_not_checked"],
    },
  };
  const view = presentProofRun(mutated, verified);
  assert.equal(view.state, "limited");
  assert.ok(view.coverageLines.length >= 2);
});

void proofDeadlines;
