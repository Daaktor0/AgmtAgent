import type { ProofHitDraft } from "../types.ts";
import { BY_ID, CHECKS } from "./registry.ts";
import type { ProofResult } from "./runner.ts";

export type ProofUserState =
  | "incomplete"
  | "attention_required"
  | "clear_for_this_version";

export type ProofIssueGroup = "must_fix" | "consistency" | "language" | "formatting";

export type ProofProductSummary = {
  state: ProofUserState;
  title: string;
  description: string;
  canClaimClear: boolean;
  activeFindingCount: number;
  exactFindingCount: number;
  heuristicFindingCount: number;
  completedRuleCount: number;
  suppressedRuleCount: number;
  failedRuleCount: number;
  invalidEvidenceCount: number;
  totalRuleCount: number;
  groups: Record<ProofIssueGroup, ProofHitDraft[]>;
};

const MUST_FIX_CHECKS = new Set([
  "structure.broken_xref",
  "exec.suspicious_field",
  "exec.unfilled_placeholder",
  "exec.unresolved_comment",
  "party.header_counterparty_mismatch",
  "amount.table_prose_conflict",
]);

function issueGroup(hit: ProofHitDraft): ProofIssueGroup {
  const spec = BY_ID[hit.checkId];
  if (
    MUST_FIX_CHECKS.has(hit.checkId) ||
    (hit.certainty === "exact" && (hit.severity === "critical" || hit.severity === "high"))
  ) {
    return "must_fix";
  }
  if (spec?.family === "language") return "language";
  if (spec?.family === "formatting") return "formatting";
  return "consistency";
}

export function deriveProofProductSummary(
  result: ProofResult,
  options: { invalidEvidenceCount?: number; visibleHits?: ProofHitDraft[] } = {},
): ProofProductSummary {
  const invalidEvidenceCount = options.invalidEvidenceCount ?? 0;
  const visibleHits = options.visibleHits ?? result.hits;
  const completedRuleCount = result.executions.filter((execution) => execution.status === "completed").length;
  const suppressedRuleCount = result.executions.filter((execution) => execution.status === "suppressed").length;
  const failedRuleCount = result.executions.filter((execution) => execution.status === "failed").length;
  const everyPinnedRuleAccountedFor =
    result.executions.length === CHECKS.length &&
    new Set(result.executions.map((execution) => execution.checkId)).size === CHECKS.length;
  const coverageComplete =
    everyPinnedRuleAccountedFor &&
    suppressedRuleCount === 0 &&
    failedRuleCount === 0 &&
    invalidEvidenceCount === 0;

  const groups: Record<ProofIssueGroup, ProofHitDraft[]> = {
    must_fix: [],
    consistency: [],
    language: [],
    formatting: [],
  };
  for (const hit of visibleHits) groups[issueGroup(hit)].push(hit);

  const activeFindingCount = visibleHits.length;
  let state: ProofUserState;
  let title: string;
  let description: string;

  if (!coverageComplete) {
    state = "incomplete";
    title = "Proof finished with coverage gaps.";
    description =
      "One or more checks could not complete, or a finding could not be bound to verified evidence. No clean-document conclusion is made.";
  } else if (activeFindingCount > 0) {
    state = "attention_required";
    title = "Proof found items to check.";
    description =
      "All applicable checks completed for this version. Review the findings below before clearing the document.";
  } else {
    state = "clear_for_this_version";
    title = "No issues found by the checks listed below.";
    description =
      "All applicable checks completed for this exact uploaded version. This is not a conclusion that the document is error-free or legally correct.";
  }

  return {
    state,
    title,
    description,
    canClaimClear: state === "clear_for_this_version",
    activeFindingCount,
    exactFindingCount: visibleHits.filter((hit) => hit.certainty === "exact").length,
    heuristicFindingCount: visibleHits.filter((hit) => hit.certainty === "heuristic").length,
    completedRuleCount,
    suppressedRuleCount,
    failedRuleCount,
    invalidEvidenceCount,
    totalRuleCount: CHECKS.length,
    groups,
  };
}
