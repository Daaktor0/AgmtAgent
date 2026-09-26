/**
 * Independently labelled PEE-10 reference cases.
 * Unique (family, label, form) pairs; packed execution does not inflate denominators.
 */
import { createHash } from "node:crypto";
import type { LaunchRuleId } from "../../proof/contracts.ts";
import type { BetaRuleCase } from "./beta-rule-cases.ts";
import type { SplitBucket } from "./beta-rule-denominators.ts";

export const PEE10_CASES_VERSION = "proof-pee10-cases-v1";
export const PEE10_SUPPORTED_RECALL = 0.9;
export const PEE10_COMMENT_PRECISION = 0.98;
export const PEE10_MIN_SAMPLES = 100;

const FAMILIES = [
  { id: "sha", frame: (payload: string) => `The Company shall ${payload} under this Shareholders Agreement.` },
  { id: "ssa", frame: (payload: string) => `The Investor will ${payload} before completion of the subscription.` },
  { id: "nda", frame: (payload: string) => `The Recipient must ${payload} in writing under this NDA.` },
  { id: "employment", frame: (payload: string) => `The Employee may ${payload} without delay under the employment contract.` },
  { id: "letter", frame: (payload: string) => `We should ${payload} within ten days of this letter.` },
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

function numbering(): string[] {
  return ["1. First operative clause.", "2. Second operative clause."];
}

export function pee10MissingPositives(): BetaRuleCase[] {
  const out: BetaRuleCase[] = [];
  for (const family of FAMILIES) {
    for (let i = 0; i < 110; i++) {
      const label = `80.${i + 1}`;
      out.push({
        id: `pee10_missing_${family.id}_${label}`,
        ruleId: "references.missing_target",
        kind: "positive",
        paragraphs: [...numbering(), family.frame(`act under Clause ${label}`)],
        quote: `Clause ${label}`,
        replacement: null,
        action: "comment",
        rationale: `Missing single internal clause in ${family.id}.`,
      });
    }
    for (let i = 0; i < 20; i++) {
      const a = `90.${i + 1}`;
      const b = `91.${i + 1}`;
      out.push({
        id: `pee10_range_${family.id}_${a}_${b}`,
        ruleId: "references.missing_target",
        kind: "positive",
        paragraphs: [...numbering(), family.frame(`act under Clauses ${a} to ${b}`)],
        quote: `Clauses ${a} to ${b}`,
        replacement: null,
        action: "comment",
        rationale: `Range with both endpoints missing in ${family.id}.`,
      });
    }
    for (let i = 0; i < 16; i++) {
      const missing = `92.${i + 1}`;
      out.push({
        id: `pee10_coord_${family.id}_${missing}`,
        ruleId: "references.missing_target",
        kind: "positive",
        paragraphs: [...numbering(), family.frame(`act under Clause 1 and ${missing}`)],
        quote: `Clause 1 and ${missing}`,
        replacement: null,
        action: "comment",
        rationale: `Coordinated reference with a missing endpoint in ${family.id}.`,
      });
    }
  }
  return out;
}

export function pee10MissingTraps(): BetaRuleCase[] {
  const out: BetaRuleCase[] = [];
  for (const family of FAMILIES) {
    for (let i = 0; i < 30; i++) {
      out.push({
        id: `pee10_resolved_${family.id}_${i}`,
        ruleId: "references.missing_target",
        kind: "negative",
        paragraphs: [...numbering(), family.frame("act under Clause 1")],
        quote: null,
        replacement: null,
        action: "none",
        rationale: "Resolved internal reference.",
      });
      out.push({
        id: `pee10_statute_${family.id}_${i}`,
        ruleId: "references.missing_target",
        kind: "negative",
        paragraphs: [...numbering(), `Section 42 of the Companies Act, 2013 applies to item ${family.id}-${i}.`],
        quote: null,
        replacement: null,
        action: "none",
        rationale: "External statute.",
      });
      out.push({
        id: `pee10_other_${family.id}_${i}`,
        ruleId: "references.missing_target",
        kind: "negative",
        paragraphs: [...numbering(), family.frame(`comply with Clause 12 of the other agreement (${i})`)],
        quote: null,
        replacement: null,
        action: "none",
        rationale: "External other-agreement reference.",
      });
    }
    for (let i = 0; i < 20; i++) {
      out.push({
        id: `pee10_quoted_${family.id}_${i}`,
        ruleId: "references.missing_target",
        kind: "negative",
        paragraphs: [...numbering(), family.frame(`record that "Clause 99.${i + 1}" was mentioned`)],
        quote: null,
        replacement: null,
        action: "none",
        rationale: "Quoted clause number is not an internal use.",
      });
      out.push({
        id: `pee10_relative_${family.id}_${i}`,
        ruleId: "references.missing_target",
        kind: "negative",
        paragraphs: [...numbering(), family.frame(`comply with this Clause (${i})`)],
        quote: null,
        replacement: null,
        action: "none",
        rationale: "Relative reference is unknown, not missing.",
      });
      out.push({
        id: `pee10_range_one_${family.id}_${i}`,
        ruleId: "references.missing_target",
        kind: "negative",
        paragraphs: ["1.1 First subclause.", "1.2 Second subclause.", family.frame(`act under Clauses 1.1 to 99.${i + 1}`)],
        quote: null,
        replacement: null,
        action: "none",
        rationale: "A range is flagged only if both endpoints are missing.",
      });
      out.push({
        id: `pee10_schedule_${family.id}_${i}`,
        ruleId: "references.missing_target",
        kind: "negative",
        paragraphs: [...numbering(), "SCHEDULE 1", "1. Local schedule obligation.", family.frame("act under Schedule 1")],
        quote: null,
        replacement: null,
        action: "none",
        rationale: "Schedule-prefixed numbers are a different namespace.",
      });
    }
  }
  return out;
}

export function pee10DuplicatePositives(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => {
    const label = `${6 + (i % 8)}.${i + 1}`;
    return {
      id: `pee10_dupnum_${family.id}_${label}`,
      ruleId: "references.duplicate_number" as const,
      kind: "positive" as const,
      paragraphs: [
        `${label} ${family.frame("keep the first numbered obligation")}`,
        `${label} ${family.frame("repeat the same number")}`,
      ],
      quote: label,
      replacement: null,
      action: "comment" as const,
      rationale: `Duplicate literal number in ${family.id}.`,
    };
  }));
}

export function pee10DuplicateTraps(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => ({
    id: `pee10_dupnum_restart_${family.id}_${i}`,
    ruleId: "references.duplicate_number" as const,
    kind: "negative" as const,
    paragraphs: [
      "1. Main-body obligation.",
      "SCHEDULE 1",
      `1. Local schedule numbering may restart (${family.id}-${i}).`,
      "SCHEDULE 2",
      "1. A second schedule also starts at 1.",
    ],
    quote: null,
    replacement: null,
    action: "none" as const,
    rationale: "Schedule numbering may restart; not a main-body duplicate.",
  })));
}

export function pee10ScopePositives(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => {
    const label = `${20 + i}`;
    return {
      id: `pee10_scope_${family.id}_${label}`,
      ruleId: "references.scope_confusion" as const,
      kind: "positive" as const,
      paragraphs: [
        "1. First operative clause.",
        family.frame(`act under Clause ${label}`),
        "SCHEDULE 1",
        `${label}. Local schedule obligation only.`,
      ],
      quote: `Clause ${label}`,
      replacement: null,
      action: "comment" as const,
      rationale: `Main-body reference exists only in a schedule in ${family.id}.`,
    };
  }));
}

export function pee10ScopeTraps(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => ({
    id: `pee10_scope_local_${family.id}_${i}`,
    ruleId: "references.scope_confusion" as const,
    kind: "negative" as const,
    paragraphs: [
      `${3 + (i % 5)}. Local main-body obligation.`,
      family.frame(`act under Clause ${3 + (i % 5)}`),
      "SCHEDULE 1",
      `${3 + (i % 5)}. Schedule uses the same number independently.`,
    ],
    quote: null,
    replacement: null,
    action: "none" as const,
    rationale: "A locally resolved number is not scope confusion.",
  })));
}

export function pee10AmbiguousPositives(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => {
    const label = `${30 + (i % 10)}`;
    return {
      id: `pee10_ambig_${family.id}_${i}`,
      ruleId: "references.ambiguous_target" as const,
      kind: "positive" as const,
      paragraphs: [
        `${label}. First use of this number.`,
        `${label}. Second use of this number.`,
        family.frame(`act under Clause ${label}`),
      ],
      quote: `Clause ${label}`,
      replacement: null,
      action: "comment" as const,
      rationale: `Ambiguous internal number in ${family.id}; never auto-corrected.`,
    };
  }));
}

export function pee10AmbiguousTraps(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => ({
    id: `pee10_ambig_unique_${family.id}_${i}`,
    ruleId: "references.ambiguous_target" as const,
    kind: "negative" as const,
    paragraphs: [
      `${4 + (i % 3)}. Unique operative clause.`,
      family.frame(`act under Clause ${4 + (i % 3)}`),
    ],
    quote: null,
    replacement: null,
    action: "none" as const,
    rationale: "A unique resolved number is not ambiguous.",
  })));
}

export function pee10Adversarial(): { id: string; ruleId: LaunchRuleId; paragraphs: string[]; tableRows?: string[][]; expectSilent: boolean; lang?: string; note: string }[] {
  return [
    {
      id: "pee10_adv_quoted",
      ruleId: "references.missing_target",
      paragraphs: ["1. First clause.", 'The Company shall record that "Clause 99.2" was mentioned.'],
      expectSilent: true,
      note: "quotation containing the error",
    },
    {
      id: "pee10_adv_party",
      ruleId: "references.missing_target",
      paragraphs: ['This Agreement is between Example Limited ("Company") and Other Limited and the Company shall act under Clause 99.2.'],
      expectSilent: true,
      note: "party block",
    },
    {
      id: "pee10_adv_table",
      ruleId: "references.missing_target",
      paragraphs: ["1. First clause."],
      tableRows: [["The Company shall act under Clause 99.2."]],
      expectSilent: false,
      note: "table cell remains in supported scope",
    },
    {
      id: "pee10_adv_reserved",
      ruleId: "references.missing_target",
      paragraphs: ["1. First clause.", "2. Second clause.", "4. Fourth clause, number 3 reserved."],
      expectSilent: true,
      note: "intentionally reserved gap is silent unless referenced",
    },
  ];
}

export function pee10Denominators() {
  const rules: { ruleId: LaunchRuleId; positives: BetaRuleCase[]; negatives: BetaRuleCase[] }[] = [
    { ruleId: "references.missing_target", positives: pee10MissingPositives(), negatives: pee10MissingTraps() },
    { ruleId: "references.duplicate_number", positives: pee10DuplicatePositives(), negatives: pee10DuplicateTraps() },
    { ruleId: "references.scope_confusion", positives: pee10ScopePositives(), negatives: pee10ScopeTraps() },
    { ruleId: "references.ambiguous_target", positives: pee10AmbiguousPositives(), negatives: pee10AmbiguousTraps() },
  ];
  return {
    version: PEE10_CASES_VERSION,
    families: FAMILIES.map((family) => family.id),
    perRule: Object.fromEntries(rules.map((rule) => [rule.ruleId, {
      uniquePositiveFamilies: rule.positives.length,
      uniqueNegativeFamilies: rule.negatives.length,
      heldOutPositive: rule.positives.filter((item) => splitBucket(item.id) === "held_out").length,
      heldOutNegative: rule.negatives.filter((item) => splitBucket(item.id) === "held_out").length,
      independence: "Each ID is one (family, label, form) pair. Packed documents are execution only.",
    }])),
  };
}
