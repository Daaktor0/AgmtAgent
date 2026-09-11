import assert from "node:assert/strict";
import { test } from "node:test";
import { handleProofBetaFeedback, ProofBetaFeedbackError, proofBetaFeedbackLogLine } from "./proof-beta-feedback.ts";

function request(body: unknown, origin = "https://app.agmt.legal"): Request {
  return new Request("https://app.agmt.legal/api/proof/beta-feedback", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

const valid = {
  category: "incorrect_finding" as const,
  reasonCode: "incorrect_comment" as const,
  includeTechnical: false,
  appVersion: null,
  browser: null,
};

test("beta feedback accepts a structured report without free text or document fields", async () => {
  const logs: string[] = [];
  const original = console.info;
  console.info = ((message?: unknown) => {
    logs.push(String(message));
  }) as typeof console.info;
  try {
    const response = await handleProofBetaFeedback(request(valid));
    assert.equal(response.status, 200);
    const json = await response.json() as { ok: boolean; version: string };
    assert.equal(json.ok, true);
    assert.equal(json.version, "proof-beta-feedback-v2");
    assert.equal(logs.length, 1);
    const line = JSON.parse(logs[0]!) as Record<string, unknown>;
    assert.equal(line.type, "PROOF_BETA_FEEDBACK");
    assert.equal(line.category, "incorrect_finding");
    assert.equal(line.reasonCode, "incorrect_comment");
    assert.equal("note" in line, false);
    assert.equal(Object.keys(line).sort().join(","), "appVersion,at,browser,category,includeTechnical,reasonCode,type,version");
  } finally {
    console.info = original;
  }
});

test("beta feedback log line never includes a note field even if a caller passes one", () => {
  const line = proofBetaFeedbackLogLine({
    ...valid,
    includeTechnical: true,
    appVersion: "probe-version",
    browser: "test-browser",
  }, Date.parse("2026-09-11T12:00:00Z"));
  assert.equal(line.includes("note"), false);
  assert.match(line, /"appVersion":"probe-version"/);
});

test("beta feedback rejects extra keys, free-text note, missing category and untrusted origins", async () => {
  await assert.rejects(() => handleProofBetaFeedback(request({
    ...valid,
    filename: "secret.docx",
  })), ProofBetaFeedbackError);
  await assert.rejects(() => handleProofBetaFeedback(request({
    ...valid,
    note: "Please look at clause 4 of the attached agreement.",
  })), ProofBetaFeedbackError);
  const forbidden = await handleProofBetaFeedback(request(valid, "https://evil.example"));
  assert.equal(forbidden.status, 403);
});
