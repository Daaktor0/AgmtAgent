import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDocx } from "../../docx.ts";
import { analyzeProof, validateLaunchFinding } from "../../proof/launch.ts";
import { LAUNCH_RULE_BY_ID } from "../../proof/registry.ts";
import { canPromote, ruleMetric } from "./metrics.ts";
import {
  pee21Cases,
  PEE21_COMMENT_PRECISION,
  PEE21_CORRECTION_PRECISION,
  PEE21_MIN_SAMPLES,
  PEE21_SUPPORTED_RECALL,
} from "./pee21-cases.ts";
import type { BetaRuleCase } from "./beta-rule-cases.ts";

function pack(cases: readonly BetaRuleCase[], size: number): BetaRuleCase[][] {
  const groups: BetaRuleCase[][] = [];
  for (let i = 0; i < cases.length; i += size) groups.push(cases.slice(i, i + size));
  return groups;
}

function findingFor(analysis: Awaited<ReturnType<typeof analyzeProof>>, item: BetaRuleCase) {
  return analysis.plan.findings.find((finding) => {
    if (finding.ruleId !== item.ruleId || finding.exactQuote !== item.quote) return false;
    const paragraph = analysis.source.paragraphs.find((candidate) =>
      JSON.stringify(candidate.paragraphPath) === JSON.stringify(finding.primarySpan.paragraphPath)
    );
    return paragraph?.text === item.paragraphs[0];
  });
}

test("PEE-21 punctuation and spacing rules meet promotion gates", async () => {
  for (const row of pee21Cases()) {
    assert.ok(row.positives.length >= PEE21_MIN_SAMPLES, row.ruleId);
    assert.ok(row.traps.length >= PEE21_MIN_SAMPLES, row.ruleId);
    let truePositive = 0;
    let falseNegative = 0;
    let falsePositive = 0;
    const detectionMisses: string[] = [];
    const actionMisses: string[] = [];
    for (const group of pack(row.positives, 10)) {
      const analysis = await analyzeProof(await buildDocx(group.flatMap((item) => item.paragraphs)));
      for (const item of group) {
        const detected = findingFor(analysis, item);
        if (!detected) {
          falseNegative += 1;
          detectionMisses.push(item.id);
          continue;
        }
        truePositive += 1;
        assert.equal(detected.primarySpan.textEnd - detected.primarySpan.textStart, item.quote!.length, item.id);
        if (item.action === "track_replace") {
          if (detected.kind !== "correction" || detected.replacement !== item.replacement) actionMisses.push(item.id);
        } else if (detected.kind !== "comment" || detected.replacement !== null) {
          actionMisses.push(item.id);
        }
        validateLaunchFinding(analysis, detected);
      }
    }
    for (const group of pack(row.traps, 10)) {
      const analysis = await analyzeProof(await buildDocx(group.flatMap((item) => item.paragraphs)));
      for (const item of group) {
        const fired = analysis.plan.findings.filter((finding) => {
          if (finding.ruleId !== item.ruleId) return false;
          const paragraph = analysis.source.paragraphs.find((candidate) =>
            JSON.stringify(candidate.paragraphPath) === JSON.stringify(finding.primarySpan.paragraphPath)
          );
          return paragraph?.text === item.paragraphs[0];
        });
        if (fired.length) {
          falsePositive += 1;
          detectionMisses.push(`${item.id}:${fired.map((finding) => finding.exactQuote).join("|")}`);
        }
      }
    }
    const metric = ruleMetric({ ruleId: row.ruleId, truePositive, falsePositive, falseNegative });
    const precision = row.action === "correction" ? PEE21_CORRECTION_PRECISION : PEE21_COMMENT_PRECISION;
    assert.deepEqual(actionMisses, [], `${row.ruleId} action`);
    assert.equal(
      canPromote(metric, { precision, recall: PEE21_SUPPORTED_RECALL, minSamples: PEE21_MIN_SAMPLES }),
      true,
      `${row.ruleId} p=${metric.precision} r=${metric.recall} tp=${truePositive} fp=${falsePositive} fn=${falseNegative} misses=${detectionMisses.slice(0, 12).join(",")}`,
    );
    assert.equal(LAUNCH_RULE_BY_ID[row.ruleId].defaultEnabled, true);
    assert.equal(LAUNCH_RULE_BY_ID[row.ruleId].actionPolicy, row.action === "correction" ? "correction" : "comment");
  }
});

test("unbalanced pairs spanning consecutive paragraphs are not flagged; a true miss still is", async () => {
  const balanced = await analyzeProof(await buildDocx([
    "The Buyer must pay the amount (including tax",
    "and insurance) immediately after completion.",
  ]));
  assert.equal(balanced.plan.findings.some((finding) => finding.ruleId === "punctuation.unbalanced_pair"), false);

  const unmatched = await analyzeProof(await buildDocx([
    "The Buyer must pay the amount (including extras immediately after completion.",
    "The Buyer must send the notice in writing today.",
  ]));
  assert.ok(unmatched.plan.findings.some((finding) => finding.ruleId === "punctuation.unbalanced_pair" && finding.exactQuote === "("));
});

test("quoted prose punctuation is a comment; short quoted examples stay silent", async () => {
  const literal = await analyzeProof(await buildDocx(['The Buyer must use "pay,," only as a quoted example.']));
  assert.equal(literal.plan.findings.some((finding) => finding.ruleId === "punctuation.duplicate_mark"), false);

  const prose = await analyzeProof(await buildDocx([
    'The letter states "The Buyer must pay,, the outstanding amount immediately after completion."',
  ]));
  const hit = prose.plan.findings.find((finding) => finding.ruleId === "punctuation.duplicate_mark" && finding.exactQuote === ",,");
  assert.equal(hit?.kind, "comment");
  assert.equal(hit?.replacement, null);
});
