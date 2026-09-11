/**
 * Textual evidence that this file amends, restates or incorporates another
 * instrument. Used to distinguish a missing local definition/reference from
 * an unverifiable external one. Not inferred from document length.
 */
import type { ProofSource, SourceParagraph } from "../source-map.ts";
import { literalNumberingMatch } from "./indexes/scopes.ts";

export type InstrumentContext = {
  amendsNamedInstrument: boolean;
  namedInstrument: string | null;
  bulkIncorporatesDefinitions: boolean;
  restatedParagraphIds: ReadonlySet<string>;
};

const NAMED_INSTRUMENT = /\bthe\s+(Original|Principal|Existing)\s+Agreement\b/i;
const AMENDS_NAMED = /\b(?:Deed of Amendment|Deed of Variation|Deed of Rectification|Amendment Deed|Amendment Agreement|this Amendment|except as amended|deleted and replaced|all other terms of the (?:Original|Principal|Existing) Agreement|(?:Original|Principal|Existing) Agreement remains? (?:unchanged|in full force))\b/i;
const REPLACE_CLAUSE = /\b(?:Clause|Section|Article)\s+(\d+(?:\.\d+)*)\s+of\s+the\s+(Original|Principal|Existing)\s+Agreement\s+is(?:\s+hereby)?\s+deleted and replaced with the following\b/i;
const BULK_INCORPORATION = /\b(?:unless otherwise defined|words and expressions defined|terms (?:defined|used but not defined)|capitali[sz]ed terms used(?: but not defined)?|have the (?:same )?meanings?(?:\s+as)?|meanings? (?:given|ascribed|assigned|set out)(?:\s+to them)?)\b/i;

const CACHE = new WeakMap<ProofSource, InstrumentContext>();

export function paragraphIdentity(paragraph: Pick<SourceParagraph, "partUri" | "storyId" | "paragraphPath">): string {
  return `${paragraph.partUri}:${paragraph.storyId}:${paragraph.paragraphPath.join(".")}`;
}

function namedInstrumentIn(text: string): string | null {
  const match = text.match(NAMED_INSTRUMENT);
  return match ? `${match[1]} Agreement` : null;
}

export function buildInstrumentContext(paragraphs: readonly SourceParagraph[]): InstrumentContext {
  const allText = paragraphs.map((paragraph) => paragraph.text).join("\n");
  const namedInstrument = namedInstrumentIn(allText);
  const amendsNamedInstrument = Boolean(namedInstrument && AMENDS_NAMED.test(allText));
  let bulkIncorporatesDefinitions = false;
  const restatedParagraphIds = new Set<string>();

  for (const paragraph of paragraphs) {
    if (namedInstrumentIn(paragraph.text) && BULK_INCORPORATION.test(paragraph.text)) {
      bulkIncorporatesDefinitions = true;
      break;
    }
  }

  for (let index = 0; index < paragraphs.length; index += 1) {
    const match = paragraphs[index]!.text.match(REPLACE_CLAUSE);
    if (!match) continue;
    const label = match[1]!;
    for (let next = index + 1; next < paragraphs.length; next += 1) {
      const paragraph = paragraphs[next]!;
      const found = literalNumberingMatch(paragraph.text);
      if (!found) break;
      if (found.label !== label && !found.label.startsWith(`${label}.`)) break;
      restatedParagraphIds.add(paragraphIdentity(paragraph));
    }
  }

  return {
    amendsNamedInstrument,
    namedInstrument,
    bulkIncorporatesDefinitions,
    restatedParagraphIds,
  };
}

export function instrumentContext(source: ProofSource): InstrumentContext {
  const cached = CACHE.get(source);
  if (cached) return cached;
  const built = buildInstrumentContext(source.paragraphs);
  CACHE.set(source, built);
  return built;
}
