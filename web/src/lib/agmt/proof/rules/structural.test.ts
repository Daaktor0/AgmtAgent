/**
 * PEE-10 / PEE-11 evaluation: detection, anchoring and action are separate.
 * Promotion uses the held_out bucket only. Disabled rules are still scored.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDocx } from "../../docx.ts";
import { analyzeProof, validateLaunchFinding } from "../launch.ts";
import { launchRuleFindings } from "../launch-checks.ts";
import { LAUNCH_RULE_BY_ID } from "../registry.ts";
import { canPromote, ruleMetric } from "../../corpus/pwc/metrics.ts";
import { docxWithLang, type BetaRuleCase } from "../../corpus/pwc/beta-rule-cases.ts";
import {
  PEE10_COMMENT_PRECISION,
  PEE10_MIN_SAMPLES,
  PEE10_SUPPORTED_RECALL,
  pee10Adversarial,
  pee10AmbiguousPositives,
  pee10AmbiguousTraps,
  pee10Denominators,
  pee10DuplicatePositives,
  pee10DuplicateTraps,
  pee10MissingPositives,
  pee10MissingTraps,
  pee10ScopePositives,
  pee10ScopeTraps,
  splitBucket as split10,
} from "../../corpus/pwc/pee10-cases.ts";
import {
  PEE11_COMMENT_PRECISION,
  PEE11_MIN_SAMPLES,
  PEE11_SUPPORTED_RECALL,
  pee11Adversarial,
  pee11CasePositives,
  pee11CaseTraps,
  pee11Denominators,
  pee11DuplicatePositives,
  pee11DuplicateTraps,
  pee11RedefinitionPositives,
  pee11RedefinitionTraps,
  pee11UndefinedPositives,
  pee11UndefinedTraps,
  pee11UnusedPositives,
  pee11UnusedTraps,
  splitBucket as split11,
} from "../../corpus/pwc/pee11-cases.ts";

function pack(cases: readonly BetaRuleCase[], size: number): BetaRuleCase[][] {
  const groups: BetaRuleCase[][] = [];
  for (let i = 0; i < cases.length; i += size) groups.push(cases.slice(i, i + size));
  return groups;
}

function heldOut(cases: readonly BetaRuleCase[], split: (id: string) => string): BetaRuleCase[] {
  return cases.filter((item) => split(item.id) === "held_out");
}

async function score(ruleId: BetaRuleCase["ruleId"], positives: readonly BetaRuleCase[], negatives: readonly BetaRuleCase[], positivePack = 10) {
  let truePositive = 0;
  let falseNegative = 0;
  let falsePositive = 0;
  const detectionMisses: string[] = [];
  const actionMisses: string[] = [];
  for (const group of pack(positives, positivePack)) {
    const analysis = await analyzeProof(await buildDocx(group.flatMap((item) => item.paragraphs)));
    const ctx = { source: analysis.source, extracted: analysis.extracted, sourceSha256: analysis.sourceSha256, indexes: analysis.indexes };
    const findings = launchRuleFindings(ctx, ruleId);
    for (const item of group) {
      const detected = findings.find((finding) => finding.ruleId === item.ruleId && finding.exactQuote === item.quote);
      if (!detected) {
        falseNegative += 1;
        detectionMisses.push(item.id);
        continue;
      }
      truePositive += 1;
      assert.equal(detected.primarySpan.textEnd - detected.primarySpan.textStart, item.quote!.length, `anchoring ${item.id}`);
      if (item.action === "comment") {
        if (detected.kind !== "comment" || detected.replacement !== null) actionMisses.push(item.id);
      }
      validateLaunchFinding(analysis, detected);
    }
  }
  for (const group of pack(negatives, 1)) {
    const analysis = await analyzeProof(await buildDocx(group.flatMap((item) => item.paragraphs)));
    const ctx = { source: analysis.source, extracted: analysis.extracted, sourceSha256: analysis.sourceSha256, indexes: analysis.indexes };
    const fired = launchRuleFindings(ctx, ruleId);
    for (const item of group) {
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
    promote: canPromote(ruleMetric({ ruleId, truePositive, falsePositive, falseNegative }), {
      precision: PEE10_COMMENT_PRECISION,
      recall: PEE10_SUPPORTED_RECALL,
      minSamples: PEE10_MIN_SAMPLES,
    }),
    floors: { precision: PEE11_COMMENT_PRECISION, recall: PEE11_SUPPORTED_RECALL, minSamples: PEE11_MIN_SAMPLES },
  };
}

test("PEE-10 unique families meet sample floors across five agreement families", () => {
  const report = pee10Denominators();
  assert.deepEqual(report.families, ["sha", "ssa", "nda", "employment", "letter"]);
  for (const ruleId of ["references.missing_target", "references.duplicate_number", "references.scope_confusion", "references.ambiguous_target"]) {
    assert.ok(report.perRule[ruleId].uniquePositiveFamilies >= 100, ruleId);
    assert.ok(report.perRule[ruleId].uniqueNegativeFamilies >= 100, ruleId);
    assert.ok(report.perRule[ruleId].heldOutPositive + report.perRule[ruleId].heldOutNegative >= PEE10_MIN_SAMPLES, `${ruleId} held_out`);
  }
});

test("PEE-11 unique families meet sample floors across five agreement families", () => {
  const report = pee11Denominators();
  assert.deepEqual(report.families, ["sha", "ssa", "nda", "employment", "letter"]);
  for (const ruleId of ["definitions.duplicate", "definitions.scope_redefinition", "definitions.case_variant", "definitions.unused", "definitions.undefined_use"]) {
    assert.ok(report.perRule[ruleId].uniquePositiveFamilies >= 100, ruleId);
    assert.ok(report.perRule[ruleId].uniqueNegativeFamilies >= 100, ruleId);
    assert.ok(report.perRule[ruleId].heldOutPositive + report.perRule[ruleId].heldOutNegative >= PEE11_MIN_SAMPLES, `${ruleId} held_out`);
  }
});

test("PEE-10 held-out detection, anchoring and action; enable only rules that pass", async () => {
  const rows = [
    await score("references.missing_target", heldOut(pee10MissingPositives(), split10), heldOut(pee10MissingTraps(), split10)),
    await score("references.duplicate_number", heldOut(pee10DuplicatePositives(), split10), heldOut(pee10DuplicateTraps(), split10)),
    await score("references.scope_confusion", heldOut(pee10ScopePositives(), split10), heldOut(pee10ScopeTraps(), split10)),
    await score("references.ambiguous_target", heldOut(pee10AmbiguousPositives(), split10), heldOut(pee10AmbiguousTraps(), split10)),
  ];
  const mismatches = rows.map((row) => {
    const enabled = LAUNCH_RULE_BY_ID[row.ruleId].defaultEnabled;
    return `${row.ruleId} enabled=${enabled} promote=${row.promote} p=${row.metric.precision} r=${row.metric.recall} tp=${row.metric.truePositive} fp=${row.metric.falsePositive} fn=${row.metric.falseNegative} misses=${row.detectionMisses.slice(0, 8).join(",")}`;
  });
  for (const row of rows) assert.deepEqual(row.actionMisses, [], `${row.ruleId} action`);
  assert.deepEqual(rows.map((row) => LAUNCH_RULE_BY_ID[row.ruleId].defaultEnabled), rows.map((row) => row.promote), mismatches.join(" | "));
});

test("PEE-11 held-out detection, anchoring and action; enable only rules that pass", async () => {
  const rows = [
    await score("definitions.duplicate", heldOut(pee11DuplicatePositives(), split11), heldOut(pee11DuplicateTraps(), split11)),
    await score("definitions.scope_redefinition", heldOut(pee11RedefinitionPositives(), split11), heldOut(pee11RedefinitionTraps(), split11), 1),
    await score("definitions.case_variant", heldOut(pee11CasePositives(), split11), heldOut(pee11CaseTraps(), split11)),
    await score("definitions.unused", heldOut(pee11UnusedPositives(), split11), heldOut(pee11UnusedTraps(), split11)),
    await score("definitions.undefined_use", heldOut(pee11UndefinedPositives(), split11), heldOut(pee11UndefinedTraps(), split11)),
  ];
  const mismatches = rows.map((row) => {
    const enabled = LAUNCH_RULE_BY_ID[row.ruleId].defaultEnabled;
    return `${row.ruleId} enabled=${enabled} promote=${row.promote} p=${row.metric.precision} r=${row.metric.recall} tp=${row.metric.truePositive} fp=${row.metric.falsePositive} fn=${row.metric.falseNegative} misses=${row.detectionMisses.slice(0, 8).join(",")}`;
  });
  for (const row of rows) assert.deepEqual(row.actionMisses, [], `${row.ruleId} action`);
  const expectedEnabled = rows.map((row) => row.ruleId === "definitions.unused" ? false : row.promote);
  assert.deepEqual(rows.map((row) => LAUNCH_RULE_BY_ID[row.ruleId].defaultEnabled), expectedEnabled, mismatches.join(" | "));
});

test("PEE-10/11 adversarial quotation, party, table and imported packages", async () => {
  for (const item of [...pee10Adversarial(), ...pee11Adversarial()]) {
    const analysis = await analyzeProof(await buildDocx(item.paragraphs, item.tableRows ? { tableRows: item.tableRows } : undefined));
    const ctx = { source: analysis.source, extracted: analysis.extracted, sourceSha256: analysis.sourceSha256, indexes: analysis.indexes };
    const fired = launchRuleFindings(ctx, item.ruleId);
    if (item.expectSilent) assert.equal(fired.length, 0, `${item.id}:${fired.map((finding) => finding.exactQuote).join("|")}`);
    else assert.ok(fired.length > 0, item.id);
  }
  const french = await analyzeProof(await docxWithLang("The Company shall act under Clause 99.2.", "fr-FR"));
  const ctx = { source: french.source, extracted: french.extracted, sourceSha256: french.sourceSha256, indexes: french.indexes };
  assert.equal(launchRuleFindings(ctx, "references.missing_target").length, 0);
});
