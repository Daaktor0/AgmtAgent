import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDocx } from "../docx-v2.ts";
import { buildDocx } from "../docx.ts";
import { launchFixture } from "../corpus/launch-fixtures.ts";
import { analyzeProof } from "./launch.ts";
import { exportProofDocx } from "../export/docx.ts";
import {
  MAX_FINDINGS_PER_RULE,
  MAX_PUBLISHED_FINDINGS,
  resolveProofFindings,
} from "./resolve-findings.ts";
import type { ProofFinding } from "./contracts.ts";
import { sourceSpan, type ProofSource } from "../source-map.ts";

async function sourceOf(bytes: Buffer): Promise<ProofSource> {
  let source: ProofSource | undefined;
  await extractDocx(bytes, (captured) => {
    source = captured;
  });
  assert.ok(source);
  return source;
}

test("PWC-09 exact duplicates merge; different IDs at the same span become one comment", async () => {
  const bytes = await launchFixture("body");
  const analysis = await analyzeProof(bytes);
  const source = analysis.source;
  const first = analysis.plan.findings.find((finding) => finding.ruleId === "language.typo_allowlist")!;
  const duplicate = structuredClone(first);
  const merged = resolveProofFindings(source, [first, duplicate]);
  assert.equal(merged.findings.length, 1);

  const commentTwin: ProofFinding = {
    ...first,
    id: "other-id",
    ruleId: "completion.placeholder",
    kind: "comment",
    replacement: null,
    comment: "Second reason at the same span.",
    scopeEvidence: null,
  };
  const sameSpan = resolveProofFindings(source, [first, commentTwin]);
  assert.equal(sameSpan.findings.length, 1);
  assert.equal(sameSpan.findings[0]?.kind, "comment");
  assert.match(sameSpan.findings[0]?.comment ?? "", /Second reason/);
});

test("PWC-09 same quote in a different paragraph is not merged", async () => {
  const bytes = await buildDocx(["The Company shall recieve notice.", "The Company shall recieve notice."]);
  const analysis = await analyzeProof(bytes);
  const typos = analysis.plan.findings.filter((finding) => finding.ruleId === "language.typo_allowlist");
  assert.equal(typos.length, 2);
  assert.notEqual(JSON.stringify(typos[0]!.primarySpan.paragraphPath), JSON.stringify(typos[1]!.primarySpan.paragraphPath));
  const resolved = resolveProofFindings(analysis.source, typos);
  assert.equal(resolved.findings.length, 2);
});

test("PWC-09 overlapping comments union when short; non-adjacent comments stay separate", async () => {
  const bytes = await launchFixture("body");
  const analysis = await analyzeProof(bytes);
  const placeholder = analysis.plan.findings.find((finding) => finding.ruleId === "completion.placeholder");
  const missing = analysis.plan.findings.find((finding) => finding.ruleId === "references.missing_target");
  assert.ok(placeholder && missing);
  const paragraph = analysis.source.paragraphs[0]!;
  const left = {
    ...missing,
    id: "left-comment",
    kind: "comment" as const,
    replacement: null,
    primarySpan: sourceSpan(paragraph, missing.primarySpan.textStart, placeholder.primarySpan.textStart + 1),
    exactQuote: paragraph.text.slice(missing.primarySpan.textStart, placeholder.primarySpan.textStart + 1),
  };
  const right = {
    ...placeholder,
    id: "right-comment",
    kind: "comment" as const,
    replacement: null,
  };
  const overlapping = resolveProofFindings(analysis.source, [left, right]);
  assert.equal(overlapping.findings.length, 1);
  assert.ok((overlapping.findings[0]!.primarySpan.textEnd - overlapping.findings[0]!.primarySpan.textStart) <= 300);

  const first = analysis.plan.findings.find((finding) => finding.ruleId === "language.typo_allowlist");
  assert.ok(first);
  const distant = resolveProofFindings(analysis.source, [first, placeholder]);
  assert.equal(distant.findings.length, 2);
});

test("PWC-09 501 findings cap is explicit, not a silent first-N trim", async () => {
  const bytes = await buildDocx(Array.from({ length: 501 }, () => "The Company shall recieve notice."));
  const analysis = await analyzeProof(bytes);
  assert.ok(analysis.plan.findings.length <= MAX_FINDINGS_PER_RULE);
  assert.ok(analysis.plan.findings.length <= MAX_PUBLISHED_FINDINGS);
  assert.equal(analysis.coverage, "limited");
  assert.ok(analysis.gaps.includes("rule_budget"));
  const exported = await exportProofDocx(bytes);
  assert.ok(exported.receipt.plan.findings.length <= MAX_FINDINGS_PER_RULE);
  assert.ok(exported.receipt.plan.notices.length >= 1);
});
