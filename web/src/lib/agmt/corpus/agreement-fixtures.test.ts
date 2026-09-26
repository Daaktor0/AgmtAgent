import assert from "node:assert/strict";
import { test } from "node:test";
import { EXTRACTED_TEXT_LIMIT } from "../projection.ts";
import { processProofLocal } from "../../proof-local/pipeline.ts";
import { PROOF_LOCAL_POLICY_DESKTOP } from "../../proof-local/policy.ts";
import { DEMO_EXPECTED } from "./launch-fixtures.ts";
import {
  completeAgreementFixture,
  packageCapacitySnapshot,
} from "./agreement-fixtures.ts";

test("labelled 25-page complete agreement processes under desktop policy and matches planted findings", async () => {
  const fixture = await completeAgreementFixture(25, "labelled");
  const snap = packageCapacitySnapshot(fixture.bytes, PROOF_LOCAL_POLICY_DESKTOP);
  assert.equal(snap.xmlAdmitGate, "ok");
  assert.equal(snap.extractedGate, "ok");
  assert.ok((snap.extractedCodePoints ?? 0) > 0);
  assert.ok((snap.extractedCodePoints ?? 0) < EXTRACTED_TEXT_LIMIT);
  assert.ok(snap.documentXmlBytes > 0);
  assert.ok(snap.tableCount >= 1);
  assert.ok(snap.revisionCount >= 2);
  assert.ok(snap.commentAnchorCount >= 1);
  assert.notEqual(snap.documentXmlBytes, snap.sourceZipBytes);
  assert.notEqual(snap.documentXmlBytes, snap.extractedCodePoints);

  const result = await processProofLocal(fixture.bytes, { policy: PROOF_LOCAL_POLICY_DESKTOP });
  const quotes = result.findings.map((finding) => `${finding.ruleId}:${finding.quote}`);
  for (const expected of DEMO_EXPECTED) {
    assert.ok(quotes.some((item) => item.startsWith(`${expected.ruleId}:${expected.quote}`)), expected.ruleId);
  }
  assert.equal(result.corrections, 2);
  assert.ok(result.comments >= 2);
  assert.ok(result.output.byteLength > 4);
});

test("clean 25-page complete agreement has no planted DEMO findings", async () => {
  const fixture = await completeAgreementFixture(25, "clean");
  const result = await processProofLocal(fixture.bytes, { policy: PROOF_LOCAL_POLICY_DESKTOP });
  const quotes = result.findings.map((finding) => `${finding.ruleId}:${finding.quote}`);
  for (const expected of DEMO_EXPECTED) {
    assert.equal(quotes.some((item) => item.startsWith(`${expected.ruleId}:${expected.quote}`)), false, expected.ruleId);
  }
  assert.equal(result.corrections, 0);
  assert.equal(result.findings.filter((finding) => finding.ruleId === "references.missing_target").length, 0);
});

test("150-page labelled agreement exceeds the old 1 MiB XML ceiling and still matches planted findings", async () => {
  const fixture = await completeAgreementFixture(150, "labelled");
  const snap = packageCapacitySnapshot(fixture.bytes, PROOF_LOCAL_POLICY_DESKTOP);
  assert.ok(snap.documentXmlBytes > 1 * 1024 * 1024, `document.xml ${snap.documentXmlBytes} should exceed 1 MiB`);
  assert.equal(
    packageCapacitySnapshot(fixture.bytes, { ...PROOF_LOCAL_POLICY_DESKTOP, maxDocumentXmlBytes: 1 * 1024 * 1024, maxTotalXmlBytes: 2 * 1024 * 1024 }).xmlAdmitGate,
    "package_too_complex",
  );
  assert.ok(snap.documentXmlBytes <= PROOF_LOCAL_POLICY_DESKTOP.maxDocumentXmlBytes);
  assert.equal(snap.xmlAdmitGate, "ok");
  assert.equal(snap.extractedGate, "ok");
  assert.ok((snap.extractedCodePoints ?? 0) < EXTRACTED_TEXT_LIMIT);
  const result = await processProofLocal(fixture.bytes, { policy: PROOF_LOCAL_POLICY_DESKTOP });
  const quotes = result.findings.map((finding) => `${finding.ruleId}:${finding.quote}`);
  for (const expected of DEMO_EXPECTED) {
    assert.ok(quotes.some((item) => item.startsWith(`${expected.ruleId}:${expected.quote}`)), expected.ruleId);
  }
});
