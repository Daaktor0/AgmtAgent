import { ingestBuffer, applyMap, runConfirmedProof } from "../pipeline.ts";
import { buildDocx } from "../docx.ts";
import { CHECKS } from "../proof/registry.ts";
import type { CorpusFixture, CorpusVerdict, ProofLabel } from "./types.ts";

function haystack(hit: {
  checkId: string;
  quote: string | null;
  detailCode: string;
  detailArgs: Record<string, string | number | null>;
}): string {
  return `${hit.checkId} ${hit.quote ?? ""} ${hit.detailCode} ${JSON.stringify(hit.detailArgs ?? {})}`.toLowerCase();
}

function matches(hit: Parameters<typeof haystack>[0], label: ProofLabel): boolean {
  if (hit.checkId !== label.checkId) return false;
  if (!label.needle) return true;
  return haystack(hit).includes(label.needle.toLowerCase());
}

export async function evalFixture(fixture: CorpusFixture): Promise<CorpusVerdict> {
  const bytes = await buildDocx(fixture.paragraphs, { pages: 3, ...fixture.docx });
  const ingested = await ingestBuffer(bytes);
  if (ingested.refused) {
    return {
      fixtureId: fixture.id,
      missedMustFind: fixture.labels.filter((l) => l.kind === "must_find"),
      trapFires: [],
      notADefectFires: [],
      suppressions: [],
      hitCounts: {},
      ok: false,
    };
  }
  const confirmed = applyMap(ingested.proposed.provisions, ingested.proposed.entries);
  const proof = runConfirmedProof(confirmed, ingested.definitions, ingested.uses, ingested.extracted);
  const filled = proof.filled.filter((f) => f.valid).map((f) => ({
    checkId: f.hit.checkId,
    quote: f.quote,
    detailCode: f.hit.detailCode,
    detailArgs: f.hit.detailArgs,
  }));

  const missedMustFind: ProofLabel[] = [];
  const trapFires: CorpusVerdict["trapFires"] = [];
  const notADefectFires: CorpusVerdict["notADefectFires"] = [];

  for (const label of fixture.labels) {
    const hits = filled.filter((h) => matches(h, label));
    if (label.kind === "must_find" && hits.length === 0) missedMustFind.push(label);
    if (label.kind === "trap") {
      for (const h of hits) trapFires.push({ label, quote: h.quote ?? "" });
    }
    if (label.kind === "not_a_defect") {
      for (const h of hits) notADefectFires.push({ label, quote: h.quote ?? "" });
    }
  }

  const hitCounts: Record<string, number> = {};
  for (const h of filled) hitCounts[h.checkId] = (hitCounts[h.checkId] ?? 0) + 1;

  const suppressions = proof.result.suppressions.map((s) => ({
    checkId: s.checkId,
    missing: s.missingCapabilities,
  }));

  return {
    fixtureId: fixture.id,
    missedMustFind,
    trapFires,
    notADefectFires,
    suppressions,
    hitCounts,
    ok: missedMustFind.length === 0 && trapFires.length === 0 && notADefectFires.length === 0,
  };
}

export function coverageGaps(verdicts: CorpusVerdict[], fixtures: CorpusFixture[]): string[] {
  const must = new Set<string>();
  const exceptions = new Set<string>();
  for (const f of fixtures) {
    for (const l of f.labels) {
      if (l.kind === "must_find") must.add(l.checkId);
      else exceptions.add(l.checkId);
    }
  }
  const gaps: string[] = [];
  for (const spec of CHECKS) {
    if (!must.has(spec.checkId)) gaps.push(`missing must-find for ${spec.checkId}`);
    if (!exceptions.has(spec.checkId)) gaps.push(`missing trap/not-a-defect for ${spec.checkId}`);
  }
  void verdicts;
  return gaps;
}

/** User “not a defect” is a ticket only — never a suppression code. */
export const NOT_A_DEFECT_IS_TICKET_ONLY = true;
