/**
 * Independently labelled PWC-15 beta-rule cases.
 *
 * Detection, anchoring and permitted output-action are recorded separately.
 * Mixed-format corrections stay comment-only; this file does not rewrite that
 * expectation merely to obtain a passing score.
 */
import JSZip from "jszip";
import { buildDocx } from "../../docx.ts";
import { TYPO_ALLOWLIST, DUPLICATE_FUNCTION_WORDS } from "../../proof/typo-allowlist.ts";
import type { LaunchRuleId } from "../../proof/contracts.ts";

export const BETA_RULE_CASES_VERSION = "proof-beta-rule-cases-v1";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export type Layer = "detection" | "anchoring" | "output_action";
export type PermittedAction = "track_replace" | "track_delete" | "comment" | "none";

export type BetaRuleCase = {
  id: string;
  ruleId: LaunchRuleId;
  kind: "positive" | "negative";
  paragraphs: string[];
  quote: string | null;
  replacement: string | null;
  action: PermittedAction;
  rationale: string;
};

const TYPOS = Object.entries(TYPO_ALLOWLIST);
const VERBS = ["shall", "will", "must", "may"] as const;
const OBJECTS = [
  "notice", "agreement", "payment", "certificate", "statement",
  "schedule", "appendix", "letter", "invoice", "report",
] as const;

function prose(typo: string, verb: string, object: string, variant: number): string {
  const frames = [
    `The Company ${verb} ${typo} the ${object} in writing.`,
    `The Borrower ${verb} ${typo} a ${object} before completion.`,
    `Each Party ${verb} ${typo} the ${object} within ten days.`,
    `The Employee ${verb} ${typo} that ${object} without delay.`,
    `The Licensor ${verb} ${typo} the ${object} before the stated deadline.`,
  ];
  return frames[variant % frames.length]!;
}

export function correctionCases(): BetaRuleCase[] {
  const out: BetaRuleCase[] = [];
  let n = 0;
  while (out.length < 1000) {
    const [typo, replacement] = TYPOS[n % TYPOS.length]!;
    const verb = VERBS[n % VERBS.length]!;
    const object = OBJECTS[Math.floor(n / TYPOS.length) % OBJECTS.length]!;
    const variant = Math.floor(n / (TYPOS.length * VERBS.length));
    out.push({
      id: `corr_${String(n + 1).padStart(4, "0")}_${typo}`,
      ruleId: "language.typo_allowlist",
      kind: "positive",
      paragraphs: [prose(typo, verb, object, variant)],
      quote: typo,
      replacement,
      action: "track_replace",
      rationale: "Frozen allowlist typo in ordinary English prose.",
    });
    n += 1;
  }
  return out;
}

export function duplicateWordPositives(): BetaRuleCase[] {
  return DUPLICATE_FUNCTION_WORDS.map((word, index) => ({
    id: `dup_space_${word}_${index}`,
    ruleId: "language.duplicate_word" as const,
    kind: "positive" as const,
    paragraphs: [`The Company shall pay ${word} ${word} amount on the due date.`],
    quote: ` ${word}`,
    replacement: "",
    action: "track_delete" as const,
    rationale: "Adjacent allowlisted function word separated by ordinary spaces.",
  }));
}

function commentPositives(ruleId: LaunchRuleId, make: (i: number) => { paragraphs: string[]; quote: string }): BetaRuleCase[] {
  return Array.from({ length: 100 }, (_, i) => {
    const made = make(i);
    return {
      id: `${ruleId}_${String(i + 1).padStart(3, "0")}`,
      ruleId,
      kind: "positive" as const,
      paragraphs: made.paragraphs,
      quote: made.quote,
      replacement: null,
      action: "comment" as const,
      rationale: `Positive ${ruleId} case ${i + 1}.`,
    };
  });
}

function commentNegatives(ruleId: LaunchRuleId, make: (i: number) => { paragraphs: string[]; quote: string | null; rationale: string }): BetaRuleCase[] {
  return Array.from({ length: 100 }, (_, i) => {
    const made = make(i);
    return {
      id: `${ruleId}_neg_${String(i + 1).padStart(3, "0")}`,
      ruleId,
      kind: "negative" as const,
      paragraphs: made.paragraphs,
      quote: made.quote,
      replacement: null,
      action: "none" as const,
      rationale: made.rationale,
    };
  });
}

export function placeholderCases(): { positives: BetaRuleCase[]; negatives: BetaRuleCase[] } {
  const tokens = ["[●]", "[TBD]", "[insert date]", "[insert name]", "[insert amount]", "[insert address]"];
  return {
    positives: commentPositives("completion.placeholder", (i) => ({
      paragraphs: [`The Company shall deliver the ${tokens[i % tokens.length]} on the Completion Date.`],
      quote: tokens[i % tokens.length]!,
    })),
    negatives: commentNegatives("completion.placeholder", (i) => ({
      paragraphs: i % 2 === 0
        ? [`The formula uses [12] as a reference value in Schedule ${i + 1}.`]
        : [`"The Parties may insert [optional wording] in Annex ${i + 1}."`],
      quote: null,
      rationale: "Mathematical or quoted brackets are not unfinished drafting placeholders.",
    })),
  };
}

export function missingTargetCases(): { positives: BetaRuleCase[]; negatives: BetaRuleCase[] } {
  return {
    positives: commentPositives("references.missing_target", (i) => ({
      paragraphs: [
        "1. The Company shall perform the Services.",
        `The Company shall perform its obligations under Clause 200.${i + 1}.`,
      ],
      quote: `Clause 200.${i + 1}`,
    })),
    negatives: commentNegatives("references.missing_target", (i) => ({
      paragraphs: [
        "1. The Company shall perform the Services.",
        i % 3 === 0
          ? `Section 42 of the Companies Act, 2013 applies to item ${i}.`
          : i % 3 === 1
            ? "The Company shall act under Clause 1."
            : `Clause 12 of the other agreement remains in force (${i}).`,
      ],
      quote: null,
      rationale: i % 3 === 1 ? "Resolved internal reference." : "External statute or other-agreement reference.",
    })),
  };
}

export function duplicateNumberCases(): { positives: BetaRuleCase[]; negatives: BetaRuleCase[] } {
  return {
    positives: commentPositives("references.duplicate_number", (i) => ({
      paragraphs: [
        `${8 + (i % 5)}.1 The first occurrence of this number.`,
        `${8 + (i % 5)}.1 The second occurrence of this number.`,
      ],
      quote: `${8 + (i % 5)}.1`,
    })),
    negatives: commentNegatives("references.duplicate_number", (i) => ({
      paragraphs: [
        "SCHEDULE 1",
        "1. Local schedule numbering may restart.",
        "SCHEDULE 2",
        `1. A second schedule also starts at 1 (${i}).`,
      ],
      quote: null,
      rationale: "Schedule numbering may restart; not a main-body duplicate.",
    })),
  };
}

export function duplicateDefinitionCases(): { positives: BetaRuleCase[]; negatives: BetaRuleCase[] } {
  return {
    positives: commentPositives("definitions.duplicate", (i) => ({
      paragraphs: [
        `1. "Notice${i}" means a letter.`,
        `2. "Notice${i}" means an email.`,
      ],
      quote: `Notice${i}`,
    })),
    negatives: commentNegatives("definitions.duplicate", (i) => ({
      paragraphs: [
        '1. "Notice" means a written notice.',
        "SCHEDULE 1",
        `1. "Notice" means a local notice for schedule ${i + 1}.`,
      ],
      quote: null,
      rationale: "Main-body and schedule definitions are separate scopes.",
    })),
  };
}

export function namedRecieveTraps(): BetaRuleCase[] {
  return [
    {
      id: "trap_named_recieve",
      ruleId: "language.typo_allowlist",
      kind: "negative",
      paragraphs: [
        'This Agreement is between Recieve Private Limited ("Recieve") and Example Limited.',
        "Recieve shall deliver the notice to Recieve Private Limited.",
      ],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Party name Recieve is not an ordinary-prose typo.",
    },
    {
      id: "trap_that_that_had_had",
      ruleId: "language.duplicate_word",
      kind: "negative",
      paragraphs: ["The Company confirms that that notice is valid and it had had enough time."],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Grammatical that-that and had-had are excluded.",
    },
    {
      id: "trap_tab_duplicate",
      ruleId: "language.duplicate_word",
      kind: "negative",
      paragraphs: ["The Company shall pay the\tthe interest on each Interest Payment Date."],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Tab-separated duplicates are alignment, not ordinary-space deletion.",
    },
  ];
}

export function allCommentCases(): { positives: BetaRuleCase[]; negatives: BetaRuleCase[] } {
  const placeholder = placeholderCases();
  const missing = missingTargetCases();
  const dupNum = duplicateNumberCases();
  const dupDef = duplicateDefinitionCases();
  return {
    positives: [...placeholder.positives, ...missing.positives, ...dupNum.positives, ...dupDef.positives],
    negatives: [...placeholder.negatives, ...missing.negatives, ...dupNum.negatives, ...dupDef.negatives, ...namedRecieveTraps()],
  };
}

export async function docxWithLang(text: string, lang: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await buildDocx([text]));
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body><w:p><w:pPr><w:lang w:val="${escape(lang)}"/></w:pPr><w:r><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
    { date: new Date(0) },
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export function countByRule(cases: readonly BetaRuleCase[]): Record<string, { positive: number; negative: number }> {
  const counts: Record<string, { positive: number; negative: number }> = {};
  for (const item of cases) {
    const bucket = counts[item.ruleId] ?? (counts[item.ruleId] = { positive: 0, negative: 0 });
    bucket[item.kind] += 1;
  }
  return counts;
}
