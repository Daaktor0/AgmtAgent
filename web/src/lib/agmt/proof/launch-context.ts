import { createHash } from "node:crypto";
import type { ExtractedDocument } from "../types.ts";
import { sourceSpan, type ProofSource, type SourceParagraph } from "../source-map.ts";
import { ProofFindingSchema, type ProofFinding, type LaunchRuleId } from "./contracts.ts";
import type { IndexSpan, ProofIndexSet } from "./indexes/types.ts";

export type LaunchContext = {
  source: ProofSource;
  extracted: ExtractedDocument;
  sourceSha256: string;
  indexes?: ProofIndexSet;
  language?: "en-GB" | "en-US";
};
export type Candidate = { p: SourceParagraph; start: number; end: number; replacement?: string; comment: string; related?: ProofFinding["relatedSpans"]; scopeEvidence?: ProofFinding["scopeEvidence"] };

const PROSE_FUNCTION = /\b(?:the|a|an|of|to|and|in|for|by|with|from|that|this|please|kindly|each|any|all|or|as|shall|will|must|may|should|has|have|is|are|was|were)\b/i;

export function ordinaryProse(p: SourceParagraph, start: number, end: number, ctx: LaunchContext): boolean {
  if (!p.safe || /heading|title|address|signature/i.test(p.style ?? "")) return false;
  if (!explicitEnglish(p)) return false;
  if (/\b(?:between|registered office|residing at|on behalf of|signed by|witness|address|party name)\b/i.test(p.text)) return false;
  const at = ctx.source.paragraphs.indexOf(p);
  if (ctx.source.paragraphs.slice(0, at + 1).some((s) => /^\s*(?:IN WITNESS|SIGNATURES|EXECUTION BLOCK)/i.test(s.text))) return false;
  if (quoted(p.text, start, end)) return false;
  if (/^\s*(?:\d+(?:\.\d+)*[.)]?\s+)?[^.]{1,100}\s+(?:means|shall mean)\b/i.test(p.text) && start < p.text.search(/\b(?:means|shall mean)\b/i)) return false;
  if ([...p.text].some((c) => /\p{L}/u.test(c) && !/\p{Script=Latin}/u.test(c))) return false;
  for (const m of p.text.matchAll(/\S*(?:https?:\/\/|www\.|@|[\\/])\S*/g)) if (m.index < end && m.index + m[0].length > start) return false;
  const words = p.text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 5 || !PROSE_FUNCTION.test(p.text)) return false;
  const word = p.text.slice(start, end).trim().toLowerCase();
  for (const other of ctx.source.paragraphs) {
    for (const m of other.text.matchAll(/[“"]([^”"\n]{1,100})[”"]/g)) {
      if (m[1].toLowerCase().split(/\s+/).includes(word)) return false;
    }
  }
  return true;
}

export function candidateFinding(rule: LaunchRuleId, c: Candidate): ProofFinding {
  const quote = c.p.text.slice(c.start, c.end);
  return ProofFindingSchema.parse({
    id: createHash("sha256").update(JSON.stringify([rule, c.p.partUri, c.p.storyId, c.p.paragraphPath, c.start, c.end, quote])).digest("hex"),
    ruleId: rule, ruleVersion: 1, kind: c.replacement === undefined ? "comment" : "correction",
    category: rule.startsWith("language.") || rule.startsWith("spelling.") || rule.startsWith("punctuation.") || rule.startsWith("spacing.") ? "language"
      : rule.startsWith("definitions.") ? "definitions"
        : rule.startsWith("references.") ? "references"
          : rule.startsWith("parties.") ? "parties"
            : rule.startsWith("figures.") ? "figures"
              : "completion",
    severity: c.replacement === undefined ? "attention" : "suggestion", primarySpan: sourceSpan(c.p, c.start, c.end), relatedSpans: c.related ?? [], exactQuote: quote,
    replacement: c.replacement ?? null, comment: c.comment, scopeEvidence: c.scopeEvidence ?? null,
  });
}

export function quoted(text: string, start: number, end: number): boolean {
  const ranges = /[“"]([^”"\n]+)[”"]|‘([^’\n]+)’/g;
  for (const m of text.matchAll(ranges)) if (m.index < end && m.index + m[0].length > start) return true;
  return false;
}

export function explicitEnglish(p: SourceParagraph): boolean {
  if (!p.language) return true;
  const lang = p.language.toLowerCase();
  return lang === "en" || lang.startsWith("en-");
}

const PARAGRAPH_INDEX = new WeakMap<ProofSource, ReadonlyMap<string, SourceParagraph>>();

function paragraphKey(partUri: string, storyId: string, paragraphPath: readonly number[]): string {
  return `${partUri}:${storyId}:${paragraphPath.join(".")}`;
}

export function paragraphForSpan(source: ProofSource, span: IndexSpan): SourceParagraph | undefined {
  let index = PARAGRAPH_INDEX.get(source);
  if (!index) {
    const next = new Map<string, SourceParagraph>();
    for (const paragraph of source.paragraphs) {
      next.set(paragraphKey(paragraph.partUri, paragraph.storyId, paragraph.paragraphPath), paragraph);
    }
    index = next;
    PARAGRAPH_INDEX.set(source, index);
  }
  return index.get(paragraphKey(span.partUri, span.storyId, span.paragraphPath));
}
