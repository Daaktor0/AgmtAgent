/**
 * Honest PWC-15 corpus denominators.
 *
 * Generated case IDs, unique template families, packed execution groups and
 * held-out labels are separate counts. Packed or repeated variants are not
 * independent evidence. Mixed-format output-action remains labelled, not
 * rewritten to pass.
 */
import { createHash } from "node:crypto";
import {
  BETA_RULE_CASES_VERSION,
  allCommentCases,
  correctionCases,
  duplicateWordPositives,
  namedRecieveTraps,
} from "./beta-rule-cases.ts";

export const BETA_RULE_DENOMINATORS_VERSION = "proof-beta-rule-denominators-v1";

export type SplitBucket = "development" | "calibration" | "held_out";

export type RuleDenominator = {
  ruleId: string;
  generatedPositiveIds: number;
  generatedNegativeIds: number;
  uniquePositiveFamilies: number;
  uniqueNegativeFamilies: number;
  independence: string;
};

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function splitBucket(familyId: string): SplitBucket {
  const n = Number.parseInt(sha(familyId).slice(0, 8), 16);
  const slot = n % 10;
  if (slot < 6) return "development";
  if (slot < 8) return "calibration";
  return "held_out";
}

export function uniqueTypoSentences(): string[] {
  return [...new Set(correctionCases().map((item) => item.paragraphs[0]!))];
}

export function uniqueDuplicateWordFamilies(): string[] {
  return [...new Set(duplicateWordPositives().map((item) => item.quote!))];
}

function commentFamilyKey(paragraphs: readonly string[]): string {
  return paragraphs
    .map((paragraph) => paragraph.replace(/\d+/g, "#").replace(/Notice#/g, "Notice#"))
    .join("\n");
}

export function betaRuleDenominators() {
  const typos = correctionCases();
  const uniqueTypos = uniqueTypoSentences();
  const duplicateWords = duplicateWordPositives();
  const comments = allCommentCases();
  const traps = namedRecieveTraps();

  const commentRules = [
    "completion.placeholder",
    "references.missing_target",
    "references.duplicate_number",
    "definitions.duplicate",
  ] as const;

  const perRule: RuleDenominator[] = [
    {
      ruleId: "language.typo_allowlist",
      generatedPositiveIds: typos.length,
      generatedNegativeIds: traps.filter((item) => item.ruleId === "language.typo_allowlist").length,
      uniquePositiveFamilies: uniqueTypos.length,
      uniqueNegativeFamilies: traps.filter((item) => item.ruleId === "language.typo_allowlist").length,
      independence:
        "Four allowlisted spellings crossed with locked verb/object/frame templates; repeated IDs are not independent documents.",
    },
    {
      ruleId: "language.duplicate_word",
      generatedPositiveIds: duplicateWords.length,
      generatedNegativeIds: traps.filter((item) => item.ruleId === "language.duplicate_word").length,
      uniquePositiveFamilies: uniqueDuplicateWordFamilies().length,
      uniqueNegativeFamilies: traps.filter((item) => item.ruleId === "language.duplicate_word").length,
      independence: "One positive family per allowlisted function word; tab and grammatical traps are separate.",
    },
    ...commentRules.map((ruleId) => {
      const positives = comments.positives.filter((item) => item.ruleId === ruleId);
      const negatives = comments.negatives.filter((item) => item.ruleId === ruleId);
      const uniquePos = new Set(positives.map((item) => commentFamilyKey(item.paragraphs)));
      const uniqueNeg = new Set(negatives.map((item) => commentFamilyKey(item.paragraphs)));
      return {
        ruleId,
        generatedPositiveIds: positives.length,
        generatedNegativeIds: negatives.length,
        uniquePositiveFamilies: uniquePos.size,
        uniqueNegativeFamilies: uniqueNeg.size,
        independence: "100 generated IDs per side; many share one sentence template with a cycling token or index.",
      };
    }),
  ];

  const familyIds = [
    ...uniqueTypos.map((sentence) => `typo:${sentence}`),
    ...uniqueDuplicateWordFamilies().map((quote) => `dup:${quote}`),
    ...comments.positives.map((item) => `${item.ruleId}:pos:${commentFamilyKey(item.paragraphs)}`),
    ...comments.negatives.map((item) => `${item.ruleId}:neg:${commentFamilyKey(item.paragraphs)}`),
  ];
  const uniqueFamilies = [...new Set(familyIds)];
  const split = { development: 0, calibration: 0, held_out: 0 };
  for (const family of uniqueFamilies) split[splitBucket(family)] += 1;

  return {
    version: BETA_RULE_DENOMINATORS_VERSION,
    casesVersion: BETA_RULE_CASES_VERSION,
    generatedCaseIds: {
      typoCorrections: typos.length,
      duplicateWordPositives: duplicateWords.length,
      commentPositives: comments.positives.length,
      commentNegatives: comments.negatives.filter((item) => commentRules.includes(item.ruleId as typeof commentRules[number])).length,
      namedTraps: traps.length,
    },
    uniqueTemplateFamilies: {
      typoSentences: uniqueTypos.length,
      duplicateWord: uniqueDuplicateWordFamilies().length,
      commentPositive: new Set(comments.positives.map((item) => `${item.ruleId}:${commentFamilyKey(item.paragraphs)}`)).size,
      commentNegative: new Set(
        comments.negatives
          .filter((item) => commentRules.includes(item.ruleId as typeof commentRules[number]))
          .map((item) => `${item.ruleId}:${commentFamilyKey(item.paragraphs)}`),
      ).size,
    },
    packing: {
      usedForExecutionSpeed: true,
      independentEvidence: false,
      packSizes: {
        typoAndDuplicateWord: 25,
        commentPositives: 10,
        placeholderAndMissingTargetNegatives: 10,
        duplicateNumberAndDefinitionNegatives: 1,
      },
      note: "A packed document is one execution, not N independent documents.",
    },
    heldOut: {
      method: "sha256 of unique family id, 60/20/20 development/calibration/held_out",
      uniqueFamilyCount: uniqueFamilies.length,
      split,
      evaluatedIndependently: false,
      note: "Labels exist for a future frozen holdout. Current engine tests still run every generated ID, including would-be held-out families.",
    },
    perRule,
    mixedFormat: {
      fixtureId: "employment_typo_split",
      expectedAction: "track_replace",
      engineOutputAction: "comment",
      labelledMiss: "employment_typo_split::language.typo_allowlist::recieve",
      rewrittenToPass: false,
      reason: "Mixed rPr is not a safe tracked change; detection and anchoring may pass while output-action stays comment.",
    },
  };
}
