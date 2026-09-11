/**
 * Versioned launch-rule runtime (PWC-14).
 *
 * Older experimental CHECKS stay off. Failure and suppression are never a
 * clean zero-finding result. Indexes are built once per run.
 */
import type { RuleOutcome } from "../../products/contracts.ts";
import type { ProofFinding } from "./contracts.ts";
import { EvidenceError } from "./evidence.ts";
import { launchRuleFindings, type LaunchContext } from "./launch-checks.ts";
import {
  LAUNCH_RULE_REGISTRY_VERSION,
  LAUNCH_RULE_SET_VERSION,
  LAUNCH_RULE_SPECS,
  type LaunchRuleSpec,
} from "./registry.ts";

export const RULE_RUNTIME_VERSION = "proof-rule-runtime-v1";

export type RuleExecution = {
  ruleId: LaunchRuleSpec["id"];
  version: 1;
  outcome: RuleOutcome;
  findingCount: number;
  code: string | null;
};

export type RuleRuntimeReceipt = {
  registryVersion: typeof LAUNCH_RULE_REGISTRY_VERSION;
  ruleSetVersion: typeof LAUNCH_RULE_SET_VERSION;
  runtimeVersion: typeof RULE_RUNTIME_VERSION;
  findings: ProofFinding[];
  executions: RuleExecution[];
  coverageReasons: string[];
  clean: boolean;
};

export type RuleRuntimeOptions = {
  specs?: readonly LaunchRuleSpec[];
  profile?: "agreement" | "general";
  language?: "en-GB" | "en-US";
  now?: () => number;
  capabilities?: ReadonlySet<string>;
  runRule?: (ctx: LaunchContext, spec: LaunchRuleSpec) => ProofFinding[];
};

function capabilityPresent(available: ReadonlySet<string> | undefined, required: readonly string[]): string[] {
  if (!required.length) return [];
  if (!available) return [...required];
  return required.filter((name) => !available.has(name));
}

function paragraphIndex(ctx: LaunchContext): ReadonlyMap<string, number> {
  const index = new Map<string, number>();
  ctx.source.paragraphs.forEach((paragraph, order) => {
    index.set(`${paragraph.partUri}:${paragraph.storyId}:${JSON.stringify(paragraph.paragraphPath)}`, order);
  });
  return index;
}

export function executeLaunchRules(ctx: LaunchContext, options: RuleRuntimeOptions = {}): RuleRuntimeReceipt {
  void paragraphIndex(ctx);
  const specs = options.specs ?? LAUNCH_RULE_SPECS;
  const findings: ProofFinding[] = [];
  const executions: RuleExecution[] = [];
  const coverageReasons: string[] = [];
  const now = options.now ?? Date.now;
  const runtimeCtx: LaunchContext = { ...ctx, language: options.language ?? "en-GB" };

  for (const spec of specs) {
    if (Number(spec.version) !== 1) {
      executions.push({ ruleId: spec.id, version: 1, outcome: "failed", findingCount: 0, code: "unknown_rule_version" });
      coverageReasons.push("unknown_rule_version");
      continue;
    }
    if (!spec.defaultEnabled) {
      executions.push({ ruleId: spec.id, version: spec.version, outcome: "not_applicable", findingCount: 0, code: "default_off" });
      continue;
    }
    if (spec.profile !== "both" && options.profile && spec.profile !== options.profile) {
      executions.push({ ruleId: spec.id, version: spec.version, outcome: "not_applicable", findingCount: 0, code: "profile_mismatch" });
      continue;
    }
    if (options.language && !spec.languages.includes(options.language)) {
      executions.push({ ruleId: spec.id, version: spec.version, outcome: "not_applicable", findingCount: 0, code: "language_mismatch" });
      continue;
    }
    const missing = capabilityPresent(options.capabilities, spec.requiresCapabilities);
    if (missing.length) {
      executions.push({ ruleId: spec.id, version: spec.version, outcome: "suppressed", findingCount: 0, code: "missing_capability" });
      coverageReasons.push("missing_capability");
      continue;
    }

    const started = now();
    try {
      const proposed = (options.runRule ?? ((current, currentSpec) => launchRuleFindings(current, currentSpec.id)))(runtimeCtx, spec);
      if (now() - started > spec.timeBudgetMs || proposed.length > spec.maxCandidates) {
        executions.push({ ruleId: spec.id, version: spec.version, outcome: "suppressed", findingCount: 0, code: "rule_budget" });
        coverageReasons.push("rule_budget");
        continue;
      }
      findings.push(...proposed);
      executions.push({
        ruleId: spec.id,
        version: spec.version,
        outcome: proposed.length ? "completed_with_findings" : "completed_zero_findings",
        findingCount: proposed.length,
        code: null,
      });
    } catch (error) {
      const incomplete = (error instanceof EvidenceError && error.abstention)
        || (error instanceof Error && /^incomplete_/.test(error.message));
      executions.push({
        ruleId: spec.id,
        version: spec.version,
        outcome: incomplete ? "suppressed" : "failed",
        findingCount: 0,
        code: incomplete ? "incomplete_scope" : "rule_failed",
      });
      coverageReasons.push(incomplete ? "incomplete_scope" : "rule_failed");
    }
  }

  const clean = executions.length > 0
    && executions.every((execution) => execution.outcome === "completed_zero_findings")
    && findings.length === 0;
  return {
    registryVersion: LAUNCH_RULE_REGISTRY_VERSION,
    ruleSetVersion: LAUNCH_RULE_SET_VERSION,
    runtimeVersion: RULE_RUNTIME_VERSION,
    findings,
    executions,
    coverageReasons: [...new Set(coverageReasons)],
    clean,
  };
}
