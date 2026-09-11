import { createHash } from "node:crypto";
import type { ExtractedDocument } from "../types.ts";
import { sourceSpan, xmlChildren, xmlTag, type ProofSource, type SourceParagraph } from "../source-map.ts";
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
const NAME_STOP = new Set(["the", "and", "for", "of", "a", "an", "to", "in", "or", "by"]);
const PROTECTED_MARKUP = new Set(["w:fldSimple", "w:hyperlink", "w:sdt", "w:instrText", "w:fldChar"]);
const QUOTE_RANGE = /[“"]([^”"\n]+)[”"]|‘([^’\n]+)’/g;

export type QuoteKind = "none" | "defined_label" | "literal" | "prose";

export function knownTermTokens(ctx: LaunchContext): Set<string> {
  const names = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    const normalised = value.replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalised) return;
    names.add(normalised);
    for (const part of normalised.split(/[^a-z']+/)) {
      if (part.length >= 3 && !NAME_STOP.has(part)) names.add(part);
    }
  };
  for (const entry of ctx.indexes?.definitions.entries ?? []) add(entry.normalisedTerm);
  for (const entry of ctx.indexes?.parties.entries ?? []) {
    add(entry.shortName);
    add(entry.legalName);
    add(entry.definedTerm);
  }
  return names;
}

function enclosingQuote(text: string, start: number, end: number): { inner: string } | null {
  for (const match of text.matchAll(new RegExp(QUOTE_RANGE.source, "g"))) {
    if (match.index < end && match.index + match[0].length > start) {
      return { inner: (match[1] ?? match[2] ?? "").replace(/\s+/g, " ").trim() };
    }
  }
  return null;
}

export function quoteKind(text: string, start: number, end: number, ctx?: LaunchContext): QuoteKind {
  const quote = enclosingQuote(text, start, end);
  if (!quote) return "none";
  const inner = quote.inner;
  if (!inner) return "literal";
  const words = inner.split(/\s+/).filter(Boolean);
  const normalised = inner.toLowerCase();
  if (ctx) {
    const names = knownTermTokens(ctx);
    if (names.has(normalised) || words.every((word) => names.has(word.toLowerCase().replace(/[^a-z']/g, "")))) {
      return "defined_label";
    }
  }
  const titleLabel = words.length > 0 && words.length <= 6 && words.every((word) =>
    /^[A-Z][A-Za-z']*$/.test(word) || /^(?:and|of|the|for|a|an)$/i.test(word)
  );
  if (titleLabel) return "defined_label";
  if (words.length >= 5 && PROSE_FUNCTION.test(inner)) return "prose";
  return "literal";
}

function ancestorTags(source: ProofSource, nodePath: number[]): string[] {
  const tags: string[] = [];
  let nodes = source.tree;
  for (const index of nodePath) {
    const node = nodes[index];
    if (!node) break;
    tags.push(xmlTag(node));
    nodes = xmlChildren(node);
  }
  return tags;
}

export function spanHasProtectedMarkup(source: ProofSource, paragraph: SourceParagraph, start: number, end: number): boolean {
  return paragraph.nodes.some((node) =>
    node.start < end && node.end > start && ancestorTags(source, node.nodePath).some((tag) => PROTECTED_MARKUP.has(tag))
  );
}

export function ordinaryProse(p: SourceParagraph, start: number, end: number, ctx: LaunchContext): boolean {
  if (!p.safe || /heading|title|address|signature/i.test(p.style ?? "")) return false;
  if (!explicitEnglish(p)) return false;
  if (/\b(?:between|registered office|residing at|on behalf of|signed by|witness|address|party name)\b/i.test(p.text)) return false;
  const at = ctx.source.paragraphs.indexOf(p);
  if (ctx.source.paragraphs.slice(0, at + 1).some((s) => /^\s*(?:IN WITNESS|SIGNATURES|EXECUTION BLOCK)/i.test(s.text))) return false;
  const kind = quoteKind(p.text, start, end, ctx);
  if (kind === "defined_label" || kind === "literal") return false;
  if (/^\s*(?:\d+(?:\.\d+)*[.)]?\s+)?[^.]{1,100}\s+(?:means|shall mean)\b/i.test(p.text) && start < p.text.search(/\b(?:means|shall mean)\b/i)) return false;
  if ([...p.text].some((c) => /\p{L}/u.test(c) && !/\p{Script=Latin}/u.test(c))) return false;
  for (const m of p.text.matchAll(/\S*(?:https?:\/\/|www\.|@|[\\/])\S*/g)) if (m.index < end && m.index + m[0].length > start) return false;
  if (spanHasProtectedMarkup(ctx.source, p, start, end)) return false;
  const words = p.text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 5 || !PROSE_FUNCTION.test(p.text)) return false;
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
