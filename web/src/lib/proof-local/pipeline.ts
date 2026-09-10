import { exportProofDocx } from "../agmt/export/docx.ts";
import { analyzeProof } from "../agmt/proof/launch.ts";
import type { ProofLanguage, ProofProfile } from "../products/capabilities.ts";
import { admitLocalDocument, type LocalAdmitReceipt } from "./admit.ts";
import { PROOF_LOCAL_MAX_OUTPUT_BYTES, PROOF_LOCAL_MAX_SOURCE_BYTES } from "./limits.ts";

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
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("cancelled");
    error.name = "AbortError";
    throw error;
  }
}

function coverageLines(analysis: Awaited<ReturnType<typeof exportProofDocx>>["analysis"]): LocalProofCoverageLine[] {
  const lines: LocalProofCoverageLine[] = [];
  for (const execution of analysis.executions) {
    if (execution.outcome === "not_applicable") {
      lines.push({ kind: "not_applicable", text: execution.ruleId.replaceAll(".", " ") });
    } else if (execution.outcome === "suppressed" || execution.outcome === "failed") {
      lines.push({ kind: "skipped", text: execution.ruleId.replaceAll(".", " ") });
    } else {
      lines.push({ kind: "checked", text: execution.ruleId.replaceAll(".", " ") });
    }
  }
  for (const gap of [...new Set(analysis.gaps)]) {
    lines.push({ kind: "skipped", text: gap.replaceAll("_", " ") });
  }
  return lines;
}

/**
 * Host-agnostic Proof adapter: admit, analyze, export, JS-validate.
 * The browser worker and a future explicit server/R2 mode both call this.
 * It does not read or write persistent browser storage or R2.
 */
export async function processProofLocal(bytes: Uint8Array, options: LocalProofOptions = {}): Promise<LocalProofResult> {
  throwIfAborted(options.signal);
  if (bytes.byteLength < 1 || bytes.byteLength > PROOF_LOCAL_MAX_SOURCE_BYTES) {
    throw new Error("source_too_large");
  }
  options.onStage?.("admitting");
  const admit = admitLocalDocument(bytes);
  throwIfAborted(options.signal);

  const buffer = Buffer.from(bytes) as Buffer;
  options.onStage?.("analyzing");
  throwIfAborted(options.signal);
  const analysis = await analyzeProof(buffer, {
    profile: options.profile,
    language: options.language,
  });
  throwIfAborted(options.signal);

  options.onStage?.("exporting");
  throwIfAborted(options.signal);
  const exported = await exportProofDocx(buffer, options.now ?? new Date(), {
    profile: options.profile,
    language: options.language,
    analysis,
  });
  throwIfAborted(options.signal);
  if (exported.bytes.byteLength > PROOF_LOCAL_MAX_OUTPUT_BYTES) {
    throw new Error("output_too_large");
  }

  options.onStage?.("validating");
  // Independent JS package + reconstruction validation already ran inside exportProofDocx.
  throwIfAborted(options.signal);

  const output = exported.bytes instanceof Uint8Array
    ? new Uint8Array(exported.bytes)
    : new Uint8Array(exported.bytes);
  const corrections = exported.receipt.plan.findings.filter((finding) => finding.kind === "correction").length;
  const comments = exported.receipt.commentIds.length;
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
    admit,
    sdkInBrowser: false,
    wordInBrowser: false,
    clamavInBrowser: false,
  };
}
