import { PROOF_MAKES_NO_LLM_CALLS, proofLlmCallCount } from "../llm-guard.ts";
import type { ProofHitDraft, ProofSuppression, Provision } from "../types.ts";
import { runAmount, runDefterm, runExec, runStructure, type CheckCtx } from "./checks.ts";
import { BY_ID, CHECKS, registrySha } from "./registry.ts";

export type ProofResult = {
  hits: ProofHitDraft[];
  suppressions: ProofSuppression[];
  executions: {
    checkId: string;
    checkVersion: number;
    status: "completed" | "suppressed" | "failed";
    missing: string[];
    hitCount: number;
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

/**
 * Deterministic Proof. Runners return provision_id + start + end only.
 * The server fills quotes from the bound canonical projection.
 */
export function runProof(ctx: CheckCtx): ProofResult {
  if (!PROOF_MAKES_NO_LLM_CALLS) {
    throw new Error("Proof LLM guard inverted");
  }
  const suppressions: ProofSuppression[] = [];
  const executions: ProofResult["executions"] = [];
  const ran = new Set<string>();
  const hits: ProofHitDraft[] = [];
  const capSet = new Set(
    ctx.extracted.capabilities.filter((c) => c.available).map((c) => c.name),
  );

  for (const spec of CHECKS) {
    const missing = spec.requiresCapabilities.filter((c) => !capSet.has(c));
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
        missing,
        hitCount: 0,
      });
      continue;
    }
    if (ran.has(spec.runner)) continue;
    ran.add(spec.runner);
    const fn = RUNNERS[spec.runner];
    const produced = fn ? fn(ctx) : [];
    const grouped = new Map<string, ProofHitDraft[]>();
    for (const h of produced) {
      const list = grouped.get(h.checkId) ?? [];
      list.push(h);
      grouped.set(h.checkId, list);
    }
    for (const spec2 of CHECKS.filter((c) => c.runner === spec.runner)) {
      if (spec2.requiresCapabilities.some((c) => !capSet.has(c))) continue;
      const list = grouped.get(spec2.checkId) ?? [];
      hits.push(...list);
      executions.push({
        checkId: spec2.checkId,
        checkVersion: spec2.version,
        status: "completed",
        missing: [],
        hitCount: list.length,
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
  const q = provision.canonicalText.slice(start, end);
  if (!q.length) return null;
  return q;
}

export function validateHit(hit: ProofHitDraft, provisions: Provision[]): { ok: boolean; quote: string | null } {
  const p = provisions.find((x) => x.provisionId === hit.provisionId);
  if (!p || !p.ownsText) return { ok: false, quote: null };
  const quote = fillQuote(p, hit.quoteStart, hit.quoteEnd);
  if (quote == null) return { ok: false, quote: null };
  if (quote !== p.canonicalText.slice(hit.quoteStart, hit.quoteEnd)) return { ok: false, quote: null };
  if (!BY_ID[hit.checkId]) return { ok: false, quote: null };
  return { ok: true, quote };
}
