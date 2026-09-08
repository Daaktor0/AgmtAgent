import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDocx } from "../../docx.ts";
import { exportProofDocx } from "../../export/docx.ts";
import { analyzeProof, validateLaunchFinding } from "../../proof/launch.ts";
import { TYPO_ALLOWLIST } from "../../proof/typo-allowlist.ts";
import {
  allCommentCases,
  correctionCases,
  countByRule,
  docxWithLang,
  duplicateWordPositives,
  namedRecieveTraps,
  type BetaRuleCase,
} from "./beta-rule-cases.ts";

const COMMENT_RULES = [
  "completion.placeholder",
  "references.missing_target",
  "references.duplicate_number",
  "definitions.duplicate",
] as const;

function pack(cases: readonly BetaRuleCase[], size: number): BetaRuleCase[][] {
  const groups: BetaRuleCase[][] = [];
  for (let i = 0; i < cases.length; i += size) groups.push(cases.slice(i, i + size));
  return groups;
}

async function analyseGroup(group: readonly BetaRuleCase[]) {
  const paragraphs = group.flatMap((item) => item.paragraphs);
  return analyzeProof(await buildDocx(paragraphs));
}

test("PWC-15 four-typo allowlist is unchanged and tab/name traps stay quiet", async () => {
  assert.deepEqual(Object.keys(TYPO_ALLOWLIST).sort(), ["occured", "recieve", "seperate", "teh"]);
  const tab = await analyzeProof(await buildDocx(["The Company shall pay the\tthe interest on each Interest Payment Date."]));
  assert.equal(tab.plan.findings.some((finding) => finding.ruleId === "language.duplicate_word"), false);
  const french = await analyzeProof(await docxWithLang("The Company shall recieve the notice in writing.", "fr-FR"));
  assert.equal(french.plan.findings.some((finding) => finding.ruleId === "language.typo_allowlist"), false);
  for (const trap of namedRecieveTraps()) {
    const result = await analyzeProof(await buildDocx(trap.paragraphs));
    assert.equal(result.plan.findings.some((finding) => finding.ruleId === trap.ruleId && finding.exactQuote === "recieve"), false, trap.id);
  }
});

test("PWC-15 comment rules have 100 positives and 100 negatives each; detection, anchoring and action stay separate", async () => {
  const { positives, negatives } = allCommentCases();
  const counts = countByRule([...positives, ...negatives.filter((item) => COMMENT_RULES.includes(item.ruleId as typeof COMMENT_RULES[number]))]);
  for (const ruleId of COMMENT_RULES) {
    assert.equal(counts[ruleId]?.positive, 100, `${ruleId} positives`);
    assert.equal(counts[ruleId]?.negative, 100, `${ruleId} negatives`);
  }

  const detectionMisses: string[] = [];
  for (const ruleId of COMMENT_RULES) {
    for (const group of pack(positives.filter((item) => item.ruleId === ruleId), 10)) {
      const analysis = await analyseGroup(group);
      for (const item of group) {
        const detected = analysis.plan.findings.find((finding) => finding.ruleId === item.ruleId && finding.exactQuote === item.quote);
        if (!detected) {
          detectionMisses.push(item.id);
          continue;
        }
        assert.equal(detected.primarySpan.textEnd > detected.primarySpan.textStart, true, `anchoring ${item.id}`);
        assert.equal(detected.kind, "comment", `output-action ${item.id}`);
        assert.equal(detected.replacement, null);
        validateLaunchFinding(analysis, detected);
      }
    }
  }
  assert.deepEqual(detectionMisses, [], "positive detection misses");

  const falsePositives: string[] = [];
  for (const ruleId of COMMENT_RULES) {
    const groupSize = ruleId === "completion.placeholder" || ruleId === "references.missing_target" ? 10 : 1;
    for (const group of pack(negatives.filter((item) => item.ruleId === ruleId), groupSize)) {
      const analysis = await analyseGroup(group);
      for (const item of group) {
        const fired = analysis.plan.findings.filter((finding) => finding.ruleId === item.ruleId);
        if (fired.length) falsePositives.push(`${item.id}:${fired.map((finding) => finding.exactQuote).join("|")}`);
      }
    }
  }
  assert.deepEqual(falsePositives, [], "negative traps fired");
});

test("PWC-15 1000 stratified correction cases keep authored actions; mixed-format is not rewritten", async () => {
  const cases = [...correctionCases(), ...duplicateWordPositives()];
  assert.equal(cases.filter((item) => item.ruleId === "language.typo_allowlist").length, 1000);
  const misses: string[] = [];
  for (const group of pack(cases, 25)) {
    const analysis = await analyseGroup(group);
    for (const item of group) {
      const detected = analysis.plan.findings.find((finding) => finding.ruleId === item.ruleId && finding.exactQuote === item.quote);
      if (!detected) {
        misses.push(item.id);
        continue;
      }
      assert.equal(detected.primarySpan.textEnd - detected.primarySpan.textStart, item.quote!.length, `anchoring ${item.id}`);
      if (item.action === "track_replace") {
        assert.equal(detected.kind, "correction");
        assert.equal(detected.replacement, item.replacement);
      }
      if (item.action === "track_delete") {
        assert.equal(detected.kind, "correction");
        assert.equal(detected.replacement, "");
      }
      validateLaunchFinding(analysis, detected);
    }
  }
  assert.deepEqual(misses, []);
});

test("PWC-15 representative positives export and independently validate", async () => {
  const samples = [
    correctionCases()[0]!,
    duplicateWordPositives()[0]!,
    ...COMMENT_RULES.map((ruleId) => allCommentCases().positives.find((item) => item.ruleId === ruleId)!),
  ];
  for (const item of samples) {
    const bytes = await buildDocx(item.paragraphs);
    const exported = await exportProofDocx(bytes);
    assert.ok(exported.receipt);
    assert.ok(exported.bytes.byteLength > 0);
  }
});
