import { PARTY_LABELS } from "../../patterns.ts";
import type { ProofSource, SourceParagraph } from "../../source-map.ts";
import type { DefinitionEntry } from "./types.ts";
import {
  PARTIES_INDEX_VERSION,
  indexSpan,
  type PartiesIndex,
  type PartyEntry,
} from "./types.ts";

const PARTY_SET = new Set(PARTY_LABELS.map((label) => label.toLowerCase()));
const LEGAL = /([A-Z][A-Za-z0-9&.,' \-]{3,80}?(?:Private Limited|Pvt\.?\s*Ltd\.?|Limited|LLP|Inc\.?))\s*\(\s*(?:the\s+)?[“"']([^”"']+)[”"']\s*\)/g;
const SIGNATURE = /^\s*(?:IN WITNESS|SIGNATURES|EXECUTION BLOCK|SIGNED by|For and on behalf)\b/i;
const ON_BEHALF = /\b(?:for and on behalf of|signed by)\s+([^.,\n]{3,90})/i;

function roleOf(term: string): string | null {
  const hit = PARTY_LABELS.find((label) => label.toLowerCase() === term.toLowerCase());
  return hit ?? null;
}

function add(entries: PartyEntry[], entry: PartyEntry): void {
  if (entries.some((prior) => prior.scope === entry.scope && prior.shortName.toLowerCase() === entry.shortName.toLowerCase() && prior.legalName === entry.legalName)) {
    return;
  }
  entries.push(entry);
}

function fromLegal(paragraph: SourceParagraph, entries: PartyEntry[]): void {
  for (const match of paragraph.text.matchAll(new RegExp(LEGAL.source, "g"))) {
    const legalName = match[1]!.trim();
    const shortName = match[2]!.trim();
    const start = match.index + match[0].lastIndexOf(shortName);
    const span = indexSpan(paragraph, start, start + shortName.length);
    if (!span) continue;
    add(entries, {
      role: roleOf(shortName),
      shortName,
      legalName,
      definedTerm: PARTY_SET.has(shortName.toLowerCase()) ? shortName : null,
      signatureBlock: false,
      scope: paragraph.scope,
      span,
    });
  }
}

export function buildPartiesIndex(source: ProofSource, definitions: readonly DefinitionEntry[]): PartiesIndex {
  const entries: PartyEntry[] = [];
  let signature = false;
  for (const paragraph of source.paragraphs) {
    if (SIGNATURE.test(paragraph.text)) signature = true;
    fromLegal(paragraph, entries);
    const behalf = paragraph.text.match(ON_BEHALF);
    if (behalf && signature) {
      const name = behalf[1]!.trim();
      const start = paragraph.text.indexOf(name);
      const span = indexSpan(paragraph, start, start + name.length);
      if (span) {
        add(entries, {
          role: null,
          shortName: name,
          legalName: name,
          definedTerm: null,
          signatureBlock: true,
          scope: paragraph.scope,
          span,
        });
      }
    }
  }
  for (const definition of definitions) {
    if (definition.kind !== "defined_party" && !roleOf(definition.term)) continue;
    add(entries, {
      role: roleOf(definition.term),
      shortName: definition.term,
      legalName: null,
      definedTerm: definition.term,
      signatureBlock: false,
      scope: definition.scope,
      span: definition.span,
    });
  }
  return {
    version: PARTIES_INDEX_VERSION,
    completeness: source.complete ? "complete" : "incomplete",
    gaps: source.complete ? [] : ["incomplete_source"],
    entries,
  };
}
