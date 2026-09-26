import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDocx } from "../../docx.ts";
import { analyzeProof, validateLaunchFinding } from "../../proof/launch.ts";
import { LAUNCH_RULE_BY_ID } from "../../proof/registry.ts";
import { ENGINE_BASELINE_MISSES } from "./expected.ts";
import { canPromote, ruleMetric } from "./metrics.ts";
import {
  pee01Adversarial,
  pee01Denominators,
  pee01DuplicatePositives,
  pee01DuplicateTraps,
  pee01PlaceholderPositives,
  pee01PlaceholderTraps,
  pee01TypoPositives,
  pee01TypoTraps,
} from "./pee01-cases.ts";
import type { BetaRuleCase } from "./beta-rule-cases.ts";

function pack(cases: readonly BetaRuleCase[], size: number): BetaRuleCase[][] {
  const groups: BetaRuleCase[][] = [];
  for (let i = 0; i < cases.length; i += size) groups.push(cases.slice(i, i + size));
  return groups;
}

async function score(ruleId: BetaRuleCase["ruleId"], positives: readonly BetaRuleCase[], negatives: readonly BetaRuleCase[]) {
  let truePositive = 0;
  let falseNegative = 0;
  let falsePositive = 0;
  const detectionMisses: string[] = [];
  const actionMisses: string[] = [];
  for (const group of pack(positives, 10)) {
    const analysis = await analyzeProof(await buildDocx(group.flatMap((item) => item.paragraphs)));
    for (const item of group) {
      const detected = analysis.plan.findings.find((finding) => finding.ruleId === item.ruleId && finding.exactQuote === item.quote);
      if (!detected) {
        falseNegative += 1;
        detectionMisses.push(item.id);
        continue;
      }
      truePositive += 1;
      assert.equal(detected.primarySpan.textEnd - detected.primarySpan.textStart, item.quote!.length, `anchoring ${item.id}`);
      if (item.action === "track_replace") {
        if (detected.kind !== "correction" || detected.replacement !== item.replacement) actionMisses.push(item.id);
      } else if (item.action === "track_delete") {
        if (detected.kind !== "correction" || detected.replacement !== "") actionMisses.push(item.id);
      } else if (item.action === "comment") {
        if (detected.kind !== "comment" || detected.replacement !== null) actionMisses.push(item.id);
      }
      validateLaunchFinding(analysis, detected);
    }
  }
  for (const group of pack(negatives, 5)) {
    const analysis = await analyzeProof(await buildDocx(group.flatMap((item) => item.paragraphs)));
    for (const item of group) {
      const fired = analysis.plan.findings.filter((finding) => finding.ruleId === item.ruleId);
      if (fired.length) {
        falsePositive += 1;
        detectionMisses.push(`${item.id}:${fired.map((finding) => finding.exactQuote).join("|")}`);
      }
    }
  }
  return {
    ruleId,
    metric: ruleMetric({ ruleId, truePositive, falsePositive, falseNegative }),
    detectionMisses,
    actionMisses,
  };
}

test("PEE-01 unique families meet sample floors and keep mixed-format labelled", () => {
  const report = pee01Denominators();
  assert.deepEqual(report.families, ["sha", "ssa", "nda", "employment", "letter"]);
  assert.ok(report.perRule["language.typo_allowlist"].uniquePositiveFamilies >= 200);
  assert.ok(report.perRule["language.typo_allowlist"].uniqueNegativeFamilies >= 200);
  assert.ok(report.perRule["language.duplicate_word"].uniquePositiveFamilies >= 100);
  assert.ok(report.perRule["completion.placeholder"].uniquePositiveFamilies >= 70);
  assert.equal(
    ENGINE_BASELINE_MISSES["pwc-08-mixed-format-comment-only"]?.includes("employment_typo_split::language.typo_allowlist::recieve"),
    true,
  );
});

test("PEE-01 typo/duplicate/placeholder detection, anchoring and action stay separate", async () => {
  const typo = await score("language.typo_allowlist", pee01TypoPositives(), pee01TypoTraps());
  const duplicate = await score("language.duplicate_word", pee01DuplicatePositives(), pee01DuplicateTraps());
  const placeholder = await score("completion.placeholder", pee01PlaceholderPositives(), pee01PlaceholderTraps());
  assert.deepEqual(typo.detectionMisses, [], "typo detection");
  assert.deepEqual(typo.actionMisses, [], "typo action");
  assert.deepEqual(duplicate.detectionMisses, [], "duplicate detection");
  assert.deepEqual(duplicate.actionMisses, [], "duplicate action");
  assert.deepEqual(placeholder.detectionMisses, [], "placeholder detection");
  assert.deepEqual(placeholder.actionMisses, [], "placeholder action");

  assert.equal(canPromote(typo.metric, { precision: 0.995, recall: 0.9, minSamples: 200 }), true);
  assert.equal(canPromote(duplicate.metric, { precision: 0.995, recall: 0.9, minSamples: 100 }), true);
  assert.equal(canPromote(placeholder.metric, { precision: 0.98, recall: 0.9, minSamples: 70 }), true);
  assert.equal(LAUNCH_RULE_BY_ID["language.typo_allowlist"].defaultEnabled, true);
  assert.equal(LAUNCH_RULE_BY_ID["language.duplicate_word"].defaultEnabled, true);
  assert.equal(LAUNCH_RULE_BY_ID["completion.placeholder"].defaultEnabled, true);
});

test("PEE-01 adversarial quotation and party packages stay silent", async () => {
  for (const item of pee01Adversarial()) {
    const analysis = await analyzeProof(await buildDocx(item.paragraphs));
    const fired = analysis.plan.findings.filter((finding) => finding.ruleId === item.ruleId);
    if (item.expectSilent) assert.equal(fired.length, 0, item.id);
    else assert.ok(fired.length > 0, item.id);
  }
});
