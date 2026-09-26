import type { ExtractedDocument } from "../../types.ts";
import type { ProofSource, SourceParagraph } from "../../source-map.ts";
import {
  SCOPES_INDEX_VERSION,
  clauseLike,
  documentNamespace,
  indexSpan,
  type NumberQuery,
  type NumberResolution,
  type NumberingEntry,
  type NumberNamespace,
  type ScopesIndex,
} from "./types.ts";

const LITERAL_NUMBER = /^\s*(?:(?:Clause|Section|Article)\s+)?(\d+(?:\.\d+)*)(?:[.)](?=\s)|(?=\s))\s+/i;
const HEADING = /^\s*(SCHEDULE|ANNEX(?:URE)?|EXHIBIT|APPENDIX|PART)\s+([A-Za-z0-9]+)\s*(?:$|[—–:-])/i;
const LIMB = /^\s*\(([a-zA-Z]{1,4}|[ivxlcdm]{1,6})\)\s+/;

/** Paragraph-start numbering label. “Clause 4.1 of the Original Agreement…” is a citation, not a number. */
export function literalNumberingMatch(text: string): { label: string; match: RegExpMatchArray } | null {
  const match = text.match(LITERAL_NUMBER);
  if (!match) return null;
  if (/^of\b/i.test(text.slice(match[0].length))) return null;
  return { label: match[1]!, match };
}

function stripNumberingPunctuation(label: string): string {
  return label.replace(/[.)]+$/, "");
}

function headingEntry(paragraph: SourceParagraph): NumberingEntry | null {
  const match = paragraph.text.match(HEADING);
  if (!match) return null;
  const namespace = documentNamespace(match[1]!);
  if (!namespace) return null;
  const start = paragraph.text.indexOf(match[2]!);
  const span = indexSpan(paragraph, start, start + match[2]!.length);
  if (!span) return null;
  return { scope: paragraph.scope, namespace, label: match[2]!, source: "heading", span };
}

function literalEntry(paragraph: SourceParagraph): NumberingEntry | null {
  const found = literalNumberingMatch(paragraph.text);
  if (!found) return null;
  const start = found.match[0].indexOf(found.label);
  const span = indexSpan(paragraph, start, start + found.label.length);
  if (!span) return null;
  return { scope: paragraph.scope, namespace: "clause", label: found.label, source: "literal", span };
}

function limbEntry(paragraph: SourceParagraph): NumberingEntry | null {
  const match = paragraph.text.match(LIMB);
  if (!match) return null;
  const start = paragraph.text.indexOf(match[1]!);
  const span = indexSpan(paragraph, start, start + match[1]!.length);
  if (!span) return null;
  return { scope: paragraph.scope, namespace: "paragraph", label: match[1]!.toLowerCase(), source: "literal", span };
}

export function buildScopesIndex(source: ProofSource, extracted: ExtractedDocument): ScopesIndex {
  const gaps: string[] = [];
  const entries: NumberingEntry[] = [];
  const body = extracted.blocks.filter((block) => !block.isHeaderFooter);
  for (let i = 0; i < source.paragraphs.length; i++) {
    const paragraph = source.paragraphs[i]!;
    const heading = headingEntry(paragraph);
    if (heading) entries.push(heading);
    const literal = literalEntry(paragraph);
    if (literal) entries.push(literal);
    else {
      const limb = limbEntry(paragraph);
      if (limb) entries.push(limb);
    }
    const block = body[i];
    if (block?.numbering && paragraph.text.trim()) {
      if (block.text !== paragraph.text) {
        gaps.push("numbering_source_mismatch");
        continue;
      }
      const label = stripNumberingPunctuation(block.numbering);
      if (!label) continue;
      if (literal && literal.label === label) continue;
      const span = indexSpan(paragraph, 0, Math.min(paragraph.text.length, Math.max(1, label.length)));
      if (!span) continue;
      entries.push({
        scope: paragraph.scope,
        namespace: "clause",
        label,
        source: "numbering",
        span,
      });
    }
  }
  for (const bookmark of extracted.bookmarks ?? []) {
    const name = bookmark.name.trim();
    if (!name) continue;
    const paragraph = source.paragraphs.find((item) => item.text.includes(name));
    if (!paragraph) {
      gaps.push("bookmark_unanchored");
      continue;
    }
    const start = paragraph.text.indexOf(name);
    const span = indexSpan(paragraph, start, start + name.length);
    if (!span) continue;
    entries.push({ scope: paragraph.scope, namespace: "bookmark", label: name, source: "bookmark", span });
  }
  return {
    version: SCOPES_INDEX_VERSION,
    completeness: gaps.length || !source.complete ? "incomplete" : "complete",
    gaps: source.complete ? [...new Set(gaps)] : [...new Set(["incomplete_source", ...gaps])],
    entries,
  };
}

function namespacePool(namespace: NumberNamespace, label: string): (entry: NumberingEntry) => boolean {
  if (clauseLike(namespace)) {
    return (entry) => clauseLike(entry.namespace) && entry.label === label;
  }
  return (entry) => entry.namespace === namespace && entry.label === label;
}

export function resolveNumber(index: ScopesIndex, query: NumberQuery): NumberResolution {
  const pool = index.entries.filter(namespacePool(query.namespace, query.label));
  const documentLevel = query.namespace !== "clause" && query.namespace !== "section" && query.namespace !== "article" && query.namespace !== "paragraph";
  const matches = documentLevel ? pool : pool.filter((entry) => entry.scope === query.scope);
  const otherScopeHits = documentLevel ? [] : pool.filter((entry) => entry.scope !== query.scope);
  if (matches.length === 1) return { status: "resolved", matches, otherScopeHits };
  if (matches.length > 1) return { status: "ambiguous", matches, otherScopeHits };
  return { status: "missing", matches: [], otherScopeHits };
}
