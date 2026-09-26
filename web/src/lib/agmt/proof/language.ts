/**
 * English spelling dictionaries bundled with Proof. Variants such as en-IN
 * are English; they are never treated as a silent non-English skip.
 *
 * Dedicated Hunspell lists exist only for en-GB and en-US. Any other `en`
 * or `en-*` tag uses the en-GB list.
 */
export const ENGLISH_SPELLING_DICTIONARIES = ["en-GB", "en-US"] as const;
export type EnglishSpellingDictionary = (typeof ENGLISH_SPELLING_DICTIONARIES)[number];

export const ENGLISH_VARIANT_FALLBACK_DICTIONARY: EnglishSpellingDictionary = "en-GB";
export const ENGLISH_VARIANT_FALLBACK_REASON =
  "No dedicated Hunspell dictionary is bundled for this English variant; Proof uses the en-GB list.";

export type SpellingLanguageResolution = {
  english: boolean;
  dictionary: EnglishSpellingDictionary;
  fallback: "none" | "variant-en-GB" | "ui-default";
  sourceTag: string | null;
  reason: string | null;
};

export function resolveSpellingDictionary(
  paragraphLanguage: string | null | undefined,
  uiLanguage: EnglishSpellingDictionary = "en-GB",
): SpellingLanguageResolution {
  const tag = paragraphLanguage?.trim() || null;
  if (!tag) {
    return { english: true, dictionary: uiLanguage, fallback: "ui-default", sourceTag: null, reason: null };
  }
  const lower = tag.toLowerCase();
  if (lower === "en-us") {
    return { english: true, dictionary: "en-US", fallback: "none", sourceTag: tag, reason: null };
  }
  if (lower === "en-gb") {
    return { english: true, dictionary: "en-GB", fallback: "none", sourceTag: tag, reason: null };
  }
  if (lower === "en" || lower.startsWith("en-")) {
    return {
      english: true,
      dictionary: ENGLISH_VARIANT_FALLBACK_DICTIONARY,
      fallback: "variant-en-GB",
      sourceTag: tag,
      reason: ENGLISH_VARIANT_FALLBACK_REASON,
    };
  }
  return { english: false, dictionary: uiLanguage, fallback: "none", sourceTag: tag, reason: null };
}

const stylesParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
});

type OrderedNode = Record<string, unknown>;

function orderedChildren(node: OrderedNode | undefined): OrderedNode[] {
  if (!node) return [];
  const tag = Object.keys(node).find((key) => key !== ":@") ?? "";
  const value = node[tag];
  return Array.isArray(value) ? value as OrderedNode[] : value && typeof value === "object" ? [value as OrderedNode] : [];
}

function directChild(nodes: OrderedNode[], tag: string): OrderedNode | undefined {
  return nodes.find((node) => Object.keys(node).some((key) => key === tag));
}

function orderedAttributes(node: OrderedNode | undefined): Record<string, string> {
  const attrs = node?.[":@"];
  return attrs && typeof attrs === "object" ? attrs as Record<string, string> : {};
}

/** Read only `w:docDefaults/w:rPrDefault/w:rPr/w:lang/@w:val`. */
export function stylesDefaultLanguage(stylesXml: string | undefined): string | null {
  if (!stylesXml) return null;
  let parsed: OrderedNode[];
  try {
    parsed = stylesParser.parse(stylesXml) as OrderedNode[];
  } catch {
    return null;
  }
  const styles = directChild(parsed, "w:styles");
  const defaults = directChild(orderedChildren(styles), "w:docDefaults");
  const runDefaults = directChild(orderedChildren(defaults), "w:rPrDefault");
  const runProperties = directChild(orderedChildren(runDefaults), "w:rPr");
  const language = directChild(orderedChildren(runProperties), "w:lang");
  const value = orderedAttributes(language)["@_w:val"];
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
import { XMLParser } from "fast-xml-parser";
