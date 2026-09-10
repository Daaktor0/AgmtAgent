import assert from "node:assert/strict";
import { test } from "node:test";
import { SourceSpanSchema, ProofFindingSchema, ExportPlanSchema } from "./contracts.ts";
import { LAUNCH_CHECKS } from "./registry.ts";
import { LAUNCH_FIXTURES, launchFixture, DEMO_SENTENCE, DEMO_EXPECTED } from "../corpus/launch-fixtures.ts";
import { extractDocx as extractDocxV2 } from "../docx-v2.ts";

test("frozen demonstration packages parse with exact expected text and prior review", async () => {
  for (const f of LAUNCH_FIXTURES) {
    const bytes = await launchFixture(f);
    const extracted = await extractDocxV2(bytes);
    if (f === "party_name") {
      assert.ok(extracted.blocks.some((b) => b.text.includes("Recieve Private Limited")));
      continue;
    }
    assert.equal(extracted.blocks[0].text, DEMO_SENTENCE);
    assert.equal(extracted.blocks[0].isTable, f === "table");
    if (f === "prior_review") {
      assert.equal(extracted.comments.length, 1);
      assert.equal(extracted.revisions.length, 2);
      assert.ok(!extracted.blocks[1].text.includes("Removed earlier"));
    }
  }
  for (const e of DEMO_EXPECTED) assert.equal(DEMO_SENTENCE.slice(e.start, e.end), e.quote);
});

test("strict finding/plan contracts reject forged offsets, absence claims and deferred rule IDs", () => {
  const span = { partUri: "/word/document.xml", paragraphPath: [0, 0, 0], textStart: 0, textEnd: 7, projection: "final", nodeSegments: [{ nodePath: [0, 0, 0, 0, 0], start: 0, end: 7 }] };
  assert.equal(SourceSpanSchema.safeParse(span).success, true);
  for (const change of [{ textStart: -1 }, { textEnd: 8 }, { projection: "all" }, { partUri: "/word/../document.xml" }, { ownerId: "client" }]) {
    assert.equal(SourceSpanSchema.safeParse({ ...span, ...change }).success, false);
  }
  const finding = { id: "f1", ruleId: "language.typo_allowlist", ruleVersion: 1, kind: "correction", category: "language", severity: "suggestion", primarySpan: span, relatedSpans: [], exactQuote: "recieve", replacement: "receive", comment: "Possible typo.", scopeEvidence: null };
  assert.equal(ProofFindingSchema.safeParse(finding).success, true);
  for (const change of [{ ruleId: "defterm.unused" }, { kind: "comment" }, { exactQuote: "other" }, { category: "references" }, { replacement: null }, { ruleId: "references.missing_target" }]) {
    assert.equal(ProofFindingSchema.safeParse({ ...finding, ...change }).success, false);
  }
  assert.equal(LAUNCH_CHECKS.length, new Set(LAUNCH_CHECKS.map((s) => s.checkId)).size);
  assert.equal(LAUNCH_CHECKS.length >= 6, true);
  assert.equal(ExportPlanSchema.safeParse({ sourceSha256: "a".repeat(64), ruleSetVersion: "proof-launch-v1", exporterVersion: "proof-ooxml-v1", author: "Agmt Proof", initials: "AP", findings: [finding], notices: [] }).success, true);
});
