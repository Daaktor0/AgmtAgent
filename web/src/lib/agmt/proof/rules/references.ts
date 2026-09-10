/**
 * Index-backed reference rules (PEE-10 / PWC-41).
 * Comment-only. Incomplete inventories suppress absence claims.
 */
import { sourceSpan, evaluatedScope } from "../../source-map.ts";
import { absenceBlockingReasons } from "../evidence.ts";
import { LAUNCH_RULE_BY_ID } from "../registry.ts";
import { candidateFinding, paragraphForSpan, quoted, explicitEnglish, type LaunchContext } from "../launch-context.ts";
import { resolveNumber } from "../indexes/scopes.ts";
import { clauseLike } from "../indexes/types.ts";
import type { LaunchRuleId } from "../contracts.ts";
import type { ProofFinding } from "../contracts.ts";
import type { ReferenceEntry } from "../indexes/types.ts";

function scopeLabel(scope: string): string {
  return scope === "main_body" ? "main-body" : "schedule";
}

function requireCompleteReferences(ctx: LaunchContext, rule: LaunchRuleId): void {
  if (!ctx.indexes) throw new Error("incomplete_numbering_scope");
  if (!ctx.source.complete || ctx.indexes.scopes.completeness !== "complete" || ctx.indexes.references.completeness !== "complete") {
    throw new Error("incomplete_numbering_scope");
  }
  if (ctx.extracted.capabilities.some((capability) => capability.name === "numbering" && capability.state === "unsupported")) {
    throw new Error("incomplete_numbering_scope");
  }
  if (rule === "references.missing_target" || rule === "references.scope_confusion") {
    const receipt = ctx.extracted.packageCapabilityReceipt;
    if (!receipt || absenceBlockingReasons(receipt).length) throw new Error("incomplete_numbering_scope");
  }
}

function skipUse(ctx: LaunchContext, entry: ReferenceEntry): boolean {
  if (entry.external || entry.form === "relative") return true;
  const paragraph = paragraphForSpan(ctx.source, entry.span);
  if (!paragraph || !explicitEnglish(paragraph)) return true;
  if (quoted(paragraph.text, entry.span.textStart, entry.span.textEnd)) return true;
  if (/\b(?:between|registered office|residing at|on behalf of|signed by|witness)\b/i.test(paragraph.text)) return true;
  const nodes = paragraph.nodes.filter((node) => node.start < entry.span.textEnd && node.end > entry.span.textStart);
  if (nodes.some((node) => node.revision)) return true;
  return false;
}

function otherHits(entry: ReferenceEntry) {
  return entry.endpoints[0]?.otherScopeHits ?? [];
}

export function referenceRuleFindings(ctx: LaunchContext, rule: LaunchRuleId): ProofFinding[] {
  requireCompleteReferences(ctx, rule);
  const indexes = ctx.indexes!;
  const out: ProofFinding[] = [];

  if (rule === "references.duplicate_number") {
    const seen = new Map<string, (typeof indexes.scopes.entries)[number]>();
    for (const entry of indexes.scopes.entries) {
      if (!clauseLike(entry.namespace)) continue;
      const key = `${entry.scope}:${entry.label}`;
      const prior = seen.get(key);
      const paragraph = paragraphForSpan(ctx.source, entry.span);
      if (!paragraph) continue;
      if (prior) {
        const priorParagraph = paragraphForSpan(ctx.source, prior.span);
        if (!priorParagraph) continue;
        out.push(candidateFinding(rule, {
          p: paragraph,
          start: entry.span.textStart,
          end: entry.span.textEnd,
          comment: `Clause number ${entry.label} appears more than once in this scope. Please check the numbering.`,
          related: [sourceSpan(priorParagraph, prior.span.textStart, prior.span.textEnd)],
        }));
      } else seen.set(key, entry);
    }
    return out;
  }

  for (const entry of indexes.references.entries) {
    if (skipUse(ctx, entry)) continue;
    const paragraph = paragraphForSpan(ctx.source, entry.span);
    if (!paragraph) continue;
    const start = entry.span.textStart;
    const end = entry.span.textEnd;

    if (rule === "references.missing_target") {
      if (entry.form === "range") {
        if (!entry.endpoints.length || !entry.endpoints.every((endpoint) => endpoint.status === "missing")) continue;
        const labels = entry.endpoints.map((endpoint) => endpoint.label).join(" and ");
        out.push(candidateFinding(rule, {
          p: paragraph, start, end,
          comment: `${entry.raw} was not found in the checked ${scopeLabel(entry.scope)} numbering scope (both ${labels}). Please confirm the reference.`,
          scopeEvidence: evaluatedScope(ctx.source, entry.scope, 0),
        }));
        continue;
      }
      const missing = entry.endpoints.filter((endpoint) => endpoint.status === "missing");
      if (!missing.length) continue;
      if (entry.form === "single" && otherHits(entry).length && LAUNCH_RULE_BY_ID["references.scope_confusion"]?.defaultEnabled) {
        continue;
      }
      const missingLabels = missing.map((endpoint) => endpoint.label).join(" and ");
      out.push(candidateFinding(rule, {
        p: paragraph, start, end,
        comment: entry.form === "coordinated"
          ? `${entry.raw} includes ${missingLabels}, which was not found in the checked ${scopeLabel(entry.scope)} numbering scope. Please confirm the reference.`
          : `${entry.raw} was not found in the checked ${scopeLabel(entry.scope)} numbering scope. Please confirm the reference.`,
        scopeEvidence: evaluatedScope(ctx.source, entry.scope, 0),
      }));
    }

    if (rule === "references.scope_confusion") {
      if (entry.form !== "single" || entry.endpoints[0]?.status !== "missing") continue;
      const hits = otherHits(entry);
      if (!hits.length) continue;
      const other = [...new Set(hits.map((hit) => scopeLabel(hit.scope)))].join(" and ");
      out.push(candidateFinding(rule, {
        p: paragraph, start, end,
        comment: `${entry.raw} was not found in the checked ${scopeLabel(entry.scope)} numbering scope. The same number appears in ${other}. Please confirm the intended reference.`,
        scopeEvidence: evaluatedScope(ctx.source, entry.scope, 0),
      }));
    }

    if (rule === "references.ambiguous_target") {
      const ambiguous = entry.endpoints.filter((endpoint) => endpoint.status === "ambiguous");
      if (!ambiguous.length) continue;
      const matches = resolveNumber(indexes.scopes, {
        scope: entry.scope,
        namespace: entry.namespace,
        label: ambiguous[0]!.label,
      }).matches.length;
      out.push(candidateFinding(rule, {
        p: paragraph, start, end,
        comment: `${entry.raw} matches more than one numbered provision in this scope. Please confirm the intended reference.`,
        scopeEvidence: evaluatedScope(ctx.source, entry.scope, Math.max(2, matches)),
      }));
    }
  }
  return out;
}
