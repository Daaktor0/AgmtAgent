/**
 * Proof index contracts (PEE-02 / PWC-39 + RE-5/RE-6).
 * Pure functions of (source, extracted). Never a published finding.
 */
import { INDEX_VERSION_V2 } from "../contracts.ts";
import type { SourceParagraph } from "../../source-map.ts";

export const INDEX_SET_VERSION = INDEX_VERSION_V2;
export const SCOPES_INDEX_VERSION = `${INDEX_VERSION_V2}-scopes` as const;
export const DEFINITIONS_INDEX_VERSION = `${INDEX_VERSION_V2}-definitions` as const;
export const REFERENCES_INDEX_VERSION = `${INDEX_VERSION_V2}-references` as const;
export const PARTIES_INDEX_VERSION = `${INDEX_VERSION_V2}-parties` as const;
export const FIGURES_INDEX_VERSION = `${INDEX_VERSION_V2}-figures` as const;

export type IndexResolution = "resolved" | "missing" | "ambiguous" | "external" | "unknown";
export type IndexCompleteness = "complete" | "incomplete";
export type NumberNamespace =
  | "clause"
  | "section"
  | "article"
  | "paragraph"
  | "schedule"
  | "annexure"
  | "annex"
  | "exhibit"
  | "appendix"
  | "part"
  | "bookmark";

export type IndexSpan = {
  partUri: string;
  storyId: string;
  paragraphPath: readonly number[];
  textStart: number;
  textEnd: number;
  exactQuote: string;
};

export type NumberingEntry = {
  scope: string;
  namespace: NumberNamespace;
  label: string;
  source: "literal" | "numbering" | "heading" | "bookmark";
  span: IndexSpan;
};

export type NumberQuery = {
  scope: string;
  namespace: NumberNamespace;
  label: string;
};

export type NumberResolution = {
  status: Exclude<IndexResolution, "external">;
  matches: readonly NumberingEntry[];
  otherScopeHits: readonly NumberingEntry[];
};

export type ScopesIndex = {
  version: typeof SCOPES_INDEX_VERSION;
  completeness: IndexCompleteness;
  gaps: readonly string[];
  entries: readonly NumberingEntry[];
};

export type DefinitionKind = "defined_term" | "defined_party";

export type DefinitionEntry = {
  term: string;
  normalisedTerm: string;
  kind: DefinitionKind;
  scope: string;
  imported: boolean;
  parentTerm: string | null;
  span: IndexSpan;
};

export type DefinitionsIndex = {
  version: typeof DEFINITIONS_INDEX_VERSION;
  completeness: IndexCompleteness;
  gaps: readonly string[];
  entries: readonly DefinitionEntry[];
};

export type ReferenceForm = "single" | "range" | "coordinated" | "relative";

export type ReferenceEndpoint = {
  label: string;
  status: IndexResolution;
};

export type ReferenceEntry = {
  form: ReferenceForm;
  namespace: NumberNamespace;
  raw: string;
  external: boolean;
  span: IndexSpan;
  scope: string;
  endpoints: readonly ReferenceEndpoint[];
};

export type ReferencesIndex = {
  version: typeof REFERENCES_INDEX_VERSION;
  completeness: IndexCompleteness;
  gaps: readonly string[];
  entries: readonly ReferenceEntry[];
};

export type PartyEntry = {
  role: string | null;
  shortName: string;
  legalName: string | null;
  definedTerm: string | null;
  signatureBlock: boolean;
  scope: string;
  span: IndexSpan;
};

export type PartiesIndex = {
  version: typeof PARTIES_INDEX_VERSION;
  completeness: IndexCompleteness;
  gaps: readonly string[];
  entries: readonly PartyEntry[];
};

export type FigureKind = "date" | "amount" | "percentage";
export type FigureParse = "parsed" | "ambiguous" | "invalid";

export type FigureEntry = {
  kind: FigureKind;
  raw: string;
  parse: FigureParse;
  canonical: string | null;
  span: IndexSpan;
};

export type FiguresIndex = {
  version: typeof FIGURES_INDEX_VERSION;
  completeness: IndexCompleteness;
  gaps: readonly string[];
  entries: readonly FigureEntry[];
};

export type ProofIndexSet = {
  version: typeof INDEX_SET_VERSION;
  digest: string;
  scopes: ScopesIndex;
  definitions: DefinitionsIndex;
  references: ReferencesIndex;
  parties: PartiesIndex;
  figures: FiguresIndex;
};

export function indexSpan(paragraph: SourceParagraph, start: number, end: number): IndexSpan | null {
  if (start < 0 || end > paragraph.text.length || end <= start) return null;
  return {
    partUri: paragraph.partUri,
    storyId: paragraph.storyId,
    paragraphPath: [...paragraph.paragraphPath],
    textStart: start,
    textEnd: end,
    exactQuote: paragraph.text.slice(start, end),
  };
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function documentNamespace(heading: string): NumberNamespace | null {
  const key = heading.toLowerCase();
  if (key.startsWith("schedule")) return "schedule";
  if (key.startsWith("annexure")) return "annexure";
  if (key === "annex" || key === "annexes") return "annex";
  if (key.startsWith("exhibit")) return "exhibit";
  if (key.startsWith("appendix") || key === "appendices") return "appendix";
  if (key === "part" || key === "parts") return "part";
  return null;
}

export function referenceNamespace(word: string): NumberNamespace {
  const key = word.toLowerCase();
  if (key.startsWith("clause") || key.startsWith("sub-clause") || key.startsWith("subclause")) return "clause";
  if (key.startsWith("section")) return "section";
  if (key.startsWith("article")) return "article";
  if (key.startsWith("paragraph")) return "paragraph";
  return documentNamespace(word) ?? "clause";
}

export function clauseLike(namespace: NumberNamespace): boolean {
  return namespace === "clause" || namespace === "section" || namespace === "article";
}
