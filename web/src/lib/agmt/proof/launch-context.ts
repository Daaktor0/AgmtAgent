import { createHash } from "node:crypto";
import type { ExtractedDocument } from "../types.ts";
import { sourceSpan, type ProofSource, type SourceParagraph } from "../source-map.ts";
import { ProofFindingSchema, type ProofFinding, type LaunchRuleId } from "./contracts.ts";
import type { IndexSpan, ProofIndexSet } from "./indexes/types.ts";

export type LaunchContext = { source: ProofSource; extracted: ExtractedDocument; sourceSha256: string; indexes?: ProofIndexSet };
export type Candidate = { p: SourceParagraph; start: number; end: number; replacement?: string; comment: string; related?: ProofFinding["relatedSpans"]; scopeEvidence?: ProofFinding["scopeEvidence"] };

export function candidateFinding(rule: LaunchRuleId, c: Candidate): ProofFinding {
  const quote = c.p.text.slice(c.start, c.end);
  return ProofFindingSchema.parse({
    id: createHash("sha256").update(JSON.stringify([rule, c.p.partUri, c.p.storyId, c.p.paragraphPath, c.start, c.end, quote])).digest("hex"),
    ruleId: rule, ruleVersion: 1, kind: c.replacement === undefined ? "comment" : "correction",
    category: rule.startsWith("language.") ? "language" : rule.startsWith("definitions.") ? "definitions" : rule.startsWith("references.") ? "references" : "completion",
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
