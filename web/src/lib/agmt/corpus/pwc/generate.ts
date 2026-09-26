/**
 * Independently generated synthetic Proof corpus (PWC-03).
 * Hand-authored OOXML packages. Not copied from the exporter or engine output.
 * All names, authors and comments are synthetic.
 */
import { createHash } from "node:crypto";
import JSZip from "jszip";
import type { LaunchRuleId } from "../../proof/contracts.ts";

export const PWC_CORPUS_GENERATOR_SEED = "pwc-03-synthetic-corpus-v1";
export const PWC_CORPUS_GENERATOR_VERSION = "pwc-03-generate-v1";
export const PWC_SYNTHETIC_AUTHOR = "Agmt Synthetic Corpus";
export const PWC_SYNTHETIC_REVIEWER = "Synthetic Prior Reviewer";
const DETERMINISTIC_ZIP_DATE = new Date(0);
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export type ProofProfile = "agreement" | "general";
export type ProofLanguage = "en-GB" | "en-US";
export type FixtureKind = "positive" | "clean_twin";
export type TargetKind =
  | "typo"
  | "duplicate_word"
  | "placeholder"
  | "missing_ref"
  | "duplicate_number"
  | "duplicate_def"
  | "trap_only";

export type BodyBlock =
  | { type: "p"; text: string; target?: boolean }
  | { type: "split"; parts: readonly string[]; target?: boolean }
  | { type: "table"; text: string; target?: boolean }
  | { type: "revision"; prefix: string; ins: string; del: string }
  | { type: "commented"; text: string; commentId: string };

export type ExpectedAction = {
  ruleId: LaunchRuleId;
  ruleVersion: 1;
  kind: "correction" | "comment";
  action: "track_replace" | "track_delete" | "comment";
  quote: string;
  replacement: string | null;
  /** Index among body `w:p` nodes in document.xml source order. */
  paragraphIndex: number;
  relatedQuote?: string;
  relatedParagraphIndex?: number;
  rationale: string;
  excludedTraps: readonly string[];
};

export type PackageSpec = {
  id: string;
  family: string;
  profile: ProofProfile;
  language: ProofLanguage;
  title: string;
  capabilityTags: readonly string[];
  supported: boolean;
  targetRule: LaunchRuleId | null;
  targetKind: TargetKind;
  targetQuote: string;
  cleanFill: string;
  expected: ExpectedAction[];
  blocks: BodyBlock[];
  header?: string;
  comments?: readonly { id: string; author: string; text: string }[];
};

export type GeneratedPackage = {
  spec: PackageSpec;
  kind: FixtureKind;
  bytes: Buffer;
  sha256: string;
  byteSize: number;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function runXml(text: string, properties = ""): string {
  return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function paragraphXml(inner: string): string {
  return `<w:p>${inner}</w:p>`;
}

function blockText(block: BodyBlock): string {
  if (block.type === "p" || block.type === "table" || block.type === "commented") return block.text;
  if (block.type === "split") return block.parts.join("");
  return `${block.prefix}${block.ins}`;
}

function renderBlock(block: BodyBlock): string {
  if (block.type === "p") return paragraphXml(runXml(block.text));
  if (block.type === "split") {
    return paragraphXml(block.parts.map((part, index) => runXml(part, index === 0 ? "<w:rPr><w:b/></w:rPr>" : "")).join(""));
  }
  if (block.type === "table") {
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="9000" w:type="dxa"/></w:tcPr>${paragraphXml(runXml(block.text))}</w:tc></w:tr></w:tbl>`;
  }
  if (block.type === "commented") {
    return paragraphXml(
      `<w:commentRangeStart w:id="${escapeXml(block.commentId)}"/>${runXml(block.text)}<w:commentRangeEnd w:id="${escapeXml(block.commentId)}"/><w:r><w:commentReference w:id="${escapeXml(block.commentId)}"/></w:r>`,
    );
  }
  return paragraphXml(
    `${runXml(block.prefix)}<w:ins w:id="7" w:author="${escapeXml(PWC_SYNTHETIC_REVIEWER)}" w:date="2020-01-01T00:00:00Z">${runXml(block.ins)}</w:ins><w:del w:id="8" w:author="${escapeXml(PWC_SYNTHETIC_REVIEWER)}" w:date="2020-01-01T00:00:00Z"><w:r><w:delText>${escapeXml(block.del)}</w:delText></w:r></w:del>`,
  );
}

function cleanseText(text: string, spec: PackageSpec): string {
  if (spec.targetKind === "trap_only" || !spec.targetQuote) return text;
  if (spec.targetKind === "typo") {
    const word = spec.targetQuote;
    const except = spec.expected[0]?.excludedTraps ?? [];
    let output = "";
    let cursor = 0;
    const pattern = new RegExp(`\\b${word}\\b`, "g");
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const around = text.slice(Math.max(0, start - 40), start + word.length + 40);
      if (except.some((trap) => around.includes(trap) || trap.includes(match[0] ?? ""))) {
        continue;
      }
      // Keep party-name tokens: do not replace inside an uppercase-leading proper name already copied as Recieve.
      output += text.slice(cursor, start) + spec.cleanFill;
      cursor = start + word.length;
    }
    return output + text.slice(cursor);
  }
  if (spec.targetKind === "duplicate_word") {
    const word = spec.targetQuote.trim();
    return text.replace(new RegExp(`\\b${word}[ \\t]+${word}\\b`, "g"), word);
  }
  if (spec.targetKind === "placeholder" || spec.targetKind === "missing_ref") {
    return text.replaceAll(spec.targetQuote, spec.cleanFill);
  }
  if (spec.targetKind === "duplicate_number" || spec.targetKind === "duplicate_def") {
    return text.replace(spec.targetQuote, spec.cleanFill);
  }
  return text;
}

function cleanseBlock(block: BodyBlock, spec: PackageSpec): BodyBlock {
  const targetOnly = spec.targetKind === "duplicate_number" || spec.targetKind === "duplicate_def";
  if (targetOnly && !("target" in block && block.target)) return block;
  if (block.type === "p") return { ...block, text: cleanseText(block.text, spec) };
  if (block.type === "table") return { ...block, text: cleanseText(block.text, spec) };
  if (block.type === "commented") return { ...block, text: cleanseText(block.text, spec) };
  if (block.type === "split") {
    const joined = cleanseText(block.parts.join(""), spec);
    return { type: "p", text: joined };
  }
  return { ...block, prefix: cleanseText(block.prefix, spec) };
}

const TYPO_RATIONALE = "Frozen allowlist misspelling in ordinary English prose; not a name, quote, URL or clause label.";
const DUP_WORD_RATIONALE = "Adjacent identical allowlisted function word with an ordinary space; not grammatical repetition.";
const PLACEHOLDER_RATIONALE = "Exact unfinished drafting marker; never auto-filled.";
const MISSING_REF_RATIONALE = "Explicit internal Clause/Section reference with zero targets in the checked numbering scope.";
const DUP_NUM_RATIONALE = "The same literal clause number appears twice in one numbering scope.";
const DUP_DEF_RATIONALE = "The same quoted term is declared twice in one definition scope.";

function typoExpected(ruleQuote: string, replacement: string, paragraphIndex: number, excludedTraps: readonly string[] = []): ExpectedAction[] {
  return [{
    ruleId: "language.typo_allowlist",
    ruleVersion: 1,
    kind: "correction",
    action: "track_replace",
    quote: ruleQuote,
    replacement,
    paragraphIndex,
    rationale: TYPO_RATIONALE,
    excludedTraps,
  }];
}

function dupWordExpected(word: string, paragraphIndex: number): ExpectedAction[] {
  return [{
    ruleId: "language.duplicate_word",
    ruleVersion: 1,
    kind: "correction",
    action: "track_delete",
    quote: word,
    replacement: "",
    paragraphIndex,
    rationale: DUP_WORD_RATIONALE,
    excludedTraps: ["had had", "that that"],
  }];
}

function commentExpected(
  ruleId: Extract<LaunchRuleId, "completion.placeholder" | "references.missing_target" | "references.duplicate_number" | "definitions.duplicate">,
  quote: string,
  paragraphIndex: number,
  rationale: string,
  related?: { quote: string; paragraphIndex: number },
): ExpectedAction[] {
  return [{
    ruleId,
    ruleVersion: 1,
    kind: "comment",
    action: "comment",
    quote,
    replacement: null,
    paragraphIndex,
    relatedQuote: related?.quote,
    relatedParagraphIndex: related?.paragraphIndex,
    rationale,
    excludedTraps: [],
  }];
}

export const POSITIVE_SPECS: readonly PackageSpec[] = Object.freeze([
  {
    id: "sha_typo_body",
    family: "sha",
    profile: "agreement",
    language: "en-GB",
    title: "Shareholders agreement body typo",
    capabilityTags: ["body", "uk_english"],
    supported: true,
    targetRule: "language.typo_allowlist",
    targetKind: "typo",
    targetQuote: "recieve",
    cleanFill: "receive",
    expected: typoExpected("recieve", "receive", 1),
    blocks: [
      { type: "p", text: "SHAREHOLDERS AGREEMENT" },
      { type: "p", text: "1. The Company shall recieve the notice under this Agreement.", target: true },
      { type: "p", text: "2. The Company shall deliver the notice in writing." },
    ],
  },
  {
    id: "ssa_duplicate_word",
    family: "ssa",
    profile: "agreement",
    language: "en-GB",
    title: "Share subscription duplicate function word",
    capabilityTags: ["body", "uk_english"],
    supported: true,
    targetRule: "language.duplicate_word",
    targetKind: "duplicate_word",
    targetQuote: "the",
    cleanFill: "the",
    expected: dupWordExpected("the", 1),
    blocks: [
      { type: "p", text: "SHARE SUBSCRIPTION AGREEMENT" },
      { type: "p", text: "1. The Investor shall pay the the subscription price in cleared funds.", target: true },
    ],
  },
  {
    id: "spa_placeholder",
    family: "spa",
    profile: "agreement",
    language: "en-US",
    title: "Share purchase unfilled placeholder",
    capabilityTags: ["body", "us_english", "placeholder"],
    supported: true,
    targetRule: "completion.placeholder",
    targetKind: "placeholder",
    targetQuote: "[●]",
    cleanFill: "1 March 2026",
    expected: commentExpected("completion.placeholder", "[●]", 1, PLACEHOLDER_RATIONALE),
    blocks: [
      { type: "p", text: "SHARE PURCHASE AGREEMENT" },
      { type: "p", text: "1. Completion shall occur on [●].", target: true },
      { type: "p", text: "2. The Seller shall deliver the Shares." },
    ],
  },
  {
    id: "nda_missing_ref",
    family: "nda",
    profile: "agreement",
    language: "en-GB",
    title: "NDA missing internal clause reference",
    capabilityTags: ["body", "nested_numbering"],
    supported: true,
    targetRule: "references.missing_target",
    targetKind: "missing_ref",
    targetQuote: "Clause 99.2",
    cleanFill: "Clause 1",
    expected: commentExpected("references.missing_target", "Clause 99.2", 2, MISSING_REF_RATIONALE),
    blocks: [
      { type: "p", text: "NON-DISCLOSURE AGREEMENT" },
      { type: "p", text: "1. The Recipient shall keep Confidential Information secret." },
      { type: "p", text: "2. The Recipient shall return materials under Clause 99.2.", target: true },
    ],
  },
  {
    id: "services_dup_number",
    family: "services",
    profile: "agreement",
    language: "en-GB",
    title: "Services agreement duplicate clause number",
    capabilityTags: ["body", "nested_numbering"],
    supported: true,
    targetRule: "references.duplicate_number",
    targetKind: "duplicate_number",
    targetQuote: "4.1",
    cleanFill: "4.2",
    expected: commentExpected("references.duplicate_number", "4.1", 2, DUP_NUM_RATIONALE, { quote: "4.1", paragraphIndex: 1 }),
    blocks: [
      { type: "p", text: "SERVICES AGREEMENT" },
      { type: "p", text: "4.1 The Provider shall perform the Services." },
      { type: "p", text: "4.1 The Provider shall issue a monthly report.", target: true },
    ],
  },
  {
    id: "licence_dup_def",
    family: "licence",
    profile: "agreement",
    language: "en-GB",
    title: "Licence duplicate definition",
    capabilityTags: ["body"],
    supported: true,
    targetRule: "definitions.duplicate",
    targetKind: "duplicate_def",
    targetQuote: "Licensed Materials",
    cleanFill: "Documentation",
    expected: commentExpected("definitions.duplicate", "Licensed Materials", 2, DUP_DEF_RATIONALE, { quote: "Licensed Materials", paragraphIndex: 1 }),
    blocks: [
      { type: "p", text: "LICENCE AGREEMENT" },
      { type: "p", text: '1. "Licensed Materials" means the software listed in Schedule 1.' },
      { type: "p", text: '2. "Licensed Materials" means the documentation listed in Schedule 2.', target: true },
    ],
  },
  {
    id: "employment_typo_split",
    family: "employment",
    profile: "agreement",
    language: "en-GB",
    title: "Employment typo split across runs",
    capabilityTags: ["split_runs"],
    supported: true,
    targetRule: "language.typo_allowlist",
    targetKind: "typo",
    targetQuote: "recieve",
    cleanFill: "receive",
    expected: typoExpected("recieve", "receive", 1),
    blocks: [
      { type: "p", text: "EMPLOYMENT AGREEMENT" },
      { type: "split", parts: ["The Employee shall re", "cieve", " written notice of termination."], target: true },
    ],
  },
  {
    id: "loan_dup_word_table",
    family: "loan",
    profile: "agreement",
    language: "en-GB",
    title: "Facility agreement duplicate word in a table",
    capabilityTags: ["table"],
    supported: true,
    targetRule: "language.duplicate_word",
    targetKind: "duplicate_word",
    targetQuote: "the",
    cleanFill: "the",
    expected: dupWordExpected("the", 1),
    blocks: [
      { type: "p", text: "FACILITY AGREEMENT" },
      { type: "table", text: "The Borrower shall pay the the interest on each Interest Payment Date.", target: true },
    ],
  },
  {
    id: "lease_placeholder_insert_date",
    family: "lease",
    profile: "agreement",
    language: "en-GB",
    title: "Lease unfilled insert-date placeholder",
    capabilityTags: ["body", "placeholder", "uk_english"],
    supported: true,
    targetRule: "completion.placeholder",
    targetKind: "placeholder",
    targetQuote: "[insert date]",
    cleanFill: "1 March 2026",
    expected: commentExpected("completion.placeholder", "[insert date]", 1, PLACEHOLDER_RATIONALE),
    blocks: [
      { type: "p", text: "LEASE" },
      { type: "p", text: "1. The Term starts on [insert date].", target: true },
    ],
  },
  {
    id: "amendment_typo_teh_us",
    family: "amendment",
    profile: "agreement",
    language: "en-US",
    title: "Amendment US-English allowlist typo",
    capabilityTags: ["body", "us_english"],
    supported: true,
    targetRule: "language.typo_allowlist",
    targetKind: "typo",
    targetQuote: "teh",
    cleanFill: "the",
    expected: typoExpected("teh", "the", 1),
    blocks: [
      { type: "p", text: "AMENDMENT AGREEMENT" },
      { type: "p", text: "1. The parties agree that teh amendment shall take effect on the Effective Date.", target: true },
    ],
  },
  {
    id: "schedule_dup_number",
    family: "schedule",
    profile: "agreement",
    language: "en-GB",
    title: "Schedule duplicate number with a restarted later schedule",
    capabilityTags: ["schedule_restart", "nested_numbering"],
    supported: true,
    targetRule: "references.duplicate_number",
    targetKind: "duplicate_number",
    targetQuote: "1",
    cleanFill: "2",
    expected: commentExpected("references.duplicate_number", "1", 3, DUP_NUM_RATIONALE, { quote: "1", paragraphIndex: 2 }),
    blocks: [
      { type: "p", text: "SHAREHOLDERS AGREEMENT" },
      { type: "p", text: "SCHEDULE 1" },
      { type: "p", text: "1. The Seller shall deliver the first bundle." },
      { type: "p", text: "1. The Seller shall deliver the second bundle.", target: true },
      { type: "p", text: "SCHEDULE 2" },
      { type: "p", text: "1. The Buyer shall pay the price." },
    ],
  },
  {
    id: "board_missing_ref",
    family: "board_paper",
    profile: "general",
    language: "en-GB",
    title: "Board paper missing section reference",
    capabilityTags: ["body"],
    supported: true,
    targetRule: "references.missing_target",
    targetKind: "missing_ref",
    targetQuote: "Section 12",
    cleanFill: "Section 1",
    expected: commentExpected("references.missing_target", "Section 12", 2, MISSING_REF_RATIONALE),
    blocks: [
      { type: "p", text: "BOARD PAPER" },
      { type: "p", text: "1. The committee recommends the proposal." },
      { type: "p", text: "The Board is asked to approve the item in Section 12.", target: true },
    ],
  },
  {
    id: "policy_placeholder_tbd",
    family: "policy",
    profile: "general",
    language: "en-GB",
    title: "Policy unfilled TBD placeholder",
    capabilityTags: ["placeholder"],
    supported: true,
    targetRule: "completion.placeholder",
    targetKind: "placeholder",
    targetQuote: "[TBD]",
    cleanFill: "the agreed date",
    expected: commentExpected("completion.placeholder", "[TBD]", 1, PLACEHOLDER_RATIONALE),
    blocks: [
      { type: "p", text: "INFORMATION SECURITY POLICY" },
      { type: "p", text: "1. The incident owner shall notify Legal by [TBD].", target: true },
    ],
  },
  {
    id: "report_typo_occured",
    family: "report",
    profile: "general",
    language: "en-GB",
    title: "Report allowlist typo",
    capabilityTags: ["body"],
    supported: true,
    targetRule: "language.typo_allowlist",
    targetKind: "typo",
    targetQuote: "occured",
    cleanFill: "occurred",
    expected: typoExpected("occured", "occurred", 1),
    blocks: [
      { type: "p", text: "QUARTERLY RISK REPORT" },
      { type: "p", text: "1. The delay occured after the third milestone and was reported.", target: true },
    ],
  },
  {
    id: "letter_dup_word_to",
    family: "letter",
    profile: "general",
    language: "en-GB",
    title: "Formal letter duplicate function word",
    capabilityTags: ["body"],
    supported: true,
    targetRule: "language.duplicate_word",
    targetKind: "duplicate_word",
    targetQuote: "to",
    cleanFill: "to",
    expected: dupWordExpected("to", 1),
    blocks: [
      { type: "p", text: "FORMAL LETTER" },
      { type: "p", text: "The Company shall write to to confirm the appointment.", target: true },
    ],
  },
  {
    id: "sha_party_name_and_typo",
    family: "sha",
    profile: "agreement",
    language: "en-GB",
    title: "Party-name Recieve trap with a genuine prose typo",
    capabilityTags: ["party_name_trap", "similar_parties", "repeated_text"],
    supported: true,
    targetRule: "language.typo_allowlist",
    targetKind: "typo",
    targetQuote: "recieve",
    cleanFill: "receive",
    expected: typoExpected("recieve", "receive", 3, ["Recieve Private Limited", "Recieve"]),
    blocks: [
      { type: "p", text: 'This Agreement is between Recieve Private Limited ("Holder") and Example Limited.' },
      { type: "p", text: "Recieve Private Limited shall deliver the notice to Example Limited." },
      { type: "p", text: "For and on behalf of Recieve Private Limited" },
      { type: "p", text: "The Company shall recieve the notice under this Agreement.", target: true },
    ],
  },
  {
    id: "nda_prior_revision",
    family: "nda",
    profile: "agreement",
    language: "en-GB",
    title: "NDA typo beside preserved prior tracked changes",
    capabilityTags: ["tracked_revision"],
    supported: true,
    targetRule: "language.typo_allowlist",
    targetKind: "typo",
    targetQuote: "recieve",
    cleanFill: "receive",
    expected: typoExpected("recieve", "receive", 1),
    blocks: [
      { type: "p", text: "NON-DISCLOSURE AGREEMENT" },
      { type: "p", text: "1. The Recipient shall recieve the disclosure in writing.", target: true },
      { type: "revision", prefix: "Unrelated prior review.", ins: " Added earlier.", del: "Removed earlier." },
    ],
  },
  {
    id: "spa_existing_comment",
    family: "spa",
    profile: "agreement",
    language: "en-US",
    title: "SPA placeholder beside an existing comment",
    capabilityTags: ["existing_comment", "placeholder"],
    supported: true,
    targetRule: "completion.placeholder",
    targetKind: "placeholder",
    targetQuote: "[●]",
    cleanFill: "1 March 2026",
    expected: commentExpected("completion.placeholder", "[●]", 1, PLACEHOLDER_RATIONALE),
    comments: [{ id: "0", author: PWC_SYNTHETIC_REVIEWER, text: "Existing synthetic comment stays unchanged." }],
    blocks: [
      { type: "p", text: "SHARE PURCHASE AGREEMENT" },
      { type: "p", text: "1. Completion shall occur on [●].", target: true },
      { type: "commented", text: "Unrelated prior review.", commentId: "0" },
    ],
  },
  {
    id: "services_reused_phrase",
    family: "services",
    profile: "agreement",
    language: "en-GB",
    title: "Reused phrase with a typo in only one occurrence",
    capabilityTags: ["reused_phrase", "repeated_text"],
    supported: true,
    targetRule: "language.typo_allowlist",
    targetKind: "typo",
    targetQuote: "recieve",
    cleanFill: "receive",
    expected: typoExpected("recieve", "receive", 1),
    blocks: [
      { type: "p", text: "SERVICES AGREEMENT" },
      { type: "p", text: "1. The Provider shall recieve instructions in writing.", target: true },
      { type: "p", text: "2. The Provider shall receive instructions in writing." },
    ],
  },
  {
    id: "licence_latin_names",
    family: "licence",
    profile: "agreement",
    language: "en-GB",
    title: "Latin legal phrase with a genuine allowlist typo",
    capabilityTags: ["latin_names"],
    supported: true,
    targetRule: "language.typo_allowlist",
    targetKind: "typo",
    targetQuote: "seperate",
    cleanFill: "separate",
    expected: typoExpected("seperate", "separate", 2, ["prima facie"]),
    blocks: [
      { type: "p", text: "LICENCE AGREEMENT" },
      { type: "p", text: "1. The licence is granted prima facie on the terms below." },
      { type: "p", text: "2. The Licensee shall keep a seperate register of sub-licences.", target: true },
    ],
  },
  {
    id: "employment_indian_numbers",
    family: "employment",
    profile: "agreement",
    language: "en-GB",
    title: "Indian grouping with a genuine allowlist typo",
    capabilityTags: ["indian_numbers"],
    supported: true,
    targetRule: "language.typo_allowlist",
    targetKind: "typo",
    targetQuote: "recieve",
    cleanFill: "receive",
    expected: typoExpected("recieve", "receive", 2),
    blocks: [
      { type: "p", text: "EMPLOYMENT AGREEMENT" },
      { type: "p", text: "1. The Employee's salary is INR 1,00,000 per month." },
      { type: "p", text: "2. The Employee shall recieve the salary on the last working day.", target: true },
    ],
  },
  {
    id: "loan_multilingual",
    family: "loan",
    profile: "agreement",
    language: "en-GB",
    title: "Non-English excerpt plus English duplicate word",
    capabilityTags: ["multilingual"],
    supported: true,
    targetRule: "language.duplicate_word",
    targetKind: "duplicate_word",
    targetQuote: "the",
    cleanFill: "the",
    expected: dupWordExpected("the", 2),
    blocks: [
      { type: "p", text: "FACILITY AGREEMENT" },
      { type: "p", text: "भुगतान राशि देय है।" },
      { type: "p", text: "The Borrower shall pay the the principal on the Due Date.", target: true },
    ],
  },
  {
    id: "lease_header_footer",
    family: "lease",
    profile: "agreement",
    language: "en-GB",
    title: "Header story plus body typo",
    capabilityTags: ["header_footer", "source_only_story"],
    supported: true,
    targetRule: "language.typo_allowlist",
    targetKind: "typo",
    targetQuote: "recieve",
    cleanFill: "receive",
    expected: typoExpected("recieve", "receive", 1),
    header: "LEASE recieve copy — synthetic fixture",
    blocks: [
      { type: "p", text: "LEASE" },
      { type: "p", text: "1. The Tenant shall recieve a counterpart of this Lease.", target: true },
    ],
  },
  {
    id: "amendment_similar_parties",
    family: "amendment",
    profile: "agreement",
    language: "en-GB",
    title: "Similar party names with a duplicate definition",
    capabilityTags: ["similar_parties"],
    supported: true,
    targetRule: "definitions.duplicate",
    targetKind: "duplicate_def",
    targetQuote: "Services",
    cleanFill: "Additional Services",
    expected: commentExpected("definitions.duplicate", "Services", 3, DUP_DEF_RATIONALE, { quote: "Services", paragraphIndex: 2 }),
    blocks: [
      { type: "p", text: "AMENDMENT AGREEMENT" },
      { type: "p", text: "This Amendment is between Acme Services Limited and Acme Servicing Limited." },
      { type: "p", text: '1. "Services" means the services in the Principal Agreement.' },
      { type: "p", text: '2. "Services" means the additional services in this Amendment.', target: true },
    ],
  },
] satisfies PackageSpec[]);

export function cleanTwinSpec(spec: PackageSpec): PackageSpec {
  return {
    ...spec,
    id: `${spec.id}_clean`,
    title: `${spec.title} (clean twin)`,
    expected: [],
    header: spec.header ? cleanseText(spec.header, spec) : undefined,
    blocks: spec.blocks.map((block) => cleanseBlock(block, spec)),
  };
}

export function allSpecs(): PackageSpec[] {
  return POSITIVE_SPECS.flatMap((spec) => [spec, cleanTwinSpec(spec)]);
}

function writeZipFile(zip: JSZip, name: string, data: string): void {
  zip.file(name, data, { date: DETERMINISTIC_ZIP_DATE, createFolders: false });
}

async function buildPackage(spec: PackageSpec): Promise<Buffer> {
  const zip = new JSZip();
  const rels: string[] = [];
  const overrides: string[] = [
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
  ];
  let sectPr = "<w:sectPr/>";
  const body = spec.blocks.map(renderBlock).join("");

  if (spec.header) {
    rels.push(
      '<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>',
    );
    overrides.push(
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>',
    );
    writeZipFile(
      zip,
      "word/header1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${W}"><w:p>${runXml(spec.header)}</w:p></w:hdr>`,
    );
    sectPr = `<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/></w:sectPr>`;
  }

  if (spec.comments?.length) {
    rels.push(
      '<Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>',
    );
    overrides.push(
      '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>',
    );
    const commentXml = spec.comments
      .map((comment) =>
        `<w:comment w:id="${escapeXml(comment.id)}" w:author="${escapeXml(comment.author)}" w:date="2020-01-01T00:00:00Z"><w:p>${runXml(comment.text)}</w:p></w:comment>`,
      )
      .join("");
    writeZipFile(
      zip,
      "word/comments.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W}">${commentXml}</w:comments>`,
    );
  }

  writeZipFile(
    zip,
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${overrides.join("")}</Types>`,
  );
  writeZipFile(
    zip,
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  );
  writeZipFile(
    zip,
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join("")}</Relationships>`,
  );
  writeZipFile(
    zip,
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}${sectPr}</w:body></w:document>`,
  );
  writeZipFile(
    zip,
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
  );
  writeZipFile(
    zip,
    "docProps/app.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Agmt Synthetic Corpus</Application><Pages>1</Pages></Properties>`,
  );
  writeZipFile(
    zip,
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>${escapeXml(PWC_SYNTHETIC_AUTHOR)}</dc:creator><cp:lastModifiedBy>${escapeXml(PWC_SYNTHETIC_AUTHOR)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2020-01-01T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2020-01-01T00:00:00Z</dcterms:modified><dc:title>${escapeXml(spec.title)}</dc:title><dc:description>seed=${escapeXml(PWC_CORPUS_GENERATOR_SEED)};id=${escapeXml(spec.id)}</dc:description></cp:coreProperties>`,
  );

  const buf = await zip.generateAsync({ type: "uint8array", compression: "STORE", streamFiles: false });
  return Buffer.from(buf);
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function generatePackage(spec: PackageSpec, kind: FixtureKind = spec.id.endsWith("_clean") ? "clean_twin" : "positive"): Promise<GeneratedPackage> {
  const bytes = await buildPackage(spec);
  return { spec, kind, bytes, sha256: sha256Hex(bytes), byteSize: bytes.byteLength };
}

export async function generateCorpus(): Promise<GeneratedPackage[]> {
  const out: GeneratedPackage[] = [];
  for (const spec of allSpecs()) {
    out.push(await generatePackage(spec));
  }
  return out;
}

export function bodyParagraphTexts(spec: PackageSpec): string[] {
  return spec.blocks.map(blockText);
}

export function assertTargetQuoteInSpec(spec: PackageSpec): void {
  if (spec.targetKind === "trap_only" || spec.expected.length === 0) return;
  const action = spec.expected[0];
  const texts = bodyParagraphTexts(spec);
  const paragraph = texts[action.paragraphIndex];
  if (!paragraph) throw new Error(`missing paragraph ${action.paragraphIndex} in ${spec.id}`);
  if (!paragraph.includes(action.quote.trim() === action.quote ? action.quote : action.quote.trim())) {
    // duplicate_word quote is the second token; the source contains "the the"
    if (action.ruleId === "language.duplicate_word") {
      const word = action.quote.trim();
      if (new RegExp(`\\b${word}[ \\t]+${word}\\b`).test(paragraph)) return;
    }
    throw new Error(`expected quote ${JSON.stringify(action.quote)} missing from ${spec.id} paragraph ${action.paragraphIndex}`);
  }
}

