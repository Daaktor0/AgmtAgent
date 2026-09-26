/**
 * Independently labelled PEE-13 date and words-and-figures cases.
 */
import { createHash } from "node:crypto";
import type { LaunchRuleId } from "../../proof/contracts.ts";
import type { BetaRuleCase } from "./beta-rule-cases.ts";
import type { SplitBucket } from "./beta-rule-denominators.ts";

export const PEE13_CASES_VERSION = "proof-pee13-cases-v1";
export const PEE13_SUPPORTED_RECALL = 0.9;
export const PEE13_COMMENT_PRECISION = 0.98;
export const PEE13_MIN_SAMPLES = 100;

const FAMILIES = ["sha", "ssa", "nda", "employment", "letter"] as const;
const INVALID_DATES = [
  "31 April 2026",
  "31 June 2026",
  "31 September 2026",
  "31 November 2026",
  "30 February 2026",
  "31 February 2026",
  "29 February 2026",
  "2026-04-31",
  "2026-02-30",
  "31 Apr 2026",
] as const;
const VALID_DATES = [
  "23 April 2026",
  "1 January 2026",
  "29 February 2024",
  "31 January 2026",
  "30 April 2026",
  "2026-04-30",
  "15 June 2026",
  "31 July 2026",
  "31 August 2026",
  "31 December 2026",
] as const;

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function splitBucket(familyId: string): SplitBucket {
  const slot = Number.parseInt(sha(familyId).slice(0, 8), 16) % 10;
  if (slot < 6) return "development";
  if (slot < 8) return "calibration";
  return "held_out";
}

export function pee13DatePositives(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => {
    const date = INVALID_DATES[i % INVALID_DATES.length]!;
    return {
      id: `pee13_date_${family}_${i}`,
      ruleId: "figures.date_invalid" as const,
      kind: "positive" as const,
      paragraphs: [`The ${family} completion date is ${date} for item ${i + 1}.`],
      quote: date,
      replacement: null,
      action: "comment" as const,
      rationale: `Calendar-invalid date in ${family}.`,
    };
  }));
}

export function pee13DateTraps(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => [
    ...Array.from({ length: 50 }, (_, i) => ({
      id: `pee13_date_valid_${family}_${i}`,
      ruleId: "figures.date_invalid" as const,
      kind: "negative" as const,
      paragraphs: [`The ${family} completion date is ${VALID_DATES[i % VALID_DATES.length]!} for item ${i + 1}.`],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "A valid calendar date is not invalid.",
    })),
    ...Array.from({ length: 50 }, (_, i) => ({
      id: `pee13_date_ambiguous_${family}_${i}`,
      ruleId: "figures.date_invalid" as const,
      kind: "negative" as const,
      paragraphs: [`The ${family} notice date is 03/04/202${i % 10} under this document.`],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Numeric dates with both parts ≤12 are ambiguous, never invalid.",
    })),
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `pee13_date_quoted_${family}_${i}`,
      ruleId: "figures.date_invalid" as const,
      kind: "negative" as const,
      paragraphs: [`The Company shall record that "31 April 2026" was used (${family} ${i}).`],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Quoted invalid dates are excluded.",
    })),
  ]);
}

export function pee13WordsPositives(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => {
    const quote = i % 2 === 0 ? "USD 10,000 (fifteen thousand US dollars)" : "15 (sixteen)";
    return {
      id: `pee13_words_${family}_${i}`,
      ruleId: "figures.words_figures_mismatch" as const,
      kind: "positive" as const,
      paragraphs: [`The ${family} payment is ${quote} under item ${i + 1}.`],
      quote,
      replacement: null,
      action: "comment" as const,
      rationale: `Bound words/figures mismatch in ${family}.`,
    };
  }));
}

export function pee13WordsTraps(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => [
    ...Array.from({ length: 50 }, (_, i) => ({
      id: `pee13_words_match_${family}_${i}`,
      ruleId: "figures.words_figures_mismatch" as const,
      kind: "negative" as const,
      paragraphs: [`The ${family} payment is USD 10,000 (ten thousand US dollars) under item ${i + 1}.`],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Matching bound pair.",
    })),
    ...Array.from({ length: 40 }, (_, i) => ({
      id: `pee13_words_days_${family}_${i}`,
      ruleId: "figures.words_figures_mismatch" as const,
      kind: "negative" as const,
      paragraphs: [`The ${family} period is one hundred (100) days (${i}).`],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Matching days pair.",
    })),
    ...Array.from({ length: 40 }, (_, i) => ({
      id: `pee13_words_range_${family}_${i}`,
      ruleId: "figures.words_figures_mismatch" as const,
      kind: "negative" as const,
      paragraphs: [`The ${family} range is USD 10,000–20,000 (ten thousand to twenty thousand) (${i}).`],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Ranges are excluded.",
    })),
  ]);
}

export function pee13Adversarial(): { id: string; ruleId: LaunchRuleId; paragraphs: string[]; tableRows?: string[][]; expectSilent: boolean; note: string }[] {
  return [
    {
      id: "pee13_adv_ambiguous",
      ruleId: "figures.date_invalid",
      paragraphs: ["The completion date is 03/04/2026."],
      expectSilent: true,
      note: "ambiguous numeric date",
    },
    {
      id: "pee13_adv_table",
      ruleId: "figures.words_figures_mismatch",
      paragraphs: ["The Company shall pay the amount."],
      tableRows: [["USD 10,000 (fifteen thousand)"]],
      expectSilent: true,
      note: "table figures are excluded",
    },
    {
      id: "pee13_adv_currency",
      ruleId: "figures.words_figures_mismatch",
      paragraphs: ["The price is USD 10,000 (INR ten thousand)."],
      expectSilent: false,
      note: "bound currency mismatch",
    },
  ];
}

export function pee13Denominators() {
  return {
    version: PEE13_CASES_VERSION,
    families: [...FAMILIES],
    perRule: {
      "figures.date_invalid": {
        uniquePositiveFamilies: pee13DatePositives().length,
        uniqueNegativeFamilies: pee13DateTraps().length,
        heldOutPositive: pee13DatePositives().filter((item) => splitBucket(item.id) === "held_out").length,
        heldOutNegative: pee13DateTraps().filter((item) => splitBucket(item.id) === "held_out").length,
        independence: "Each ID is one (family, date) pair. Invalid-date strings rotate a closed list; they are not independent calendars.",
      },
      "figures.words_figures_mismatch": {
        uniquePositiveFamilies: pee13WordsPositives().length,
        uniqueNegativeFamilies: pee13WordsTraps().length,
        heldOutPositive: pee13WordsPositives().filter((item) => splitBucket(item.id) === "held_out").length,
        heldOutNegative: pee13WordsTraps().filter((item) => splitBucket(item.id) === "held_out").length,
        independence: "Each ID is one (family, pair) pair on two mismatch templates.",
      },
    },
  };
}
