import { sha256Hex } from "../crypto.ts";
import type { Severity } from "../types.ts";
import { EXCLUSION_POLICY_VERSION, type LaunchRuleId } from "./contracts.ts";

/** Explicit new Proof selection; CHECKS below remains the historical regression registry. */
export const LAUNCH_RULE_SET_VERSION = "proof-launch-v1";
export const LAUNCH_RULE_REGISTRY_VERSION = "proof-rule-registry-v1";
export const MAX_CANDIDATES_PER_RULE = 2_000;
export const RULE_TIME_BUDGET_MS = 2_000;

export type LaunchRuleSpec = {
  id: LaunchRuleId;
  version: 1;
  profile: "agreement" | "general" | "both";
  phase: "A" | "B";
  defaultEnabled: boolean;
  requiresCapabilities: readonly string[];
  languages: readonly ("en-GB" | "en-US")[];
  actionPolicy: "correction" | "comment";
  scopeKind: string;
  exclusionPolicyVersion: typeof EXCLUSION_POLICY_VERSION;
  evidenceValidator: "span_v2";
  maxCandidates: number;
  timeBudgetMs: number;
  evaluationReceiptHash: string;
  evidenceTier: "exact-mechanical" | "exact-structural" | "bounded-heuristic";
};

function evaluationReceipt(spec: Omit<LaunchRuleSpec, "evaluationReceiptHash">): string {
  return sha256Hex(JSON.stringify([
    LAUNCH_RULE_REGISTRY_VERSION,
    spec.id,
    spec.version,
    spec.profile,
    spec.phase,
    spec.actionPolicy,
    spec.exclusionPolicyVersion,
    spec.evidenceValidator,
  ]));
}

function launchSpec(input: Omit<LaunchRuleSpec, "evaluationReceiptHash" | "exclusionPolicyVersion" | "evidenceValidator" | "maxCandidates" | "timeBudgetMs"> & Partial<Pick<LaunchRuleSpec, "maxCandidates" | "timeBudgetMs">>): LaunchRuleSpec {
  const base = {
    ...input,
    exclusionPolicyVersion: EXCLUSION_POLICY_VERSION,
    evidenceValidator: "span_v2" as const,
    maxCandidates: input.maxCandidates ?? MAX_CANDIDATES_PER_RULE,
    timeBudgetMs: input.timeBudgetMs ?? RULE_TIME_BUDGET_MS,
  };
  const spec: LaunchRuleSpec = { ...base, evaluationReceiptHash: evaluationReceipt(base) };
  if (!spec.evaluationReceiptHash || (spec.defaultEnabled && spec.evaluationReceiptHash.length !== 64)) {
    throw new Error("missing_evaluation_receipt");
  }
  return Object.freeze(spec);
}

export const LAUNCH_RULE_SPECS: readonly LaunchRuleSpec[] = Object.freeze([
  launchSpec({ id: "language.typo_allowlist", version: 1, profile: "both", phase: "A", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "correction", scopeKind: "ordinary_prose", evidenceTier: "exact-mechanical" }),
  launchSpec({ id: "language.duplicate_word", version: 1, profile: "both", phase: "A", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "correction", scopeKind: "ordinary_prose", evidenceTier: "exact-mechanical" }),
  launchSpec({ id: "spelling.dictionary", version: 1, profile: "both", phase: "B", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "ordinary_prose", evidenceTier: "bounded-heuristic" }),
  launchSpec({ id: "punctuation.duplicate_mark", version: 1, profile: "both", phase: "B", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "correction", scopeKind: "ordinary_prose", evidenceTier: "exact-mechanical" }),
  launchSpec({ id: "spacing.accidental", version: 1, profile: "both", phase: "B", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "correction", scopeKind: "ordinary_prose", evidenceTier: "exact-mechanical" }),
  launchSpec({ id: "punctuation.space_before", version: 1, profile: "both", phase: "B", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "correction", scopeKind: "ordinary_prose", evidenceTier: "exact-mechanical" }),
  launchSpec({ id: "punctuation.missing_space_after", version: 1, profile: "both", phase: "B", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "correction", scopeKind: "ordinary_prose", evidenceTier: "exact-mechanical" }),
  launchSpec({ id: "punctuation.unbalanced_pair", version: 1, profile: "both", phase: "B", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "ordinary_prose", evidenceTier: "exact-mechanical" }),
  launchSpec({ id: "completion.placeholder", version: 1, profile: "both", phase: "A", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "visible_text", evidenceTier: "exact-mechanical" }),
  launchSpec({ id: "references.missing_target", version: 1, profile: "agreement", phase: "A", defaultEnabled: true, requiresCapabilities: ["numbering"], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "main_body_numbering", evidenceTier: "exact-structural" }),
  launchSpec({ id: "references.duplicate_number", version: 1, profile: "agreement", phase: "A", defaultEnabled: true, requiresCapabilities: ["numbering"], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "main_body_numbering", evidenceTier: "exact-structural" }),
  launchSpec({ id: "references.scope_confusion", version: 1, profile: "agreement", phase: "B", defaultEnabled: true, requiresCapabilities: ["numbering"], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "main_body_numbering", evidenceTier: "exact-structural" }),
  launchSpec({ id: "references.ambiguous_target", version: 1, profile: "agreement", phase: "B", defaultEnabled: true, requiresCapabilities: ["numbering"], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "main_body_numbering", evidenceTier: "exact-structural" }),
  launchSpec({ id: "definitions.duplicate", version: 1, profile: "agreement", phase: "A", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "declaration_inventory", evidenceTier: "exact-structural" }),
  launchSpec({ id: "definitions.scope_redefinition", version: 1, profile: "agreement", phase: "B", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "declaration_inventory", evidenceTier: "exact-structural" }),
  launchSpec({ id: "definitions.case_variant", version: 1, profile: "agreement", phase: "B", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "visible_text", evidenceTier: "exact-structural" }),
  launchSpec({ id: "definitions.unused", version: 1, profile: "agreement", phase: "B", defaultEnabled: false, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "declaration_inventory", evidenceTier: "exact-structural" }),
  launchSpec({ id: "definitions.undefined_use", version: 1, profile: "agreement", phase: "B", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "visible_text", evidenceTier: "bounded-heuristic" }),
  launchSpec({ id: "parties.consistency", version: 1, profile: "agreement", phase: "B", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "party_inventory", evidenceTier: "exact-structural" }),
  launchSpec({ id: "figures.date_invalid", version: 1, profile: "agreement", phase: "B", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "visible_text", evidenceTier: "exact-mechanical" }),
  launchSpec({ id: "figures.words_figures_mismatch", version: 1, profile: "agreement", phase: "B", defaultEnabled: true, requiresCapabilities: [], languages: ["en-GB", "en-US"], actionPolicy: "comment", scopeKind: "visible_text", evidenceTier: "exact-mechanical" }),
]);

export const LAUNCH_CHECKS: readonly Readonly<{ checkId: LaunchRuleId; version: 1 }>[] = Object.freeze(
  LAUNCH_RULE_SPECS.map((spec) => Object.freeze({ checkId: spec.id, version: spec.version })),
);

export const LAUNCH_RULE_BY_ID: Readonly<Record<LaunchRuleId, LaunchRuleSpec>> = Object.freeze(
  Object.fromEntries(LAUNCH_RULE_SPECS.map((spec) => [spec.id, spec])) as Record<LaunchRuleId, LaunchRuleSpec>,
);

export type CheckSpec = {
  checkId: string;
  version: number;
  family: string;
  defaultSeverity: Exclude<Severity, "critical">;
  certainty: "exact" | "heuristic";
  mustFind: boolean;
  requiresCapabilities: string[];
  scope: "document" | "matter";
  runner: string;
};

export const CHECKS: CheckSpec[] = [
  {
    checkId: "defterm.undefined_candidate",
    version: 1,
    family: "defterm",
    defaultSeverity: "low",
    certainty: "heuristic",
    mustFind: true,
    requiresCapabilities: [],
    scope: "document",
    runner: "defterm",
  },
  {
    checkId: "defterm.unused",
    version: 1,
    family: "defterm",
    defaultSeverity: "low",
    certainty: "exact",
    mustFind: true,
    requiresCapabilities: [],
    scope: "document",
    runner: "defterm",
  },
  {
    checkId: "structure.broken_xref",
    version: 1,
    family: "structure",
    defaultSeverity: "high",
    certainty: "exact",
    mustFind: true,
    requiresCapabilities: [],
    scope: "document",
    runner: "structure",
  },
  {
    checkId: "structure.numbering_gap",
    version: 1,
    family: "structure",
    defaultSeverity: "medium",
    certainty: "exact",
    mustFind: true,
    requiresCapabilities: [],
    scope: "document",
    runner: "structure",
  },
  {
    checkId: "structure.duplicate_number",
    version: 1,
    family: "structure",
    defaultSeverity: "medium",
    certainty: "exact",
    mustFind: true,
    requiresCapabilities: [],
    scope: "document",
    runner: "structure",
  },
  {
    checkId: "exec.signature_block_mismatch",
    version: 1,
    family: "exec",
    defaultSeverity: "medium",
    certainty: "exact",
    mustFind: true,
    requiresCapabilities: [],
    scope: "document",
    runner: "exec",
  },
  {
    checkId: "exec.hidden_character",
    version: 1,
    family: "exec",
    defaultSeverity: "medium",
    certainty: "exact",
    mustFind: true,
    requiresCapabilities: [],
    scope: "document",
    runner: "exec",
  },
  {
    checkId: "exec.suspicious_field",
    version: 1,
    family: "exec",
    defaultSeverity: "medium",
    certainty: "exact",
    mustFind: true,
    requiresCapabilities: [],
    scope: "document",
    runner: "exec",
  },
  {
    checkId: "amount.table_prose_conflict",
    version: 1,
    family: "amount",
    defaultSeverity: "high",
    certainty: "exact",
    mustFind: true,
    requiresCapabilities: [],
    scope: "document",
    runner: "amount",
  },
  {
    checkId: "party.header_counterparty_mismatch",
    version: 1,
    family: "party",
    defaultSeverity: "high",
    certainty: "exact",
    mustFind: true,
    requiresCapabilities: [],
    scope: "document",
    runner: "exec",
  },
  {
    checkId: "exec.unfilled_placeholder",
    version: 1,
    family: "exec",
    defaultSeverity: "high",
    certainty: "exact",
    mustFind: true,
    requiresCapabilities: [],
    scope: "document",
    runner: "exec",
  },
  {
    checkId: "exec.unresolved_comment",
    version: 1,
    family: "exec",
    defaultSeverity: "medium",
    certainty: "exact",
    mustFind: true,
    requiresCapabilities: ["comments"],
    scope: "document",
    runner: "exec",
  },
];

export function registrySha(): string {
  return sha256Hex(CHECKS.map((c) => `${c.checkId}:${c.version}`).join("|"));
}

export const BY_ID = Object.fromEntries(CHECKS.map((c) => [c.checkId, c]));
