import { CAP_STOPWORDS, PARTY_LABELS } from "../../patterns.ts";
import type { ProofSource, SourceParagraph } from "../../source-map.ts";
import {
  DEFINITIONS_INDEX_VERSION,
  indexSpan,
  type DefinitionEntry,
  type DefinitionKind,
  type DefinitionsIndex,
} from "./types.ts";

const PARTY_SET = new Set(PARTY_LABELS.map((label) => label.toLowerCase()));
const QUOTED = /[“"]([^”"]{1,90})[”"]\s+(?:means|shall mean|has the meaning|shall have the meaning)\b/gi;
const PLAIN = /^\s*(?:\d+(?:\.\d+)*[.)]?\s+)?([A-Z][A-Za-z0-9&/\- ]{1,60}?)\s+(means|shall mean|shall have the meaning)\b/;
const IMPORTED = /\b(?:has|shall have) the meaning (?:given|set out|assigned) in\b/i;
const LEGAL = /([A-Z][A-Za-z0-9&.,' \-]{3,80}?(?:Private Limited|Pvt\.?\s*Ltd\.?|Limited|LLP|Inc\.?))\s*\(\s*(?:the\s+)?[“"']([^”"']+)[”"']\s*\)/g;

function kindOf(term: string): DefinitionKind {
  return PARTY_SET.has(term.toLowerCase()) ? "defined_party" : "defined_term";
}

function plausibleTerm(term: string): boolean {
  const cleaned = term.replace(/\s+/g, " ").trim().replace(/[ ,;:]+$/, "");
  if (!cleaned || cleaned.length > 90 || ["a", "an", "the"].includes(cleaned.toLowerCase())) return false;
  if (PARTY_SET.has(cleaned.toLowerCase())) return true;
  const words = cleaned.split(/\s+/);
  if (words.some((word) => word[0] !== word[0]?.toUpperCase())) return false;
  if (words.length === 1 && CAP_STOPWORDS.has(words[0]!)) return false;
  return true;
}

function bodyKey(paragraph: SourceParagraph, termEnd: number): string {
  const rest = paragraph.text.slice(termEnd);
  const match = rest.match(/^\s*[”"']?\s*(?:means|shall mean|has the meaning|shall have the meaning)\b(.*)$/i);
  return (match?.[1] ?? rest).replace(/\s+/g, " ").trim().toLowerCase();
}

function add(
  entries: DefinitionEntry[],
  paragraph: SourceParagraph,
  term: string,
  start: number,
  end: number,
  imported: boolean,
): void {
  if (!plausibleTerm(term)) return;
  const span = indexSpan(paragraph, start, end);
  if (!span) return;
  const normalisedTerm = term.replace(/\s+/g, " ").trim().toLowerCase();
  if (entries.some((entry) =>
    entry.scope === paragraph.scope
    && entry.normalisedTerm === normalisedTerm
    && JSON.stringify(entry.span.paragraphPath) === JSON.stringify(paragraph.paragraphPath)
    && entry.span.textStart === start
  )) {
    return;
  }
  entries.push({
    term: term.replace(/\s+/g, " ").trim(),
    normalisedTerm,
    kind: kindOf(term),
    scope: paragraph.scope,
    imported,
    parentTerm: null,
    bodyKey: bodyKey(paragraph, end),
    span,
  });
}

export function buildDefinitionsIndex(source: ProofSource): DefinitionsIndex {
  const entries: DefinitionEntry[] = [];
  for (const paragraph of source.paragraphs) {
    for (const match of paragraph.text.matchAll(new RegExp(QUOTED.source, "gi"))) {
      const term = match[1]!;
      const start = match.index + match[0].indexOf(term);
      add(entries, paragraph, term, start, start + term.length, IMPORTED.test(match[0]) || IMPORTED.test(paragraph.text.slice(match.index)));
    }
    const plain = paragraph.text.match(PLAIN);
    if (plain && !paragraph.text.slice(0, plain[0].length).includes("\"")) {
      const term = plain[1]!;
      const start = paragraph.text.indexOf(term);
      add(entries, paragraph, term, start, start + term.length, IMPORTED.test(plain[0]));
    }
    for (const match of paragraph.text.matchAll(new RegExp(LEGAL.source, "g"))) {
      const term = match[2]!;
      const start = match.index + match[0].lastIndexOf(term);
      add(entries, paragraph, term, start, start + term.length, false);
    }
  }
  const bodyTerms = new Map<string, string>();
  for (const entry of entries) {
    if (entry.scope === "main_body") bodyTerms.set(entry.normalisedTerm, entry.term);
  }
  for (const entry of entries) {
    if (entry.scope === "main_body") continue;
    const parent = bodyTerms.get(entry.normalisedTerm);
    if (parent) entry.parentTerm = parent;
  }
  return {
    version: DEFINITIONS_INDEX_VERSION,
    completeness: source.complete ? "complete" : "incomplete",
    gaps: source.complete ? [] : ["incomplete_source"],
    entries,
  };
}
