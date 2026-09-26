/**
 * Deterministic duplicate/overlap resolution (PWC-09).
 *
 * Exact duplicates merge. Conflicting corrections become one comment or are
 * suppressed. Overlaps never expand across stories, cells or protected text.
 * Caps are explicit; omitted counts are recorded.
 */
import { sourceSpan, type ProofSource } from "../source-map.ts";
import { ProofFindingSchema, type ProofFinding, type SourceSpan } from "./contracts.ts";

export const FINDING_RESOLVER_VERSION = "proof-finding-resolve-v1";
export const MAX_PUBLISHED_FINDINGS = 500;
export const MAX_FINDINGS_PER_RULE = 100;
export const MAX_UNION_UTF16 = 300;

const TIER_RANK: Record<string, number> = {
  "exact-structural": 0,
  "exact-mechanical": 1,
  "bounded-heuristic": 2,
};

export type ResolveReceipt = {
  findings: ProofFinding[];
  omittedByCategory: Readonly<Record<string, number>>;
  coverageReasons: readonly string[];
};

function evidenceTier(ruleId: string): keyof typeof TIER_RANK {
  if (ruleId === "spelling.dictionary") return "bounded-heuristic";
  if (ruleId.startsWith("language.") || ruleId.startsWith("punctuation.") || ruleId.startsWith("spacing.") || ruleId === "completion.placeholder") return "exact-mechanical";
  return "exact-structural";
}

function spanIdentity(span: SourceSpan): string {
  return JSON.stringify([span.partUri, span.paragraphPath, span.textStart, span.textEnd]);
}

function duplicateKey(finding: ProofFinding): string {
  return JSON.stringify([
    spanIdentity(finding.primarySpan),
    finding.ruleId,
    finding.ruleVersion,
    finding.exactQuote,
    finding.kind,
    finding.replacement,
  ]);
}

function sameParagraph(left: SourceSpan, right: SourceSpan): boolean {
  return left.partUri === right.partUri && JSON.stringify(left.paragraphPath) === JSON.stringify(right.paragraphPath);
}

function overlaps(left: SourceSpan, right: SourceSpan): boolean {
  return sameParagraph(left, right) && left.textStart < right.textEnd && right.textStart < left.textEnd;
}

function compareFindings(left: ProofFinding, right: ProofFinding): number {
  const tier = (TIER_RANK[evidenceTier(left.ruleId)] ?? 9) - (TIER_RANK[evidenceTier(right.ruleId)] ?? 9);
  if (tier) return tier;
  const part = left.primarySpan.partUri.localeCompare(right.primarySpan.partUri);
  if (part) return part;
  const path = JSON.stringify(left.primarySpan.paragraphPath).localeCompare(JSON.stringify(right.primarySpan.paragraphPath));
  if (path) return path;
  if (left.primarySpan.textStart !== right.primarySpan.textStart) return left.primarySpan.textStart - right.primarySpan.textStart;
  if (left.primarySpan.textEnd !== right.primarySpan.textEnd) return left.primarySpan.textEnd - right.primarySpan.textEnd;
  return left.ruleId.localeCompare(right.ruleId) || left.id.localeCompare(right.id);
}

function paragraphOf(source: ProofSource, span: SourceSpan) {
  return source.paragraphs.find((paragraph) =>
    paragraph.partUri === span.partUri && JSON.stringify(paragraph.paragraphPath) === JSON.stringify(span.paragraphPath)
  );
}

function unionSpan(source: ProofSource, left: SourceSpan, right: SourceSpan): SourceSpan | null {
  if (!sameParagraph(left, right)) return null;
  const paragraph = paragraphOf(source, left);
  if (!paragraph) return null;
  const start = Math.min(left.textStart, right.textStart);
  const end = Math.max(left.textEnd, right.textEnd);
  if (end - start > MAX_UNION_UTF16) return null;
  const covered = paragraph.nodes.filter((node) => node.start < end && node.end > start);
  if (!covered.length || covered.some((node) => !node.editable && !node.revision)) return null;
  try {
    return sourceSpan(paragraph, start, end);
  } catch {
    return null;
  }
}

function mergeComments(source: ProofSource, left: ProofFinding, right: ProofFinding): ProofFinding | null {
  const reasons = [...new Set([left.comment, right.comment])];
  let span = left.primarySpan;
  let quote = left.exactQuote;
  if (spanIdentity(left.primarySpan) !== spanIdentity(right.primarySpan)) {
    const union = unionSpan(source, left.primarySpan, right.primarySpan);
    if (!union) return null;
    const paragraph = paragraphOf(source, union);
    if (!paragraph) return null;
    span = union;
    quote = paragraph.text.slice(union.textStart, union.textEnd);
  }
  const related = [...left.relatedSpans, ...right.relatedSpans, left.primarySpan, right.primarySpan]
    .filter((item, index, all) => all.findIndex((other) => spanIdentity(other) === spanIdentity(item)) === index)
    .filter((item) => spanIdentity(item) !== spanIdentity(span));
  return ProofFindingSchema.parse({
    ...left,
    kind: "comment",
    replacement: null,
    primarySpan: span,
    exactQuote: quote,
    relatedSpans: related,
    comment: reasons.join(" "),
    scopeEvidence: left.scopeEvidence ?? right.scopeEvidence,
  });
}

function asJudgmentComment(finding: ProofFinding, other: ProofFinding): ProofFinding {
  return ProofFindingSchema.parse({
    ...finding,
    kind: "comment",
    replacement: null,
    relatedSpans: [...finding.relatedSpans, other.primarySpan],
    comment: `${finding.comment} A conflicting correction was not applied automatically. Please choose the intended wording.`,
  });
}

export function resolveProofFindings(source: ProofSource, input: readonly ProofFinding[]): ResolveReceipt {
  const omitted: Record<string, number> = {};
  const reasons = new Set<string>();
  const bump = (key: string) => {
    omitted[key] = (omitted[key] ?? 0) + 1;
    reasons.add(key);
  };

  const unique: ProofFinding[] = [];
  const seen = new Map<string, ProofFinding>();
  for (const finding of [...input].sort(compareFindings)) {
    const key = duplicateKey(finding);
    const previous = seen.get(key);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(finding)) bump("duplicate_conflict");
      continue;
    }
    seen.set(key, finding);
    unique.push(finding);
  }

  const resolved: ProofFinding[] = [];
  for (const finding of unique) {
    const conflictIndex = resolved.findIndex((existing) => overlaps(existing.primarySpan, finding.primarySpan));
    if (conflictIndex < 0) {
      resolved.push(finding);
      continue;
    }
    const existing = resolved[conflictIndex]!;
    if (existing.kind === "correction" && finding.kind === "correction") {
      if (existing.replacement === finding.replacement) continue;
      const comment = asJudgmentComment(existing, finding);
      resolved[conflictIndex] = comment;
      bump("correction_conflict");
      continue;
    }
    if (existing.kind === "correction" || finding.kind === "correction") {
      const correction = existing.kind === "correction" ? existing : finding;
      const comment = existing.kind === "comment" ? existing : finding;
      const merged = mergeComments(source, { ...correction, kind: "comment", replacement: null }, comment);
      if (!merged) {
        resolved.splice(conflictIndex, 1);
        bump("overlap_unmerged");
        continue;
      }
      resolved[conflictIndex] = merged;
      continue;
    }
    const merged = mergeComments(source, existing, finding);
    if (!merged) {
      bump("overlap_unmerged");
      continue;
    }
    resolved[conflictIndex] = merged;
  }

  const perRule = new Map<string, number>();
  const capped: ProofFinding[] = [];
  for (const finding of resolved.sort(compareFindings)) {
    const count = perRule.get(finding.ruleId) ?? 0;
    if (count >= MAX_FINDINGS_PER_RULE) {
      bump("rule_budget");
      continue;
    }
    if (capped.length >= MAX_PUBLISHED_FINDINGS) {
      bump("finding_cap");
      continue;
    }
    perRule.set(finding.ruleId, count + 1);
    capped.push(finding);
  }

  return {
    findings: capped,
    omittedByCategory: omitted,
    coverageReasons: [...reasons].sort(),
  };
}
