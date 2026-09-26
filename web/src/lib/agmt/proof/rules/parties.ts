/**
 * Index-backed party consistency (PEE-12 / PWC-42).
 * Comment-only. String-similarity stays off.
 */
import { sourceSpan, type SourceParagraph } from "../../source-map.ts";
import { candidateFinding, paragraphForSpan, quoted, explicitEnglish, type LaunchContext } from "../launch-context.ts";
import type { LaunchRuleId, ProofFinding } from "../contracts.ts";
import type { PartyEntry } from "../indexes/types.ts";

const ENTITY = /([A-Z][A-Za-z0-9&.' \-]{2,80}?(?:Private Limited|Pvt\.?\s*Ltd\.?|Limited|Ltd\.?|LLP|Inc\.?|Pte\.?\s*Ltd\.?))/g;
const JURISDICTION = /\b(pte|inc|llc|gmbh|plc|sa|bv|nv|ag|kk)\b/;
const AFFILIATE = /\b(?:affiliate|subsidiary|holding company|parent|group compan)/i;
const THIRD_PARTY = /\b(?:witness|registered office|residing at|on behalf of|third part)/i;

function requireComplete(ctx: LaunchContext): void {
  if (!ctx.indexes) throw new Error("incomplete_party_scope");
  if (!ctx.source.complete || ctx.indexes.parties.completeness !== "complete") {
    throw new Error("incomplete_party_scope");
  }
}

function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bpvt\.?\s*ltd\.?\b/g, "private limited")
    .replace(/\bltd\.?\b/g, "limited")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function samePartyName(left: string, right: string): boolean {
  const a = normaliseName(left);
  const b = normaliseName(right);
  if (a === b) return true;
  if (a.length >= 12 && b.length >= 12 && (a.endsWith(b) || b.endsWith(a))) return true;
  return false;
}

function differentEntity(left: string, right: string): boolean {
  if (samePartyName(left, right)) return false;
  const a = normaliseName(left);
  const b = normaliseName(right);
  const aJ = a.match(JURISDICTION)?.[1];
  const bJ = b.match(JURISDICTION)?.[1];
  if (aJ !== bJ) return true;
  return false;
}

function declaredNames(entries: readonly PartyEntry[]): Set<string> {
  const names = new Set<string>();
  for (const entry of entries) {
    names.add(normaliseName(entry.shortName));
    if (entry.legalName) names.add(normaliseName(entry.legalName));
  }
  return names;
}

function inRevision(paragraph: SourceParagraph, start: number, end: number): boolean {
  return paragraph.nodes.some((node) => node.revision && node.start < end && node.end > start);
}

export function partyRuleFindings(ctx: LaunchContext, rule: LaunchRuleId): ProofFinding[] {
  requireComplete(ctx);
  if (rule !== "parties.consistency") return [];
  const indexes = ctx.indexes!;
  const out: ProofFinding[] = [];
  const bound = indexes.parties.entries.filter((entry) => entry.legalName && entry.role && !entry.signatureBlock);
  const known = declaredNames(indexes.parties.entries);

  for (const entry of bound) {
    const rolePattern = new RegExp(`\\b${entry.role!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    for (const paragraph of ctx.source.paragraphs) {
      if (!explicitEnglish(paragraph) || quoted(paragraph.text, 0, Math.min(12, paragraph.text.length))) continue;
      if (THIRD_PARTY.test(paragraph.text) || AFFILIATE.test(paragraph.text)) continue;
      if (!rolePattern.test(paragraph.text)) continue;
      if (JSON.stringify(entry.span.paragraphPath) === JSON.stringify(paragraph.paragraphPath)) continue;
      for (const match of paragraph.text.matchAll(new RegExp(ENTITY.source, "g"))) {
        const name = match[1]!.trim();
        const start = match.index;
        const end = start + name.length;
        if (inRevision(paragraph, start, end) || quoted(paragraph.text, start, end)) continue;
        if (samePartyName(name, entry.legalName!)) continue;
        if (known.has(normaliseName(name))) continue;
        if (differentEntity(name, entry.legalName!)) continue;
        const declaration = paragraphForSpan(ctx.source, entry.span);
        out.push(candidateFinding(rule, {
          p: paragraph,
          start,
          end,
          comment: `Review question: this name is used with “${entry.role}” but does not match the declared name “${entry.legalName}”. Please confirm the intended party.`,
          related: declaration ? [sourceSpan(declaration, entry.span.textStart, entry.span.textEnd)] : [],
        }));
      }
    }
  }

  const operativeRoles = new Set(bound.map((entry) => entry.role!.toLowerCase()));
  const signatureRoles = new Set(
    indexes.parties.entries.filter((entry) => entry.signatureBlock && entry.role).map((entry) => entry.role!.toLowerCase()),
  );
  const hasSignature = indexes.parties.entries.some((entry) => entry.signatureBlock)
    || ctx.source.paragraphs.some((paragraph) => /^\s*(?:IN WITNESS|SIGNATURES|EXECUTION BLOCK)/i.test(paragraph.text));
  if (hasSignature) {
    for (const entry of bound) {
      if (signatureRoles.has(entry.role!.toLowerCase())) continue;
      if (!operativeRoles.has(entry.role!.toLowerCase())) continue;
      const paragraph = paragraphForSpan(ctx.source, entry.span);
      if (!paragraph) continue;
      out.push(candidateFinding(rule, {
        p: paragraph,
        start: entry.span.textStart,
        end: entry.span.textEnd,
        comment: `Review question: “${entry.role}” appears in the operative text but was not found in the signature block. Please confirm the execution parties.`,
      }));
    }
  }
  return out;
}
