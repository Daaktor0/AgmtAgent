import assert from "node:assert/strict";
import { test } from "node:test";
import { handleProofBetaFeedback, ProofBetaFeedbackError } from "./proof-beta-feedback.ts";

function request(body: unknown, origin = "https://app.agmt.legal"): Request {
  return new Request("https://app.agmt.legal/api/proof/beta-feedback", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

test("beta feedback accepts an explicit report without document fields", async () => {
  const response = await handleProofBetaFeedback(request({
    category: "incorrect_finding",
    note: "A tracked change looked wrong on a synthetic letter.",
    includeTechnical: false,
    appVersion: null,
    browser: null,
  }));
  assert.equal(response.status, 200);
  const json = await response.json() as { ok: boolean };
  assert.equal(json.ok, true);
});

test("beta feedback rejects extra keys, missing category and untrusted origins", async () => {
  await assert.rejects(() => handleProofBetaFeedback(request({
    category: "incorrect_finding",
    note: "x",
    includeTechnical: false,
    appVersion: null,
    browser: null,
    filename: "secret.docx",
  })), ProofBetaFeedbackError);
  const forbidden = await handleProofBetaFeedback(request({
    category: "missed_error",
    note: "x",
    includeTechnical: false,
    appVersion: null,
    browser: null,
  }, "https://evil.example"));
  assert.equal(forbidden.status, 403);
});
