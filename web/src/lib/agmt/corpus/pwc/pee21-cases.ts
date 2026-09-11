/**
 * Independently labelled PEE-21 punctuation/spacing cases.
 * Unique families, not packed repeats of one sentence.
 */
import type { LaunchRuleId } from "../../proof/contracts.ts";
import type { BetaRuleCase } from "./beta-rule-cases.ts";

export const PEE21_CASES_VERSION = "proof-pee21-cases-v1";
export const PEE21_CORRECTION_PRECISION = 0.995;
export const PEE21_COMMENT_PRECISION = 0.98;
export const PEE21_SUPPORTED_RECALL = 0.9;
export const PEE21_MIN_SAMPLES = 100;

const VERBS = [
  "pay", "send", "file", "keep", "issue", "return", "review", "deliver", "collect", "confirm",
] as const;
const OBJECTS = [
  "amount", "notice", "schedule", "invoice", "report", "letter", "certificate", "statement", "appendix", "record",
] as const;

function duplicatePositives(): BetaRuleCase[] {
  const marks = [",,", ";;", "..", "::"] as const;
  const frames = [
    (verb: string, mark: string, object: string) => `The Buyer must ${verb}${mark} the ${object} immediately.`,
    (verb: string, mark: string, object: string) => `Please ${verb}${mark} the ${object} before Friday.`,
    (verb: string, mark: string, object: string) => `Kindly ${verb}${mark} the ${object} after completion.`,
  ];
  return marks.flatMap((mark) => frames.flatMap((frame, frameIndex) => VERBS.map((verb, index) => ({
    id: `pee21_dup_${verb}_${mark.charCodeAt(0)}_${frameIndex}`,
    ruleId: "punctuation.duplicate_mark" as LaunchRuleId,
    kind: "positive" as const,
    paragraphs: [frame(verb, mark, OBJECTS[index]!)],
    quote: mark,
    replacement: mark[0]!,
    action: "track_replace" as const,
    rationale: `Repeated ${mark[0]} in ordinary prose.`,
  }))));
}

function duplicateTraps(): BetaRuleCase[] {
  const traps: BetaRuleCase[] = [
    { id: "pee21_dup_ellipsis_ascii", ruleId: "punctuation.duplicate_mark", kind: "negative", paragraphs: ["The Buyer must wait... then send the notice."], quote: null, replacement: null, action: "none", rationale: "ASCII ellipsis." },
    { id: "pee21_dup_ellipsis_unicode", ruleId: "punctuation.duplicate_mark", kind: "negative", paragraphs: ["The Buyer must wait… then send the notice."], quote: null, replacement: null, action: "none", rationale: "Unicode ellipsis." },
    { id: "pee21_dup_decimal", ruleId: "punctuation.duplicate_mark", kind: "negative", paragraphs: ["The Buyer must pay 3.14 percent of the price."], quote: null, replacement: null, action: "none", rationale: "Decimal." },
    { id: "pee21_dup_numbering", ruleId: "punctuation.duplicate_mark", kind: "negative", paragraphs: ["The Buyer must act under Clause 1.1 of this notice."], quote: null, replacement: null, action: "none", rationale: "Clause numbering." },
    { id: "pee21_dup_initials", ruleId: "punctuation.duplicate_mark", kind: "negative", paragraphs: ["The Buyer must write to J. R. Smith at the office."], quote: null, replacement: null, action: "none", rationale: "Initials." },
    { id: "pee21_dup_eg", ruleId: "punctuation.duplicate_mark", kind: "negative", paragraphs: ["The Buyer must use e.g. the attached form for this."], quote: null, replacement: null, action: "none", rationale: "Abbreviation dots." },
    { id: "pee21_dup_mr", ruleId: "punctuation.duplicate_mark", kind: "negative", paragraphs: ["The Buyer must notify Mr. Smith before completion."], quote: null, replacement: null, action: "none", rationale: "Title abbreviation." },
    { id: "pee21_dup_placeholder", ruleId: "punctuation.duplicate_mark", kind: "negative", paragraphs: ["The Buyer must complete [...] before completion."], quote: null, replacement: null, action: "none", rationale: "Placeholder ellipsis." },
    { id: "pee21_dup_quoted", ruleId: "punctuation.duplicate_mark", kind: "negative", paragraphs: ['The Buyer must use "pay,," only as a quoted example.'], quote: null, replacement: null, action: "none", rationale: "Quoted punctuation." },
    { id: "pee21_dup_url", ruleId: "punctuation.duplicate_mark", kind: "negative", paragraphs: ["The Buyer must visit https://example.com/pay..now for the file."], quote: null, replacement: null, action: "none", rationale: "URL excluded." },
  ];
  for (let i = 0; i < 90; i++) {
    traps.push({
      id: `pee21_dup_ok_${i}`,
      ruleId: "punctuation.duplicate_mark",
      kind: "negative",
      paragraphs: [`The Buyer must pay the amount ${i} immediately after completion.`],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Clean punctuation.",
    });
  }
  return traps;
}

function spacingPositives(): BetaRuleCase[] {
  return VERBS.flatMap((verb, verbIndex) => OBJECTS.map((object, objectIndex) => ({
    id: `pee21_space_${verb}_${object}`,
    ruleId: "spacing.accidental" as LaunchRuleId,
    kind: "positive" as const,
    paragraphs: [`The Buyer must ${verb}  the ${object} ${verbIndex}${objectIndex} immediately.`],
    quote: "  ",
    replacement: " ",
    action: "track_replace" as const,
    rationale: "ASCII double space between ordinary words.",
  }))).slice(0, 100);
}

function spacingTraps(): BetaRuleCase[] {
  const traps: BetaRuleCase[] = [
    { id: "pee21_space_single", ruleId: "spacing.accidental", kind: "negative", paragraphs: ["The Buyer must pay the amount immediately after completion."], quote: null, replacement: null, action: "none", rationale: "Single spaces." },
    { id: "pee21_space_after_stop", ruleId: "spacing.accidental", kind: "negative", paragraphs: ["The Buyer must stop.  Then the notice is sent in writing."], quote: null, replacement: null, action: "none", rationale: "Double space after a full stop." },
    { id: "pee21_space_nbsp", ruleId: "spacing.accidental", kind: "negative", paragraphs: ["The Buyer must pay\u00a0\u00a0the amount immediately after completion."], quote: null, replacement: null, action: "none", rationale: "Non-breaking spaces are preserved." },
  ];
  for (let i = 0; i < 97; i++) {
    traps.push({
      id: `pee21_space_ok_${i}`,
      ruleId: "spacing.accidental",
      kind: "negative",
      paragraphs: [`The Buyer must send the notice ${i} in writing before Friday.`],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Clean spacing.",
    });
  }
  return traps;
}

function spaceBeforePositives(): BetaRuleCase[] {
  const marks = [",", ".", ";", ":", ")"] as const;
  const frames = [
    (verb: string, mark: string, object: string) => mark === ")"
      ? `The Buyer must ${verb} the ${object} (including tax ) immediately.`
      : `The Buyer must ${verb} the ${object} immediately ${mark} please.`,
    (verb: string, mark: string, object: string) => mark === ")"
      ? `Please ${verb} the ${object} (including tax ) in writing today.`
      : `Please ${verb} the ${object} in writing ${mark} today.`,
  ];
  return marks.flatMap((mark) => frames.flatMap((frame, frameIndex) => VERBS.map((verb, index) => ({
    id: `pee21_before_${verb}_${mark === ")" ? "paren" : mark.charCodeAt(0)}_${frameIndex}`,
    ruleId: "punctuation.space_before" as LaunchRuleId,
    kind: "positive" as const,
    paragraphs: [frame(verb, mark, OBJECTS[index]!)],
    quote: ` ${mark}`,
    replacement: mark,
    action: "track_replace" as const,
    rationale: `Space before ${mark}.`,
  }))));
}

function spaceBeforeTraps(): BetaRuleCase[] {
  const traps: BetaRuleCase[] = [
    { id: "pee21_before_ok_comma", ruleId: "punctuation.space_before", kind: "negative", paragraphs: ["The Buyer must pay the amount, then send the notice."], quote: null, replacement: null, action: "none", rationale: "Normal comma." },
    { id: "pee21_before_ellipsis", ruleId: "punctuation.space_before", kind: "negative", paragraphs: ["The Buyer must wait . . . then send the notice."], quote: null, replacement: null, action: "none", rationale: "Spaced ellipsis." },
    { id: "pee21_before_quote", ruleId: "punctuation.space_before", kind: "negative", paragraphs: ['The Buyer must use "pay ," only as a quoted example.'], quote: null, replacement: null, action: "none", rationale: "Quoted space before comma." },
  ];
  for (let i = 0; i < 97; i++) {
    traps.push({
      id: `pee21_before_ok_${i}`,
      ruleId: "punctuation.space_before",
      kind: "negative",
      paragraphs: [`The Buyer must pay the amount, then file notice ${i}.`],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Clean space-before punctuation.",
    });
  }
  return traps;
}

function missingSpacePositives(): BetaRuleCase[] {
  const comma = VERBS.flatMap((verb, index) => [
    `The Buyer must ${verb},the ${OBJECTS[index]} immediately after completion.`,
    `Please ${verb},the ${OBJECTS[index]} before Friday this week.`,
    `Kindly ${verb},the ${OBJECTS[index]} after the meeting today.`,
  ].map((paragraph, frameIndex) => ({
    id: `pee21_missing_comma_${verb}_${frameIndex}`,
    ruleId: "punctuation.missing_space_after" as LaunchRuleId,
    kind: "positive" as const,
    paragraphs: [paragraph],
    quote: ",",
    replacement: ", ",
    action: "track_replace" as const,
    rationale: "Missing space after comma.",
  })));
  const stops = OBJECTS.flatMap((object, index) => [
    `The Buyer must ${VERBS[index]} the ${object} now.Then the file is closed.`,
    `Please ${VERBS[index]} the ${object} now.Then the file is closed.`,
    `Kindly ${VERBS[index]} the ${object} now.Then the file is closed.`,
  ].map((paragraph, frameIndex) => ({
    id: `pee21_missing_stop_${object}_${frameIndex}`,
    ruleId: "punctuation.missing_space_after" as LaunchRuleId,
    kind: "positive" as const,
    paragraphs: [paragraph],
    quote: ".",
    replacement: ". ",
    action: "track_replace" as const,
    rationale: "Missing space after a full stop.",
  })));
  const semis = VERBS.flatMap((verb, index) => [
    `The Buyer must ${verb};the ${OBJECTS[index]} remains due after completion.`,
    `Please ${verb};the ${OBJECTS[index]} remains due after completion.`,
  ].map((paragraph, frameIndex) => ({
    id: `pee21_missing_semi_${verb}_${frameIndex}`,
    ruleId: "punctuation.missing_space_after" as LaunchRuleId,
    kind: "positive" as const,
    paragraphs: [paragraph],
    quote: ";",
    replacement: "; ",
    action: "track_replace" as const,
    rationale: "Missing space after semicolon.",
  })));
  const colons = VERBS.flatMap((verb, index) => [
    `The Buyer must ${verb}:the ${OBJECTS[index]} remains due after completion.`,
    `Please ${verb}:the ${OBJECTS[index]} remains due after completion.`,
  ].map((paragraph, frameIndex) => ({
    id: `pee21_missing_colon_${verb}_${frameIndex}`,
    ruleId: "punctuation.missing_space_after" as LaunchRuleId,
    kind: "positive" as const,
    paragraphs: [paragraph],
    quote: ":",
    replacement: ": ",
    action: "track_replace" as const,
    rationale: "Missing space after colon.",
  })));
  return [...comma, ...stops, ...semis, ...colons];
}

function missingSpaceTraps(): BetaRuleCase[] {
  const traps: BetaRuleCase[] = [
    { id: "pee21_missing_eg", ruleId: "punctuation.missing_space_after", kind: "negative", paragraphs: ["The Buyer must use e.g. the attached form for this."], quote: null, replacement: null, action: "none", rationale: "e.g." },
    { id: "pee21_missing_ie", ruleId: "punctuation.missing_space_after", kind: "negative", paragraphs: ["The Buyer must pay i.e. the amount stated in writing."], quote: null, replacement: null, action: "none", rationale: "i.e." },
    { id: "pee21_missing_mr", ruleId: "punctuation.missing_space_after", kind: "negative", paragraphs: ["The Buyer must notify Mr. Smith before completion today."], quote: null, replacement: null, action: "none", rationale: "Mr." },
    { id: "pee21_missing_decimal", ruleId: "punctuation.missing_space_after", kind: "negative", paragraphs: ["The Buyer must pay 3.14 percent of the price now."], quote: null, replacement: null, action: "none", rationale: "Decimal." },
    { id: "pee21_missing_clause", ruleId: "punctuation.missing_space_after", kind: "negative", paragraphs: ["The Buyer must act under Clause 1.1 of this notice."], quote: null, replacement: null, action: "none", rationale: "Numbering." },
    { id: "pee21_missing_initials", ruleId: "punctuation.missing_space_after", kind: "negative", paragraphs: ["The Buyer must write to A.B. Smith before completion."], quote: null, replacement: null, action: "none", rationale: "Initials." },
    { id: "pee21_missing_ok", ruleId: "punctuation.missing_space_after", kind: "negative", paragraphs: ["The Buyer must pay, then send the notice in writing."], quote: null, replacement: null, action: "none", rationale: "Normal comma space." },
  ];
  for (let i = 0; i < 93; i++) {
    traps.push({
      id: `pee21_missing_ok_${i}`,
      ruleId: "punctuation.missing_space_after",
      kind: "negative",
      paragraphs: [`The Buyer must pay, then send notice ${i} in writing.`],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Clean missing-space traps.",
    });
  }
  return traps;
}

function unbalancedPositives(): BetaRuleCase[] {
  const opens = ["(", "[", "{"] as const;
  const frames = [
    (verb: string, mark: string, object: string) => `The Buyer must ${verb} the ${object} ${mark}including extras immediately.`,
    (verb: string, mark: string, object: string) => `Please ${verb} the ${object} ${mark}including extras before Friday.`,
    (verb: string, mark: string, object: string) => `Kindly ${verb} the ${object} ${mark}including extras after completion.`,
    (verb: string, mark: string, object: string) => `Each party must ${verb} the ${object} ${mark}including extras in writing.`,
  ];
  return opens.flatMap((mark) => frames.flatMap((frame, frameIndex) => VERBS.map((verb, index) => ({
    id: `pee21_unbal_${verb}_${mark.charCodeAt(0)}_${frameIndex}`,
    ruleId: "punctuation.unbalanced_pair" as LaunchRuleId,
    kind: "positive" as const,
    paragraphs: [frame(verb, mark, OBJECTS[index]!)],
    quote: mark,
    replacement: null,
    action: "comment" as const,
    rationale: `Unmatched ${mark}.`,
  }))));
}

function unbalancedTraps(): BetaRuleCase[] {
  const traps: BetaRuleCase[] = [
    { id: "pee21_unbal_ok_paren", ruleId: "punctuation.unbalanced_pair", kind: "negative", paragraphs: ["The Buyer must pay the amount (including tax) immediately."], quote: null, replacement: null, action: "none", rationale: "Balanced parentheses." },
    { id: "pee21_unbal_placeholder", ruleId: "punctuation.unbalanced_pair", kind: "negative", paragraphs: ["The Buyer must complete [●] before the notice is sent."], quote: null, replacement: null, action: "none", rationale: "Placeholder brackets." },
    { id: "pee21_unbal_apostrophe", ruleId: "punctuation.unbalanced_pair", kind: "negative", paragraphs: ["The Buyer must keep the Company's records with the file."], quote: null, replacement: null, action: "none", rationale: "Apostrophe is not a quote pair." },
    { id: "pee21_unbal_nested", ruleId: "punctuation.unbalanced_pair", kind: "negative", paragraphs: ["The Buyer must pay the amount (including (local) tax) now."], quote: null, replacement: null, action: "none", rationale: "Nested parentheses." },
    { id: "pee21_unbal_quotes", ruleId: "punctuation.unbalanced_pair", kind: "negative", paragraphs: ['The Buyer must use "Confidential Information" in writing.'], quote: null, replacement: null, action: "none", rationale: "Balanced quotes." },
    { id: "pee21_unbal_cross_para", ruleId: "punctuation.unbalanced_pair", kind: "negative", paragraphs: ["The Buyer must pay the amount (including tax", "and insurance) immediately after completion."], quote: null, replacement: null, action: "none", rationale: "A pair spanning consecutive paragraphs is not unmatched." },
    { id: "pee21_unbal_cross_quote", ruleId: "punctuation.unbalanced_pair", kind: "negative", paragraphs: ['The Buyer must keep the "Confidential', 'Information" records with the file today.'], quote: null, replacement: null, action: "none", rationale: "Straight quotes spanning consecutive paragraphs." },
  ];
  for (let i = 0; i < 95; i++) {
    traps.push({
      id: `pee21_unbal_ok_${i}`,
      ruleId: "punctuation.unbalanced_pair",
      kind: "negative",
      paragraphs: [`The Buyer must pay the amount (including tax) in case ${i}.`],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Clean balanced punctuation.",
    });
  }
  return traps;
}

export function pee21Cases(): { ruleId: LaunchRuleId; positives: BetaRuleCase[]; traps: BetaRuleCase[]; action: "correction" | "comment" }[] {
  return [
    { ruleId: "punctuation.duplicate_mark", positives: duplicatePositives(), traps: duplicateTraps(), action: "correction" },
    { ruleId: "spacing.accidental", positives: spacingPositives(), traps: spacingTraps(), action: "correction" },
    { ruleId: "punctuation.space_before", positives: spaceBeforePositives(), traps: spaceBeforeTraps(), action: "correction" },
    { ruleId: "punctuation.missing_space_after", positives: missingSpacePositives(), traps: missingSpaceTraps(), action: "correction" },
    { ruleId: "punctuation.unbalanced_pair", positives: unbalancedPositives(), traps: unbalancedTraps(), action: "comment" },
  ];
}
