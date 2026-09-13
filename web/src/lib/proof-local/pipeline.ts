import { DocxPackage } from "../agmt/docx-package.ts";
import { exportProofDocx } from "../agmt/export/docx.ts";
import { analyzeProof } from "../agmt/proof/launch.ts";
import type { ProofLanguage, ProofProfile } from "../products/capabilities.ts";
import { zipBytesView, ZipSafetyError } from "../agmt/zip-safety.ts";
import { admitLocalDocument, scanAdmittedPart, type LocalAdmitReceipt } from "./admit.ts";
import { publishedProofCapacityPolicy, type ProofCapacityPolicy } from "./policy.ts";
import { LAUNCH_RULE_SET_VERSION } from "../agmt/proof/registry.ts";
import { SPELLING_ACTION_POLICY_VERSION } from "../agmt/proof/spelling.ts";

export type LocalProofStage = "admitting" | "analyzing" | "exporting" | "validating";

export type LocalProofFinding = {
  ruleId: string;
  kind: "correction" | "comment";
  quote: string;
  replacement: string | null;
};

export type LocalProofCoverageLine = {
  kind: "checked" | "skipped" | "not_applicable";
  text: string;
};

export type LocalProofResult = {
  output: Uint8Array;
  sourceBytes: number;
  outputBytes: number;
  corrections: number;
  comments: number;
  notices: number;
  coverage: "complete" | "limited";
  coverageLines: LocalProofCoverageLine[];
  findings: LocalProofFinding[];
  requestedProfile: ProofProfile;
  appliedProfile: ProofProfile;
  profileReason: "correspondence" | null;
  ruleSetVersion: typeof LAUNCH_RULE_SET_VERSION;
  spellingActionPolicyVersion: typeof SPELLING_ACTION_POLICY_VERSION;
  admit: LocalAdmitReceipt;
  sdkInBrowser: false;
  wordInBrowser: false;
  clamavInBrowser: false;
};

export type LocalProofOptions = {
  profile?: ProofProfile;
  language?: ProofLanguage;
  now?: Date;
  signal?: AbortSignal;
  onStage?: (stage: LocalProofStage) => void;
  policy?: ProofCapacityPolicy;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("cancelled");
    error.name = "AbortError";
    throw error;
  }
}

const RULE_COVERAGE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "language.typo_allowlist": "High-confidence spelling corrections",
  "spelling.dictionary": "Dictionary spelling",
  "language.duplicate_word": "Repeated words",
  "punctuation.duplicate_mark": "Repeated punctuation",
  "spacing.accidental": "Accidental extra spaces",
  "punctuation.space_before": "Spacing before punctuation",
  "punctuation.missing_space_after": "Spacing after punctuation",
  "punctuation.unbalanced_pair": "Unmatched brackets and quotation marks",
  "completion.placeholder": "Unfinished placeholders",
  "references.missing_target": "Missing internal references",
  "references.duplicate_number": "Duplicate clause numbers",
  "references.scope_confusion": "References to another document section",
  "references.ambiguous_target": "Ambiguous internal references",
  "definitions.duplicate": "Duplicate definitions",
  "definitions.scope_redefinition": "Definitions that change by section",
  "definitions.case_variant": "Defined-term capitalisation",
  "definitions.unused": "Unused definitions",
  "definitions.undefined_use": "Terms that may be undefined",
  "parties.consistency": "Party-name consistency",
  "figures.date_invalid": "Invalid calendar dates",
  "figures.words_figures_mismatch": "Words-and-figures mismatches",
});

const GAP_COVERAGE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  prior_revision: "Text inside existing tracked changes",
  header_comments_unanchorable: "Issues in headers that would require comments",
  footers_not_checked: "Footers",
  notes_not_checked: "Footnotes and endnotes",
  fields_not_checked: "Word fields",
  protected_text_language_checks: "Protected or non-editable text",
  incomplete_checks: "One or more checks did not complete",
  rule_budget: "A check exceeded its safety budget",
  incomplete_scope: "A check could not establish complete evidence",
  missing_capability: "A required Word-document capability",
  rule_failed: "A proofreading check",
  unknown_rule_version: "A proofreading check with an unsupported version",
});

function readableGap(gap: string): string {
  return GAP_COVERAGE_LABELS[gap] ?? gap.replaceAll("_", " ");
}

function coverageLines(analysis: Awaited<ReturnType<typeof exportProofDocx>>["analysis"]): LocalProofCoverageLine[] {
  const lines: LocalProofCoverageLine[] = [];
  if (analysis.profileReason === "correspondence") {
    lines.push({
      kind: "not_applicable",
      text: "agreement-structure checks were not applied because this document appears to be correspondence",
    });
  }
  if (analysis.source.paragraphs.some((paragraph) => paragraph.nodes.some((node) => node.revision))) {
    lines.push({
      kind: "checked",
      text: "existing tracked changes were read in the final text; Proof does not insert new markup inside them, and it does not move an exact finding to another location",
    });
  }
  for (const execution of analysis.executions) {
    // A deliberately disabled rule is not part of the completed-check claim.
    if (execution.code === "default_off") continue;
    const text = RULE_COVERAGE_LABELS[execution.ruleId] ?? execution.ruleId.replaceAll(".", " ");
    if (execution.outcome === "not_applicable") {
      // Profile-mismatched rules are summarized by the applied-profile receipt.
      if (execution.code !== "profile_mismatch") lines.push({ kind: "not_applicable", text });
    } else if (execution.outcome === "suppressed" || execution.outcome === "failed") {
      lines.push({ kind: "skipped", text });
    } else {
      lines.push({ kind: "checked", text });
    }
  }
  for (const gap of [...new Set(analysis.gaps)]) {
    lines.push({ kind: "skipped", text: readableGap(gap) });
  }
  return lines.filter((line, index) => lines.findIndex((candidate) => candidate.kind === line.kind && candidate.text === line.text) === index);
}

/**
 * Host-agnostic Proof adapter: admit, analyze, export, JS-validate.
 * The browser worker and a future explicit server/R2 mode both call this.
 * It does not read or write persistent browser storage or R2.
 */
export async function processProofLocal(bytes: Uint8Array, options: LocalProofOptions = {}): Promise<LocalProofResult> {
  throwIfAborted(options.signal);
  const policy = options.policy ?? publishedProofCapacityPolicy();
  if (bytes.byteLength < 1 || bytes.byteLength > policy.maxSourceBytes) {
    throw new Error("source_too_large");
  }
  options.onStage?.("admitting");
  let pkg: DocxPackage;
  try {
    pkg = DocxPackage.open(bytes, {
      limits: policy.zip,
      verify: true,
      signal: options.signal,
      onInflated: scanAdmittedPart,
    });
  } catch (error) {
    if (error instanceof ZipSafetyError) {
      if (
        error.code.startsWith("package_")
        || error.code === "suspicious_compression_ratio"
        || error.code === "zip64_unsupported"
      ) {
        throw new Error(error.code);
      }
      throw new Error("invalid_docx_zip");
    }
    throw error;
  }
  const admit = admitLocalDocument(bytes, { policy, pkg, signal: options.signal });
  throwIfAborted(options.signal);

  const buffer = zipBytesView(bytes);
  options.onStage?.("analyzing");
  throwIfAborted(options.signal);
  const analysis = await analyzeProof(buffer, {
    profile: options.profile,
    language: options.language,
    pkg,
    maxSourceBytes: policy.maxSourceBytes,
  });
  throwIfAborted(options.signal);

  options.onStage?.("exporting");
  throwIfAborted(options.signal);
  const exported = await exportProofDocx(buffer, options.now ?? new Date(), {
    profile: options.profile,
    language: options.language,
    analysis,
    pkg,
    maxSourceBytes: policy.maxSourceBytes,
    maxOutputBytes: policy.maxOutputBytes,
    signal: options.signal,
  });
  throwIfAborted(options.signal);
  if (exported.bytes.byteLength > policy.maxOutputBytes) {
    throw new Error("output_too_large");
  }

  options.onStage?.("validating");
  // Independent JS package + reconstruction validation already ran inside exportProofDocx.
  throwIfAborted(options.signal);

  const output = new Uint8Array(exported.bytes.buffer, exported.bytes.byteOffset, exported.bytes.byteLength);
  const corrections = exported.receipt.plan.findings.filter((finding) => finding.kind === "correction").length;
  const comments = exported.receipt.commentIds.length + exported.receipt.noticeIds.length;
  return {
    output,
    sourceBytes: bytes.byteLength,
    outputBytes: output.byteLength,
    corrections,
    comments,
    notices: exported.receipt.plan.notices.length,
    coverage: exported.analysis.coverage === "limited" ? "limited" : "complete",
    coverageLines: coverageLines(exported.analysis),
    findings: exported.analysis.plan.findings.map((finding) => ({
      ruleId: finding.ruleId,
      kind: finding.kind,
      quote: finding.exactQuote,
      replacement: finding.replacement ?? null,
    })),
    requestedProfile: exported.analysis.requestedProfile,
    appliedProfile: exported.analysis.effectiveProfile,
    profileReason: exported.analysis.profileReason,
    ruleSetVersion: LAUNCH_RULE_SET_VERSION,
    spellingActionPolicyVersion: SPELLING_ACTION_POLICY_VERSION,
    admit,
    sdkInBrowser: false,
    wordInBrowser: false,
    clamavInBrowser: false,
  };
}
