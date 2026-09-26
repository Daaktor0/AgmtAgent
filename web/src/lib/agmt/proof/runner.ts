import { PROOF_MAKES_NO_LLM_CALLS, proofLlmCallCount } from "../llm-guard.ts";
import type {
  ProofHitDraft,
  ProofSuppression,
  Provision,
  SourceCapability,
} from "../types.ts";
import { runAmount, runDefterm, runExec, runStructure, type CheckCtx } from "./checks.ts";
import { BY_ID, CHECKS, registrySha } from "./registry.ts";

export type ProofExecutionOutcome =
  | "completed_with_findings"
  | "completed_zero_findings"
  | "suppressed"
  | "failed";

export type ProofResult = {
  hits: ProofHitDraft[];
  suppressions: ProofSuppression[];
  executions: {
    checkId: string;
    checkVersion: number;
    status: "completed" | "suppressed" | "failed";
    outcome: ProofExecutionOutcome;
    missing: string[];
    hitCount: number;
    errorCode: string | null;
  }[];
  registrySha: string;
  llmCalls: number;
};

const RUNNERS: Record<string, (ctx: CheckCtx) => ProofHitDraft[]> = {
  defterm: runDefterm,
  structure: runStructure,
  exec: runExec,
  amount: runAmount,
};

/** A capability can be successfully evaluated and prove that a feature is absent. */
function capabilityEvaluated(capability: SourceCapability | undefined): boolean {
  if (!capability) return false;
  if (capability.state) {
    return capability.state === "evaluated_present" || capability.state === "evaluated_absent";
  }
  if (capability.available) return true;
  // Compatibility with ooxml-v1: these records are emitted only after the
  // corresponding package feature was inspected. "No ..." is positive absence
  // evidence, not a parser failure.
  return Boolean(capability.suppressionReason?.startsWith("No "));
}

function missingCapabilities(ctx: CheckCtx, required: string[]): string[] {
  return required.filter(
    (name) => !capabilityEvaluated(ctx.extracted.capabilities.find((cap) => cap.name === name)),
  );
}

/**
 * Deterministic Proof. Runners return provision_id + start + end only.
 * The server fills quotes from the bound canonical projection.
 *
 * A failing rule family no longer aborts the entire run. Every pinned rule gets
 * an execution outcome so the product can truthfully say complete or incomplete.
 */
export function runProof(ctx: CheckCtx): ProofResult {
  if (!PROOF_MAKES_NO_LLM_CALLS) {
    throw new Error("Proof LLM guard inverted");
  }

  const suppressions: ProofSuppression[] = [];
  const executions: ProofResult["executions"] = [];
  const ran = new Set<string>();
  const hits: ProofHitDraft[] = [];

  for (const spec of CHECKS) {
    const missing = missingCapabilities(ctx, spec.requiresCapabilities);
    if (missing.length) {
      suppressions.push({
        checkId: spec.checkId,
        checkVersion: spec.version,
        missingCapabilities: missing,
        code: "missing_capability",
      });
      executions.push({
        checkId: spec.checkId,
        checkVersion: spec.version,
        status: "suppressed",
        outcome: "suppressed",
        missing,
        hitCount: 0,
        errorCode: null,
      });
      continue;
    }

    if (ran.has(spec.runner)) continue;
    ran.add(spec.runner);

    const specsForRunner = CHECKS.filter(
      (candidate) =>
        candidate.runner === spec.runner &&
        missingCapabilities(ctx, candidate.requiresCapabilities).length === 0,
    );
    const fn = RUNNERS[spec.runner];

    let produced: ProofHitDraft[] = [];
    try {
      if (!fn) throw Object.assign(new Error("proof_runner_missing"), { code: "proof_runner_missing" });
      produced = fn(ctx);
    } catch (error) {
      const errorCode = (error as { code?: string }).code ?? "proof_runner_failed";
      for (const candidate of specsForRunner) {
        executions.push({
          checkId: candidate.checkId,
          checkVersion: candidate.version,
          status: "failed",
          outcome: "failed",
          missing: [],
          hitCount: 0,
          errorCode,
        });
      }
      continue;
    }

    const grouped = new Map<string, ProofHitDraft[]>();
    for (const hit of produced) {
      const list = grouped.get(hit.checkId) ?? [];
      list.push(hit);
      grouped.set(hit.checkId, list);
    }

    for (const candidate of specsForRunner) {
      const list = grouped.get(candidate.checkId) ?? [];
      hits.push(...list);
      executions.push({
        checkId: candidate.checkId,
        checkVersion: candidate.version,
        status: "completed",
        outcome: list.length ? "completed_with_findings" : "completed_zero_findings",
        missing: [],
        hitCount: list.length,
        errorCode: null,
      });
    }
  }

  return {
    hits,
    suppressions,
    executions,
    registrySha: registrySha(),
    llmCalls: proofLlmCallCount,
  };
}

export function fillQuote(provision: Provision, start: number, end: number): string | null {
  if (start < 0 || end > provision.canonicalLength || end <= start) return null;
  const quote = provision.canonicalText.slice(start, end);
  if (!quote.length) return null;
  return quote;
}

export function validateHit(
  hit: ProofHitDraft,
  provisions: Provision[],
): { ok: boolean; quote: string | null } {
  const provision = provisions.find((candidate) => candidate.provisionId === hit.provisionId);
  if (!provision || !provision.ownsText) return { ok: false, quote: null };
  const quote = fillQuote(provision, hit.quoteStart, hit.quoteEnd);
  if (quote == null) return { ok: false, quote: null };
  if (quote !== provision.canonicalText.slice(hit.quoteStart, hit.quoteEnd)) {
    return { ok: false, quote: null };
  }
  const spec = BY_ID[hit.checkId];
  if (!spec || spec.version !== hit.checkVersion) return { ok: false, quote: null };
  return { ok: true, quote };
}
