/**
 * Independently labelled PEE-01 cases.
 *
 * Detection, anchoring and output-action are recorded separately. Families are
 * unique sentences, not packed repeats. Mixed-format employment_typo_split is
 * not in this file and stays labelled in ENGINE_BASELINE_MISSES.
 */
import { TYPO_ALLOWLIST, DUPLICATE_FUNCTION_WORDS } from "../../proof/typo-allowlist.ts";
import type { LaunchRuleId } from "../../proof/contracts.ts";
import type { BetaRuleCase } from "./beta-rule-cases.ts";

export const PEE01_CASES_VERSION = "proof-pee01-cases-v1";

const FAMILIES = [
  { id: "sha", frame: (payload: string) => `The Company shall ${payload} under this Shareholders Agreement.` },
  { id: "ssa", frame: (payload: string) => `The Investor will ${payload} before completion of the subscription.` },
  { id: "nda", frame: (payload: string) => `The Recipient must ${payload} in writing under this NDA.` },
  { id: "employment", frame: (payload: string) => `The Employee may ${payload} without delay under the employment contract.` },
  { id: "letter", frame: (payload: string) => `We should ${payload} within ten days of this letter.` },
] as const;

function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function pee01TypoPositives(): BetaRuleCase[] {
  return Object.entries(TYPO_ALLOWLIST).flatMap(([typo, replacement]) => FAMILIES.map((family) => ({
    id: `pee01_typo_${family.id}_${typo}`,
    ruleId: "language.typo_allowlist" as const,
    kind: "positive" as const,
    paragraphs: [family.frame(`${typo} the notice`)],
    quote: typo,
    replacement,
    action: "track_replace" as const,
    rationale: `Allowlisted misspelling ${typo} in ${family.id} ordinary prose.`,
  })));
}

export function pee01TypoTraps(): BetaRuleCase[] {
  return Object.entries(TYPO_ALLOWLIST).flatMap(([typo]) => {
    const named = title(typo);
    return [
      {
        id: `pee01_typo_quoted_${typo}`,
        ruleId: "language.typo_allowlist" as const,
        kind: "negative" as const,
        paragraphs: [`The Company shall use "${typo}" in the quoted message and it will apply.`],
        quote: null,
        replacement: null,
        action: "none" as const,
        rationale: "Quoted misspelling is not an ordinary-prose correction.",
      },
      {
        id: `pee01_typo_party_${typo}`,
        ruleId: "language.typo_allowlist" as const,
        kind: "negative" as const,
        paragraphs: [
          `This Agreement is between ${named} Private Limited ("${named}") and Example Limited.`,
          `${named} shall deliver the notice to ${named} Private Limited.`,
        ],
        quote: null,
        replacement: null,
        action: "none" as const,
        rationale: "Party-name token is not an ordinary-prose typo.",
      },
      {
        id: `pee01_typo_url_${typo}`,
        ruleId: "language.typo_allowlist" as const,
        kind: "negative" as const,
        paragraphs: [`The Company shall use https://example.com/${typo} and it will apply.`],
        quote: null,
        replacement: null,
        action: "none" as const,
        rationale: "URL path tokens are excluded.",
      },
      {
        id: `pee01_typo_email_${typo}`,
        ruleId: "language.typo_allowlist" as const,
        kind: "negative" as const,
        paragraphs: [`The Company shall send ${typo}@example.com and it will apply.`],
        quote: null,
        replacement: null,
        action: "none" as const,
        rationale: "Email local-parts are excluded.",
      },
      {
        id: `pee01_typo_defined_${typo}`,
        ruleId: "language.typo_allowlist" as const,
        kind: "negative" as const,
        paragraphs: [`"${named}" means a defined party. The Company shall notify ${named} in writing.`],
        quote: null,
        replacement: null,
        action: "none" as const,
        rationale: "A title-case defined-term or party label is excluded; lowercase ordinary uses are not skipped merely because the same letters appear in a name.",
      },
    ] satisfies BetaRuleCase[];
  });
}

export function pee01DuplicatePositives(): BetaRuleCase[] {
  return DUPLICATE_FUNCTION_WORDS.flatMap((word) => FAMILIES.flatMap((family) => ([
    {
      id: `pee01_dup_space_${family.id}_${word}`,
      ruleId: "language.duplicate_word" as const,
      kind: "positive" as const,
      paragraphs: [family.frame(`pay ${word} ${word} amount`)],
      quote: word,
      replacement: "",
      action: "track_delete" as const,
      rationale: `Space-separated duplicate ${word} in ${family.id}; second token only.`,
    },
    {
      id: `pee01_dup_tab_${family.id}_${word}`,
      ruleId: "language.duplicate_word" as const,
      kind: "positive" as const,
      paragraphs: [family.frame(`pay ${word}\t${word} amount`)],
      quote: word,
      replacement: "",
      action: "track_delete" as const,
      rationale: `Tab-separated duplicate ${word} in ${family.id}; second token only.`,
    },
    {
      id: `pee01_dup_nbsp_${family.id}_${word}`,
      ruleId: "language.duplicate_word" as const,
      kind: "positive" as const,
      paragraphs: [family.frame(`pay ${word}\u00a0${word} amount`)],
      quote: word,
      replacement: "",
      action: "track_delete" as const,
      rationale: `NBSP-separated duplicate ${word} in ${family.id}; second token only.`,
    },
  ])));
}

export function pee01DuplicateTraps(): BetaRuleCase[] {
  return [
    {
      id: "pee01_dup_that_that",
      ruleId: "language.duplicate_word",
      kind: "negative",
      paragraphs: ["The Company confirms that that notice is valid and it had had enough time."],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Grammatical that-that and had-had stay excluded.",
    },
    {
      id: "pee01_dup_quoted",
      ruleId: "language.duplicate_word",
      kind: "negative",
      paragraphs: ['The Company shall use "the the" as a quoted example and it will apply.'],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Quoted repetition is not an ordinary-prose deletion.",
    },
    {
      id: "pee01_dup_party",
      ruleId: "language.duplicate_word",
      kind: "negative",
      paragraphs: [
        'This Agreement is between The The Holdings Limited ("Party") and Example Limited.',
        "Party shall deliver the notice.",
      ],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Party-block prose is excluded.",
    },
  ];
}

const PLACEHOLDER_TOKENS = [
  "[●]", "[TBD]", "[insert date]", "[insert name]", "[insert amount]", "[insert address]",
  "[…]", "[insert additional warranties]", "[TBD: fee]", "[draft clause]",
  "________", "XX.XX", "‹amount›", "{insert date}", "{name}",
] as const;

export function pee01PlaceholderPositives(): BetaRuleCase[] {
  return PLACEHOLDER_TOKENS.flatMap((token) => FAMILIES.map((family) => ({
    id: `pee01_ph_${family.id}_${token.replaceAll(/[^A-Za-z0-9]+/g, "_")}`,
    ruleId: "completion.placeholder" as const,
    kind: "positive" as const,
    paragraphs: [family.frame(`deliver the ${token}`)],
    quote: token,
    replacement: null,
    action: "comment" as const,
    rationale: `Unfinished drafting marker ${token} in ${family.id}.`,
  })));
}

export function pee01PlaceholderTraps(): BetaRuleCase[] {
  return [
    {
      id: "pee01_ph_numeric_brackets",
      ruleId: "completion.placeholder",
      kind: "negative",
      paragraphs: ["The formula uses [12] as a reference value in Schedule 1."],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Numeric brackets are not unfinished drafting placeholders.",
    },
    {
      id: "pee01_ph_quoted_optional",
      ruleId: "completion.placeholder",
      kind: "negative",
      paragraphs: ['"The Parties may insert [optional wording] in Annex 1."'],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Quoted optional wording is not a placeholder.",
    },
    {
      id: "pee01_ph_signature_line",
      ruleId: "completion.placeholder",
      kind: "negative",
      paragraphs: ["IN WITNESS whereof the parties have executed this Agreement.", "________________"],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Signature underscores after IN WITNESS are not placeholders.",
    },
    {
      id: "pee01_ph_defined_brackets",
      ruleId: "completion.placeholder",
      kind: "negative",
      paragraphs: ['"Company" means Example Limited. The Company shall deliver the notice.'],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "A quoted defined term is not a placeholder.",
    },
  ];
}

export function pee01Adversarial(): { id: string; ruleId: LaunchRuleId; paragraphs: string[]; expectSilent: boolean; note: string }[] {
  return [
    {
      id: "pee01_adv_quoted_typo",
      ruleId: "language.typo_allowlist",
      paragraphs: ['The Company shall use "recieve" and it will apply.'],
      expectSilent: true,
      note: "quotation containing the error",
    },
    {
      id: "pee01_adv_party_typo",
      ruleId: "language.typo_allowlist",
      paragraphs: ['This Agreement is between Recieve Limited ("Recieve") and Example Limited. Recieve shall deliver the notice.'],
      expectSilent: true,
      note: "party block",
    },
    {
      id: "pee01_adv_table_placeholder",
      ruleId: "completion.placeholder",
      paragraphs: ["The Company shall deliver the [●] on the Completion Date."],
      expectSilent: false,
      note: "table/body placeholder still in scope when the paragraph is ordinary prose",
    },
    {
      id: "pee01_adv_tehran",
      ruleId: "language.typo_allowlist",
      paragraphs: ["The Company shall visit Tehran and it will apply."],
      expectSilent: true,
      note: "teh inside Tehran is not a whole-token match",
    },
  ];
}

export function pee01Denominators() {
  const typoPos = pee01TypoPositives();
  const typoNeg = pee01TypoTraps();
  const dupPos = pee01DuplicatePositives();
  const dupNeg = pee01DuplicateTraps();
  const phPos = pee01PlaceholderPositives();
  const phNeg = pee01PlaceholderTraps();
  return {
    version: PEE01_CASES_VERSION,
    families: FAMILIES.map((family) => family.id),
    perRule: {
      "language.typo_allowlist": {
        uniquePositiveFamilies: new Set(typoPos.map((item) => item.paragraphs[0])).size,
        uniqueNegativeFamilies: new Set(typoNeg.map((item) => item.paragraphs.join("\n"))).size,
        generatedPositiveIds: typoPos.length,
        generatedNegativeIds: typoNeg.length,
      },
      "language.duplicate_word": {
        uniquePositiveFamilies: new Set(dupPos.map((item) => item.paragraphs[0])).size,
        uniqueNegativeFamilies: new Set(dupNeg.map((item) => item.paragraphs.join("\n"))).size,
        generatedPositiveIds: dupPos.length,
        generatedNegativeIds: dupNeg.length,
      },
      "completion.placeholder": {
        uniquePositiveFamilies: new Set(phPos.map((item) => item.paragraphs[0])).size,
        uniqueNegativeFamilies: new Set(phNeg.map((item) => item.paragraphs.join("\n"))).size,
        generatedPositiveIds: phPos.length,
        generatedNegativeIds: phNeg.length,
      },
    },
  };
}
