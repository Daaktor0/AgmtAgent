import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeProof } from "../../proof/launch.ts";
import { TYPO_ALLOWLIST } from "../../proof/typo-allowlist.ts";
import {
  HELD_OUT_DOCUMENTS,
  heldOutBytes,
  revisionHeldOutDocument,
  splitRunSpellingDocument,
  tableSpacingDocument,
} from "./held-out-generalisation.ts";
import { ruleMetric, wilsonInterval } from "./metrics.ts";

test("held-out documents generalise spelling and punctuation without allowlist stuffing", async () => {
  const byRule = new Map<string, { truePositive: number; falsePositive: number; falseNegative: number }>();
  let cleanFalseAlerts = 0;
  let cleanDocs = 0;

  function bucket(ruleId: string) {
    const current = byRule.get(ruleId) ?? { truePositive: 0, falsePositive: 0, falseNegative: 0 };
    byRule.set(ruleId, current);
    return current;
  }

  for (const doc of HELD_OUT_DOCUMENTS) {
    for (const expected of doc.expected) {
      assert.equal(expected.quote.toLowerCase() in TYPO_ALLOWLIST, false, `${doc.id}:${expected.quote}`);
    }
    const analysis = await analyzeProof(await heldOutBytes(doc));
    const language = analysis.plan.findings.filter((finding) =>
      finding.ruleId === "spelling.dictionary"
      || finding.ruleId.startsWith("punctuation.")
      || finding.ruleId.startsWith("spacing.")
    );
    for (const expected of doc.expected) {
      const hit = language.find((finding) => finding.ruleId === expected.ruleId && finding.exactQuote === expected.quote);
      const spellingActionAccepted = expected.ruleId === "spelling.dictionary"
        && hit?.kind === "correction"
        && hit.replacement !== null;
      if (!hit || (hit.kind !== expected.kind && !spellingActionAccepted)) {
        bucket(expected.ruleId).falseNegative += 1;
      } else {
        bucket(expected.ruleId).truePositive += 1;
        assert.equal(hit.primarySpan.textEnd - hit.primarySpan.textStart, expected.quote.length, `${doc.id} anchor`);
      }
    }
    for (const finding of language) {
      if (doc.forbiddenQuotes.includes(finding.exactQuote)) {
        bucket(finding.ruleId).falsePositive += 1;
      } else if (!doc.expected.some((expected) => expected.ruleId === finding.ruleId && expected.quote === finding.exactQuote)) {
        if (finding.ruleId === "spelling.dictionary" || finding.ruleId.startsWith("punctuation.") || finding.ruleId.startsWith("spacing.")) {
          bucket(finding.ruleId).falsePositive += 1;
        }
      }
    }
    if (doc.genre === "clean") {
      cleanDocs += 1;
      const extras = language.filter((finding) =>
        !doc.expected.some((expected) => expected.ruleId === finding.ruleId && expected.quote === finding.exactQuote)
      );
      cleanFalseAlerts += extras.length;
      assert.equal(extras.length, 0, `${doc.id}:${extras.map((finding) => `${finding.ruleId}:${finding.exactQuote}`).join("|")}`);
    }
  }

  const table = await analyzeProof(await tableSpacingDocument());
  assert.equal(table.plan.findings.some((finding) => finding.ruleId === "spacing.accidental"), false);

  const split = await analyzeProof(await splitRunSpellingDocument());
  const calender = split.plan.findings.find((finding) => finding.exactQuote === "calender");
  assert.equal(calender?.ruleId, "spelling.dictionary");
  assert.equal(calender?.kind, "correction");
  assert.equal(calender?.replacement, "calendar");

  const revision = await analyzeProof(await revisionHeldOutDocument());
  assert.equal(revision.plan.findings.some((finding) => finding.exactQuote === "occured"), false);
  assert.ok(revision.gaps.includes("prior_revision"));
  assert.equal(revision.coverage, "limited");
  assert.ok(revision.plan.findings.some((finding) => finding.exactQuote === "seperate"));

  const repeat = await analyzeProof(await heldOutBytes(HELD_OUT_DOCUMENTS.find((doc) => doc.id === "repeat_misspelling")!));
  const enviroment = repeat.plan.findings.filter((finding) => finding.exactQuote === "enviroment");
  assert.equal(enviroment.length, 10);
  assert.ok(enviroment.every((finding) => finding.ruleId === "spelling.dictionary" && finding.kind === "correction" && finding.replacement === "environment"));

  const report = [...byRule.entries()].map(([ruleId, counts]) => {
    const metric = ruleMetric({ ruleId, ...counts });
    const precisionN = counts.truePositive + counts.falsePositive;
    return {
      ...metric,
      independentDocuments: HELD_OUT_DOCUMENTS.length,
      wilsonPrecision: wilsonInterval(counts.truePositive, precisionN),
    };
  });
  assert.ok(report.some((row) => row.ruleId === "spelling.dictionary" && row.truePositive >= 1 && (row.recall ?? 0) >= 0.9), JSON.stringify(report));
  assert.ok(report.some((row) => row.ruleId === "punctuation.duplicate_mark" && row.falsePositive === 0), JSON.stringify(report));
  assert.equal(cleanDocs >= 3, true);
  assert.equal(cleanFalseAlerts, 0);
  assert.equal(HELD_OUT_DOCUMENTS.length >= 8, true);
});
