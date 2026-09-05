import { sha256Hex } from "../crypto.ts";
import type { Severity } from "../types.ts";
import type { LaunchRuleId } from "./contracts.ts";

/** Explicit new Proof selection; CHECKS below remains the historical regression registry. */
export const LAUNCH_RULE_SET_VERSION = "proof-launch-v1";
export const LAUNCH_CHECKS: readonly Readonly<{ checkId: LaunchRuleId; version: 1 }>[] = Object.freeze([
  { checkId: "language.typo_allowlist", version: 1 },
  { checkId: "language.duplicate_word", version: 1 },
  { checkId: "completion.placeholder", version: 1 },
  { checkId: "references.missing_target", version: 1 },
  { checkId: "references.duplicate_number", version: 1 },
  { checkId: "definitions.duplicate", version: 1 },
].map((spec) => Object.freeze(spec)) as { checkId: LaunchRuleId; version: 1 }[]);

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
