import assert from "node:assert/strict";
import { test } from "node:test";
import { ENGINE_BASELINE_MISSES } from "./expected.ts";
import { betaRuleDenominators, uniqueTypoSentences } from "./beta-rule-denominators.ts";
import { correctionCases } from "./beta-rule-cases.ts";

test("PWC-15 denominators separate generated IDs from unique families and packing", () => {
  const report = betaRuleDenominators();
  assert.equal(report.generatedCaseIds.typoCorrections, 1000);
  assert.equal(uniqueTypoSentences().length, report.uniqueTemplateFamilies.typoSentences);
  assert.ok(report.uniqueTemplateFamilies.typoSentences < 1000, "repeated typo variants are not 1000 independent documents");
  assert.equal(report.uniqueTemplateFamilies.typoSentences, new Set(correctionCases().map((item) => item.paragraphs[0])).size);
  assert.equal(report.packing.independentEvidence, false);
  assert.equal(report.packing.packSizes.duplicateNumberAndDefinitionNegatives, 1);
  assert.equal(report.heldOut.evaluatedIndependently, false);
  assert.equal(
    report.heldOut.split.development + report.heldOut.split.calibration + report.heldOut.split.held_out,
    report.heldOut.uniqueFamilyCount,
  );
  for (const rule of report.perRule) {
    if (rule.ruleId.startsWith("completion.") || rule.ruleId.startsWith("references.") || rule.ruleId.startsWith("definitions.")) {
      assert.equal(rule.generatedPositiveIds, 100, rule.ruleId);
      assert.equal(rule.generatedNegativeIds, 100, rule.ruleId);
      assert.ok(rule.uniquePositiveFamilies <= 100, rule.ruleId);
    }
  }
  assert.equal(report.mixedFormat.expectedAction, "track_replace");
  assert.equal(report.mixedFormat.engineOutputAction, "comment");
  assert.equal(report.mixedFormat.rewrittenToPass, false);
  assert.equal(
    ENGINE_BASELINE_MISSES["pwc-08-mixed-format-comment-only"]?.includes(report.mixedFormat.labelledMiss),
    true,
  );
});
