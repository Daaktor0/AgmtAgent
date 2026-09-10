import type { ProofSource, SourceParagraph } from "../../source-map.ts";
import { resolveNumber } from "./scopes.ts";
import {
  REFERENCES_INDEX_VERSION,
  indexSpan,
  referenceNamespace,
  type ScopesIndex,
  type IndexResolution,
  type NumberNamespace,
  type ReferenceEndpoint,
  type ReferenceEntry,
  type ReferenceForm,
  type ReferencesIndex,
} from "./types.ts";

const HEAD = /\b((?:Sub-)?Clauses?|Sections?|Articles?|Paragraphs?|Subclauses?|Schedules?|Annexures?|Annexes?|Exhibits?|Appendices|Appendix|Parts?)\s+/gi;
const LABEL = /^(\d+(?:\.\d+)*|[IVXLCDM]{1,6}|[A-Z])\b/;
const RANGE = /^(?:\s+|,\s*)(?:to|[-–—])\s*(\d+(?:\.\d+)*|[IVXLCDM]{1,6}|[A-Z])\b/;
const COORD = /^(?:\s*,\s*|\s+and\s+)(\d+(?:\.\d+)*|[IVXLCDM]{1,6}|[A-Z])\b/;
const RELATIVE = /\b((?:this|the (?:preceding|following|next|previous))\s+(Clause|Section|Article)s?)\b/gi;
const STATUTE = /\b(?:Act|Rules|Regulations|statute|Code|other agreement)\b/i;
const OTHER_INSTRUMENT = /\bof\s+(?:the|a|an)\s+[^.;]{0,100}(?:Agreement|Deed|Document)\b/i;
const DECLARATION = /^\s*(?:(?:Clause|Section|Article)\s+)?(\d+(?:\.\d+)*)(?:[.)](?=\s)|(?=\s))\s+/i;

function sentenceAround(text: string, index: number): string {
  return text.slice(Math.max(text.lastIndexOf(";", index) + 1, 0));
}

function isExternal(paragraph: SourceParagraph, index: number, _namespace: NumberNamespace): boolean {
  const sentence = sentenceAround(paragraph.text, index);
  return STATUTE.test(sentence) || OTHER_INSTRUMENT.test(sentence);
}

function isNumberingDeclaration(paragraph: SourceParagraph, start: number, label: string): boolean {
  const match = paragraph.text.match(DECLARATION);
  if (!match || match[1] !== label) return false;
  const labelStart = match[0].indexOf(match[1]);
  return start <= labelStart;
}

function endpointStatus(
  scopes: ScopesIndex,
  paragraph: SourceParagraph,
  namespace: NumberNamespace,
  label: string,
  external: boolean,
): IndexResolution {
  if (external) return "external";
  return resolveNumber(scopes, { scope: paragraph.scope, namespace, label }).status;
}

function pushEntry(
  entries: ReferenceEntry[],
  paragraph: SourceParagraph,
  form: ReferenceForm,
  namespace: NumberNamespace,
  rawStart: number,
  rawEnd: number,
  endpoints: readonly ReferenceEndpoint[],
  external: boolean,
): void {
  const span = indexSpan(paragraph, rawStart, rawEnd);
  if (!span) return;
  entries.push({
    form,
    namespace,
    raw: span.exactQuote,
    external,
    span,
    scope: paragraph.scope,
    endpoints,
  });
}

export function buildReferencesIndex(source: ProofSource, scopes: ScopesIndex): ReferencesIndex {
  const entries: ReferenceEntry[] = [];
  for (const paragraph of source.paragraphs) {
    const occupied: { start: number; end: number }[] = [];
    const take = (start: number, end: number): boolean => {
      if (occupied.some((range) => range.start < end && start < range.end)) return false;
      occupied.push({ start, end });
      return true;
    };
    for (const match of paragraph.text.matchAll(new RegExp(HEAD.source, "gi"))) {
      const headEnd = match.index + match[0].length;
      const rest = paragraph.text.slice(headEnd);
      const first = rest.match(LABEL);
      if (!first) continue;
      const namespace = referenceNamespace(match[1]!);
      const firstEnd = headEnd + first[0].length;
      if (isNumberingDeclaration(paragraph, match.index, first[1]!)) continue;
      let cursor = firstEnd;
      let form: ReferenceForm = "single";
      const labels = [first[1]!];
      const range = paragraph.text.slice(cursor).match(RANGE);
      if (range) {
        form = "range";
        labels.push(range[1]!);
        cursor += range[0].length;
      } else {
        while (true) {
          const next = paragraph.text.slice(cursor).match(COORD);
          if (!next) break;
          form = "coordinated";
          labels.push(next[1]!);
          cursor += next[0].length;
        }
      }
      if (!take(match.index, cursor)) continue;
      const external = isExternal(paragraph, match.index, namespace);
      const endpoints = labels.map((label) => ({
        label,
        status: endpointStatus(scopes, paragraph, namespace, label, external),
      }));
      pushEntry(entries, paragraph, form, namespace, match.index, cursor, endpoints, external);
    }
    for (const match of paragraph.text.matchAll(new RegExp(RELATIVE.source, "gi"))) {
      if (!take(match.index, match.index + match[0].length)) continue;
      const namespace = referenceNamespace(match[2]!);
      pushEntry(entries, paragraph, "relative", namespace, match.index, match.index + match[0].length, [{ label: "", status: "unknown" }], false);
    }
  }
  return {
    version: REFERENCES_INDEX_VERSION,
    completeness: scopes.completeness,
    gaps: scopes.gaps,
    entries,
  };
}
