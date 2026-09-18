import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDocx } from "../../docx.ts";
import { analyzeProof, validateLaunchFinding } from "../../proof/launch.ts";
import { LAUNCH_RULE_BY_ID } from "../../proof/registry.ts";
import { canPromote, ruleMetric } from "./metrics.ts";
import { pee20Positives, pee20Traps, PEE20_COMMENT_PRECISION, PEE20_MIN_SAMPLES, PEE20_SUPPORTED_RECALL } from "./pee20-cases.ts";
import type { BetaRuleCase } from "./beta-rule-cases.ts";

function pack(cases: readonly BetaRuleCase[], size: number): BetaRuleCase[][] {
  const groups: BetaRuleCase[][] = [];
  for (let i = 0; i < cases.length; i += size) groups.push(cases.slice(i, i + size));
  return groups;
}

const SAFE_REPLACEMENTS: Readonly<Record<string, string>> = Object.freeze({
  goverment: "government",
  enviroment: "environment",
  langauge: "language",
  docuement: "document",
  agreemnet: "agreement",
  commerical: "commercial",
  obilgation: "obligation",
  certifcate: "certificate",
  apendix: "appendix",
  paymnet: "payment",
  reciept: "receipt",
  tommorrow: "tomorrow",
  truely: "truly",
  prefered: "preferred",
  transfered: "transferred",
  languge: "language",
});

test("PEE-20 dictionary spelling preserves detection and applies the reviewed action contract", async () => {
  const positives = pee20Positives();
  const traps = pee20Traps();
  assert.ok(positives.length >= PEE20_MIN_SAMPLES / 2);
  assert.ok(traps.length >= PEE20_MIN_SAMPLES / 2);
  let truePositive = 0;
  let falseNegative = 0;
  let falsePositive = 0;
  const detectionMisses: string[] = [];
  const actionMisses: string[] = [];
  for (const item of positives) {
    const analysis = await analyzeProof(await buildDocx(item.paragraphs));
    const detected = analysis.plan.findings.find((finding) => finding.ruleId === item.ruleId && finding.exactQuote === item.quote);
    if (!detected) {
      falseNegative += 1;
      detectionMisses.push(item.id);
      continue;
    }
    truePositive += 1;
    const expectedReplacement = SAFE_REPLACEMENTS[item.quote ?? ""];
    if (expectedReplacement) {
      if (detected.kind !== "correction" || detected.replacement !== expectedReplacement) actionMisses.push(item.id);
    } else if (detected.kind !== "comment" || detected.replacement !== null) {
      actionMisses.push(item.id);
    }
    validateLaunchFinding(analysis, detected);
  }
  for (const group of pack(traps, 1)) {
    const analysis = await analyzeProof(await buildDocx(group.flatMap((item) => item.paragraphs)));
    for (const item of group) {
      const fired = analysis.plan.findings.filter((finding) => finding.ruleId === item.ruleId);
      if (fired.length) {
        falsePositive += 1;
        detectionMisses.push(`${item.id}:${fired.map((finding) => finding.exactQuote).join("|")}`);
      }
    }
  }
  const metric = ruleMetric({ ruleId: "spelling.dictionary", truePositive, falsePositive, falseNegative });
  assert.deepEqual(actionMisses, [], "spelling action");
  assert.equal(
    canPromote(metric, { precision: PEE20_COMMENT_PRECISION, recall: PEE20_SUPPORTED_RECALL, minSamples: PEE20_MIN_SAMPLES }),
    true,
    `p=${metric.precision} r=${metric.recall} tp=${truePositive} fp=${falsePositive} fn=${falseNegative} misses=${detectionMisses.slice(0, 12).join(",")}`,
  );
  assert.equal(LAUNCH_RULE_BY_ID["spelling.dictionary"].defaultEnabled, true);
  assert.equal(LAUNCH_RULE_BY_ID["spelling.dictionary"].actionPolicy, "correction");
});
