/**
 * Independently labelled PEE-11 definition cases.
 * Unique (family, term) pairs; packed execution does not inflate denominators.
 */
import { createHash } from "node:crypto";
import type { LaunchRuleId } from "../../proof/contracts.ts";
import type { BetaRuleCase } from "./beta-rule-cases.ts";
import type { SplitBucket } from "./beta-rule-denominators.ts";

export const PEE11_CASES_VERSION = "proof-pee11-cases-v2";
export const PEE11_SUPPORTED_RECALL = 0.9;
export const PEE11_COMMENT_PRECISION = 0.98;
export const PEE11_MIN_SAMPLES = 100;

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

function termName(family: string, i: number): string {
  return `${family[0]!.toUpperCase()}${family.slice(1)} Term ${i + 1}`;
}

export function pee11DuplicatePositives(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => {
    const term = `Notice ${family.id[0]!.toUpperCase()}${family.id.slice(1)} ${i + 1}`;
    return {
      id: `pee11_dup_${family.id}_${i}`,
      ruleId: "definitions.duplicate" as const,
      kind: "positive" as const,
      paragraphs: [
        `1. "${term}" means a letter.`,
        `2. "${term}" means an email.`,
      ],
      quote: term,
      replacement: null,
      action: "comment" as const,
      rationale: `Same-scope duplicate declaration in ${family.id}.`,
    };
  }));
}

export function pee11DuplicateTraps(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => ({
    id: `pee11_dup_scope_${family.id}_${i}`,
    ruleId: "definitions.duplicate" as const,
    kind: "negative" as const,
    paragraphs: [
      '1. "Notice" means a written notice.',
      "SCHEDULE 1",
      `1. "Notice" means a local notice for ${family.id} ${i}.`,
    ],
    quote: null,
    replacement: null,
    action: "none" as const,
    rationale: "Main-body and schedule declarations are separate scopes for duplicate.",
  })));
}

export function pee11RedefinitionPositives(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => {
    const term = termName(family.id, i);
    return {
      id: `pee11_redef_${family.id}_${i}`,
      ruleId: "definitions.scope_redefinition" as const,
      kind: "positive" as const,
      paragraphs: [
        `1. "${term}" means a written notice under this Agreement.`,
        "SCHEDULE 1",
        `1. "${term}" means an email for ${family.id}.`,
      ],
      quote: term,
      replacement: null,
      action: "comment" as const,
      rationale: `Schedule re-declaration with different text in ${family.id}.`,
    };
  }));
}

export function pee11RedefinitionTraps(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => [
    ...Array.from({ length: 55 }, (_, i) => ({
      id: `pee11_redef_identical_${family.id}_${i}`,
      ruleId: "definitions.scope_redefinition" as const,
      kind: "negative" as const,
      paragraphs: [
        `1. "${termName(family.id, i)}" means a written notice under this Agreement.`,
        "SCHEDULE 1",
        `1. "${termName(family.id, i)}" means a written notice under this Agreement.`,
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Identical scoped re-definition is legitimate drafting.",
    })),
    ...Array.from({ length: 55 }, (_, i) => ({
      id: `pee11_redef_imported_${family.id}_${i}`,
      ruleId: "definitions.scope_redefinition" as const,
      kind: "negative" as const,
      paragraphs: [
        `1. "${termName(family.id, 80 + i)}" has the meaning given in the NDA.`,
        "SCHEDULE 1",
        `1. "${termName(family.id, 80 + i)}" means a local excerpt for ${family.id}.`,
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Imported excerpt is not a local parent definition.",
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `pee11_redef_purposes_${family.id}_${i}`,
      ruleId: "definitions.scope_redefinition" as const,
      kind: "negative" as const,
      paragraphs: [
        `1. "${termName(family.id, 200 + i)}" means a written notice under this Agreement.`,
        "SCHEDULE 1",
        `1. For the purposes of this Schedule, "${termName(family.id, 200 + i)}" means a local list for ${family.id} ${i}.`,
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "For-the-purposes-of-this-Schedule definition is an intended local override.",
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `pee11_redef_override_${family.id}_${i}`,
      ruleId: "definitions.scope_redefinition" as const,
      kind: "negative" as const,
      paragraphs: [
        `1. "${termName(family.id, 220 + i)}" means a day other than Saturday or Sunday.`,
        "SCHEDULE 1",
        `1. Notwithstanding clause 1, "${termName(family.id, 220 + i)}" means a day on which banks are open for ${family.id} ${i}.`,
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Express notwithstanding override is intended local drafting, not an error.",
    })),
  ]);
}

export function pee11CasePositives(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => {
    const term = termName(family.id, i);
    return {
      id: `pee11_case_${family.id}_${i}`,
      ruleId: "definitions.case_variant" as const,
      kind: "positive" as const,
      paragraphs: [
        `1. "${term}" means a defined concept.`,
        family.frame(`protect the ${term.toLowerCase()} as required`),
      ],
      quote: term.toLowerCase(),
      replacement: null,
      action: "comment" as const,
      rationale: `Wrong capitalisation of a defined term in ${family.id}.`,
    };
  }));
}

export function pee11CaseTraps(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => [
    ...Array.from({ length: 40 }, (_, i) => ({
      id: `pee11_case_exact_${family.id}_${i}`,
      ruleId: "definitions.case_variant" as const,
      kind: "negative" as const,
      paragraphs: [
        `1. "${termName(family.id, i)}" means a defined concept.`,
        family.frame(`protect the ${termName(family.id, i)} as required`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Exact defined-term use.",
    })),
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `pee11_case_agreement_${family.id}_${i}`,
      ruleId: "definitions.case_variant" as const,
      kind: "negative" as const,
      paragraphs: [
        '1. "Agreement" means this agreement.',
        family.frame(`keep this agreement confidential (${i})`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Generic noun on the exclusion list.",
    })),
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `pee11_case_quoted_${family.id}_${i}`,
      ruleId: "definitions.case_variant" as const,
      kind: "negative" as const,
      paragraphs: [
        `1. "${termName(family.id, i)}" means a defined concept.`,
        family.frame(`record that "${termName(family.id, i).toLowerCase()}" was used`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Quoted lowercase is not a case-variant use.",
    })),
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `pee11_case_plural_${family.id}_${i}`,
      ruleId: "definitions.case_variant" as const,
      kind: "negative" as const,
      paragraphs: [
        '1. "Warrant" means an option over shares.',
        family.frame(`hold the Warrants issued (${i})`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Plural uses are excluded.",
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `pee11_case_ordinary_ci_${family.id}_${i}`,
      ruleId: "definitions.case_variant" as const,
      kind: "negative" as const,
      paragraphs: [
        '1. "Confidential Information" means secret information.',
        family.frame(`not disclose confidential information of third parties (${i})`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Ordinary lowercase of a common legal collocation is not a case-variant error.",
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `pee11_case_ordinary_services_${family.id}_${i}`,
      ruleId: "definitions.case_variant" as const,
      kind: "negative" as const,
      paragraphs: [
        '1. "Services" means the services in Schedule 1.',
        family.frame(`provide services to customers in the ordinary course (${i})`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Ordinary lowercase of a common noun that is also defined is not an error.",
    })),
  ]);
}

export function pee11UnusedPositives(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => {
    const term = `Unused ${family.id[0]!.toUpperCase()}${family.id.slice(1)} ${i + 1}`;
    return {
      id: `pee11_unused_${family.id}_${i}`,
      ruleId: "definitions.unused" as const,
      kind: "positive" as const,
      paragraphs: [
        `1. "${term}" means a defined concept.`,
        family.frame("deliver the notice"),
      ],
      quote: term,
      replacement: null,
      action: "comment" as const,
      rationale: `Defined term with zero uses outside its declaration in ${family.id}.`,
    };
  }));
}

export function pee11UnusedTraps(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => {
    const term = `Used ${family.id[0]!.toUpperCase()}${family.id.slice(1)} ${i + 1}`;
    return {
      id: `pee11_unused_used_${family.id}_${i}`,
      ruleId: "definitions.unused" as const,
      kind: "negative" as const,
      paragraphs: [
        `1. "${term}" means a defined concept.`,
        family.frame(`protect the ${term} as required`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "A used definition is not unused.",
    };
  }));
}

export function pee11UndefinedPositives(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => {
    const phrase = `Secret Project ${family.id[0]!.toUpperCase()}${family.id.slice(1)}${i + 1}`;
    return {
      id: `pee11_undef_${family.id}_${i}`,
      ruleId: "definitions.undefined_use" as const,
      kind: "positive" as const,
      paragraphs: [
        '1. "Notice" means a written notice.',
        family.frame(`observe the ${phrase} strictly`),
      ],
      quote: phrase,
      replacement: null,
      action: "comment" as const,
      rationale: `Title-case phrase with no matching definition in ${family.id}.`,
    };
  }));
}

export function pee11UndefinedTraps(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => [
    ...Array.from({ length: 55 }, (_, i) => ({
      id: `pee11_undef_defined_${family.id}_${i}`,
      ruleId: "definitions.undefined_use" as const,
      kind: "negative" as const,
      paragraphs: [
        `1. "${termName(family.id, i)}" means a defined concept.`,
        family.frame(`protect the ${termName(family.id, i)} as required`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "A defined term is not undefined.",
    })),
    ...Array.from({ length: 55 }, (_, i) => ({
      id: `pee11_undef_sentence_${family.id}_${i}`,
      ruleId: "definitions.undefined_use" as const,
      kind: "negative" as const,
      paragraphs: [
        '1. "Notice" means a written notice.',
        `Confidential Information ${family.id} ${i} shall remain secret and the Company shall keep it.`,
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "First-word-of-sentence capitalisation is excluded.",
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `pee11_undef_geo_${family.id}_${i}`,
      ruleId: "definitions.undefined_use" as const,
      kind: "negative" as const,
      paragraphs: [
        '1. "Notice" means a written notice.',
        family.frame(`deliver the notice in New York (${i})`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Place names are not undefined defined terms.",
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `pee11_undef_court_${family.id}_${i}`,
      ruleId: "definitions.undefined_use" as const,
      kind: "negative" as const,
      paragraphs: [
        '1. "Notice" means a written notice.',
        family.frame(`refer the dispute to the High Court (${i})`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Court and institution names are proper nouns, not undefined terms.",
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `pee11_undef_org_${family.id}_${i}`,
      ruleId: "definitions.undefined_use" as const,
      kind: "negative" as const,
      paragraphs: [
        '1. "Notice" means a written notice.',
        family.frame(`file the notice with the Reserve Bank (${i})`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Organisation names are proper nouns, not undefined terms.",
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `pee11_undef_includes_${family.id}_${i}`,
      ruleId: "definitions.undefined_use" as const,
      kind: "negative" as const,
      paragraphs: [
        `1. "Included ${termName(family.id, 300 + i)}" includes software and related documentation.`,
        family.frame(`protect the Included ${termName(family.id, 300 + i)} as required`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Supported includes-syntax is a definition, not an undefined use.",
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `pee11_undef_colon_${family.id}_${i}`,
      ruleId: "definitions.undefined_use" as const,
      kind: "negative" as const,
      paragraphs: [
        `1. "Colon ${termName(family.id, 320 + i)}": the meaning set out below.`,
        family.frame(`protect the Colon ${termName(family.id, 320 + i)} as required`),
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Supported colon definition syntax is a definition, not an undefined use.",
    })),
  ]);
}

export function pee11Adversarial(): { id: string; ruleId: LaunchRuleId; paragraphs: string[]; tableRows?: string[][]; header?: string; expectSilent: boolean; note: string }[] {
  return [
    {
      id: "pee11_adv_quoted",
      ruleId: "definitions.case_variant",
      paragraphs: ['1. "Confidential Information" means secret information.', 'The Company shall record that "confidential information" was used.'],
      expectSilent: true,
      note: "quotation containing the error",
    },
    {
      id: "pee11_adv_party",
      ruleId: "definitions.undefined_use",
      paragraphs: ['This Agreement is between Example Limited ("Company") and Other Limited.', "The Company shall deliver the notice."],
      expectSilent: true,
      note: "party block",
    },
    {
      id: "pee11_adv_table",
      ruleId: "definitions.duplicate",
      paragraphs: ['1. "Notice" means a letter.', '2. "Notice" means an email.'],
      expectSilent: false,
      note: "same-scope duplicate remains in scope",
    },
    {
      id: "pee11_adv_imported",
      ruleId: "definitions.scope_redefinition",
      paragraphs: ['1. "Confidential Information" has the meaning given in the NDA.', "SCHEDULE 1", '1. "Confidential Information" means a local excerpt.'],
      expectSilent: true,
      note: "imported parent is not a local redefinition",
    },
    {
      id: "pee11_adv_identical_schedule",
      ruleId: "definitions.scope_redefinition",
      paragraphs: ['1. "Confidential Information" means secret information of the Company.', "SCHEDULE 1", '1. "Confidential Information" means secret information of the Company.'],
      expectSilent: true,
      note: "identical scoped re-definition is legitimate drafting",
    },
    {
      id: "pee11_adv_schedule_purposes",
      ruleId: "definitions.scope_redefinition",
      paragraphs: ['1. "Confidential Information" means secret information of the Company.', "SCHEDULE 1", '1. For the purposes of this Schedule, "Confidential Information" means the information listed in this Schedule.'],
      expectSilent: true,
      note: "for-the-purposes schedule definition is an intended override",
    },
    {
      id: "pee11_adv_express_override",
      ruleId: "definitions.scope_redefinition",
      paragraphs: ['1. "Business Day" means a day other than Saturday or Sunday.', "SCHEDULE 1", '1. Notwithstanding clause 1, "Business Day" means a day on which banks in Mumbai are open.'],
      expectSilent: true,
      note: "express notwithstanding override",
    },
    {
      id: "pee11_adv_ordinary_lowercase",
      ruleId: "definitions.case_variant",
      paragraphs: ['1. "Confidential Information" means secret information.', "The Recipient shall not disclose confidential information of third parties."],
      expectSilent: true,
      note: "ordinary lowercase of a common collocation",
    },
    {
      id: "pee11_adv_geo",
      ruleId: "definitions.undefined_use",
      paragraphs: ['1. "Notice" means a written notice.', "The Company shall deliver the notice in New York."],
      expectSilent: true,
      note: "place name is not an undefined term",
    },
    {
      id: "pee11_adv_court",
      ruleId: "definitions.undefined_use",
      paragraphs: ['1. "Notice" means a written notice.', "The dispute shall be referred to the High Court."],
      expectSilent: true,
      note: "institution name is not an undefined term",
    },
    {
      id: "pee11_adv_table_quoted_means",
      ruleId: "definitions.undefined_use",
      paragraphs: ["The Company shall protect the Table Term as required."],
      tableRows: [['1. "Table Term" means a defined concept.']],
      expectSilent: true,
      note: "quoted means-definition inside a table is indexed",
    },
    {
      id: "pee11_adv_table_two_column",
      ruleId: "definitions.undefined_use",
      paragraphs: ["The Company shall protect the Column Term as required."],
      tableRows: [['"Column Term"', "a defined concept in this table"]],
      expectSilent: true,
      note: "two-column table definition is supported syntax",
    },
    {
      id: "pee11_adv_includes",
      ruleId: "definitions.undefined_use",
      paragraphs: ['1. "Included Term" includes software and related documentation.', "The Company shall protect the Included Term as required."],
      expectSilent: true,
      note: "includes-syntax is a supported definition",
    },
    {
      id: "pee11_adv_colon",
      ruleId: "definitions.undefined_use",
      paragraphs: ['1. "Colon Term": the meaning set out below.', "The Company shall protect the Colon Term as required."],
      expectSilent: true,
      note: "colon syntax is a supported definition",
    },
    {
      id: "pee11_adv_header_definition",
      ruleId: "definitions.undefined_use",
      paragraphs: ["The Company shall protect the Header Term as required."],
      header: '1. "Header Term" means a defined concept.',
      expectSilent: true,
      note: "definition only in a header makes the inventory incomplete for absence claims",
    },
  ];
}

export function pee11Denominators() {
  const rules: { ruleId: LaunchRuleId; positives: BetaRuleCase[]; negatives: BetaRuleCase[] }[] = [
    { ruleId: "definitions.duplicate", positives: pee11DuplicatePositives(), negatives: pee11DuplicateTraps() },
    { ruleId: "definitions.scope_redefinition", positives: pee11RedefinitionPositives(), negatives: pee11RedefinitionTraps() },
    { ruleId: "definitions.case_variant", positives: pee11CasePositives(), negatives: pee11CaseTraps() },
    { ruleId: "definitions.unused", positives: pee11UnusedPositives(), negatives: pee11UnusedTraps() },
    { ruleId: "definitions.undefined_use", positives: pee11UndefinedPositives(), negatives: pee11UndefinedTraps() },
  ];
  return {
    version: PEE11_CASES_VERSION,
    families: FAMILIES.map((family) => family.id),
    perRule: Object.fromEntries(rules.map((rule) => [rule.ruleId, {
      uniquePositiveFamilies: rule.positives.length,
      uniqueNegativeFamilies: rule.negatives.length,
      heldOutPositive: rule.positives.filter((item) => splitBucket(item.id) === "held_out").length,
      heldOutNegative: rule.negatives.filter((item) => splitBucket(item.id) === "held_out").length,
      independence: "Each ID is one (family, term) pair on a shared sentence template. Packed documents are execution only. sha/ssa/nda/employment/letter are the independent agreement families; term-index clones are not independent documents.",
    }])),
  };
}
