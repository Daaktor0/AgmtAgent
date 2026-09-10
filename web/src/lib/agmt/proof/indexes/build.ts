import { createHash } from "node:crypto";
import type { ExtractedDocument } from "../../types.ts";
import type { ProofSource } from "../../source-map.ts";
import { buildDefinitionsIndex } from "./definitions.ts";
import { buildFiguresIndex } from "./figures.ts";
import { buildPartiesIndex } from "./parties.ts";
import { buildReferencesIndex } from "./references.ts";
import { buildScopesIndex } from "./scopes.ts";
import { INDEX_SET_VERSION, canonicalJson, type ProofIndexSet } from "./types.ts";

export function buildProofIndexes(source: ProofSource, extracted: ExtractedDocument): ProofIndexSet {
  const scopes = buildScopesIndex(source, extracted);
  const definitions = buildDefinitionsIndex(source);
  const references = buildReferencesIndex(source, scopes);
  const parties = buildPartiesIndex(source, definitions.entries);
  const figures = buildFiguresIndex(source);
  const body = { version: INDEX_SET_VERSION, scopes, definitions, references, parties, figures };
  const digest = createHash("sha256").update(canonicalJson(body)).digest("hex");
  return { ...body, digest };
}
