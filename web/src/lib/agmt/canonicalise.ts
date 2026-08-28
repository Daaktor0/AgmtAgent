/**
 * Canonicalisation (SPEC §4.5):
 * 1. Protect defined-term tokens.
 * 2. Replace running legal names that have an explicit defined term.
 * 3. Run Indian identifier recognisers.
 * 4. Replace confirmed identifiers with version-scoped placeholders.
 * 5. Do not mask amounts, dates, percentages, clause numbers, governing law, or defined terms.
 *
 * Source offsets always refer to the immutable source provision. Any user decision
 * rebuilds both the canonical projection and the bidirectional span segments from
 * that source; stale proposal segments must never survive a confirmed map.
 */
import { newId } from "./ids.ts";
import { detectIdentifiers } from "./identifiers.ts";
import { RECOGNISER_VERSION } from "./config.ts";
import { sha256Hex } from "./crypto.ts";
import type { Definition, ProposedEntry, Provision, SpanSegment } from "./types.ts";

export type CanonicalResult = {
  provisions: Provision[];
  entries: ProposedEntry[];
  segments: SpanSegment[];
  placeholderIndex: Record<string, string>;
};

type Piece = {
  start: number;
  end: number;
  replacement: string;
  entryId: string;
};

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && a.end > b.start;
}

function projectProvision(
  provision: Provision,
  original: string,
  entries: ProposedEntry[],
): { provision: Provision; segments: SpanSegment[] } {
  if (!provision.ownsText) return { provision: { ...provision }, segments: [] };

  const active = entries
    .filter((e) => e.userDecision !== "not_identifier")
    .slice()
    .sort((a, b) => a.sourceStart - b.sourceStart || a.sourceEnd - b.sourceEnd);

  let sourceCursor = 0;
  let canonical = "";
  const segments: SpanSegment[] = [];

  const pushSegment = (
    sourceStart: number,
    sourceEnd: number,
    canonicalStart: number,
    canonicalEnd: number,
    replacementEntryId: string | null,
  ) => {
    segments.push({
      segmentId: newId(),
      provisionId: provision.provisionId,
      canonicalStart,
      canonicalEnd,
      sourceStart,
      sourceEnd,
      replacementEntryId,
    });
  };

  for (const entry of active) {
    if (
      entry.sourceStart < sourceCursor ||
      entry.sourceStart < 0 ||
      entry.sourceEnd < entry.sourceStart ||
      entry.sourceEnd > original.length
    ) {
      throw Object.assign(new Error("canonicalisation_overlap_or_bounds"), {
        code: "canonicalisation_overlap_or_bounds",
        entryId: entry.entryId,
      });
    }
    if (original.slice(entry.sourceStart, entry.sourceEnd) !== entry.originalValue) {
      throw Object.assign(new Error("canonicalisation_source_mismatch"), {
        code: "canonicalisation_source_mismatch",
        entryId: entry.entryId,
      });
    }

    if (entry.sourceStart > sourceCursor) {
      const untouched = original.slice(sourceCursor, entry.sourceStart);
      const start = canonical.length;
      canonical += untouched;
      pushSegment(sourceCursor, entry.sourceStart, start, canonical.length, null);
    }

    const start = canonical.length;
    canonical += entry.replacement;
    pushSegment(
      entry.sourceStart,
      entry.sourceEnd,
      start,
      canonical.length,
      entry.entryId,
    );
    sourceCursor = entry.sourceEnd;
  }

  if (sourceCursor < original.length) {
    const untouched = original.slice(sourceCursor);
    const start = canonical.length;
    canonical += untouched;
    pushSegment(sourceCursor, original.length, start, canonical.length, null);
  }

  if (!active.length) {
    canonical = original;
    if (original.length) pushSegment(0, original.length, 0, original.length, null);
  }

  return {
    provision: { ...provision, canonicalText: canonical, canonicalLength: canonical.length },
    segments,
  };
}

function reconstructSource(base: CanonicalResult, provision: Provision): string {
  if (!provision.ownsText) return provision.canonicalText;
  const segments = base.segments
    .filter((s) => s.provisionId === provision.provisionId)
    .slice()
    .sort((a, b) => a.canonicalStart - b.canonicalStart);
  if (!segments.length) return provision.canonicalText;

  const byEntry = new Map(base.entries.map((e) => [e.entryId, e]));
  let original = "";
  for (const segment of segments) {
    if (segment.replacementEntryId) {
      const entry = byEntry.get(segment.replacementEntryId);
      if (!entry) {
        throw Object.assign(new Error("canonicalisation_segment_entry_missing"), {
          code: "canonicalisation_segment_entry_missing",
          entryId: segment.replacementEntryId,
        });
      }
      original += entry.originalValue;
    } else {
      original += provision.canonicalText.slice(segment.canonicalStart, segment.canonicalEnd);
    }
  }
  return original;
}

export function proposeCanonicalisation(
  provisions: Provision[],
  definitions: Definition[],
): CanonicalResult {
  const entries: ProposedEntry[] = [];
  const placeholderIndex: Record<string, string> = {};
  const placeholderSeq: Record<string, number> = {};
  const nameDefs = definitions.filter((d) => d.legalName);

  for (const p of provisions) {
    if (!p.ownsText) continue;
    const original = p.canonicalText;
    const pieces: Piece[] = [];

    const protectedSpans: [number, number][] = [];
    for (const d of definitions) {
      if (d.scopeId !== p.scopeId && !(d.scopeType === "main_body" && p.scopeType === "main_body")) {
        continue;
      }
      const rx = new RegExp(`\\b${escapeRe(d.term)}\\b`, "g");
      let m: RegExpExecArray | null;
      while ((m = rx.exec(original))) protectedSpans.push([m.index, m.index + m[0].length]);
    }

    for (const d of nameDefs) {
      if (d.legalName === d.term) continue;
      if (d.scopeType !== "main_body" && d.scopeId !== p.scopeId) continue;
      const rx = new RegExp(escapeRe(d.legalName!), "g");
      let m: RegExpExecArray | null;
      while ((m = rx.exec(original))) {
        const candidate = { start: m.index, end: m.index + m[0].length };
        if (pieces.some((piece) => overlaps(candidate, piece))) continue;
        const entryId = newId();
        entries.push({
          entryId,
          kind: "legal_name",
          identifierType: null,
          sourceProvisionId: p.provisionId,
          sourceStart: candidate.start,
          sourceEnd: candidate.end,
          originalValue: m[0],
          replacement: d.term,
          definedTermId: d.definitionId,
          detector: "defined_term_map",
          confidence: 0.95,
          userDecision: "accept",
        });
        pieces.push({ ...candidate, replacement: d.term, entryId });
      }
    }

    for (const hit of detectIdentifiers(original, protectedSpans)) {
      if (pieces.some((piece) => overlaps({ start: hit.start, end: hit.end }, piece))) continue;
      const key = `${hit.type}:${hit.value}`;
      if (!placeholderIndex[key]) {
        placeholderSeq[hit.type] = (placeholderSeq[hit.type] ?? 0) + 1;
        placeholderIndex[key] = `[${hit.type.toUpperCase()}_${placeholderSeq[hit.type]}]`;
      }
      const entryId = newId();
      entries.push({
        entryId,
        kind: "identifier",
        identifierType: hit.type,
        sourceProvisionId: p.provisionId,
        sourceStart: hit.start,
        sourceEnd: hit.end,
        originalValue: hit.value,
        replacement: placeholderIndex[key],
        definedTermId: null,
        detector: hit.detector,
        confidence: hit.confidence,
        userDecision: "accept",
      });
      pieces.push({
        start: hit.start,
        end: hit.end,
        replacement: placeholderIndex[key],
        entryId,
      });
    }
  }

  const byProvision = new Map<string, ProposedEntry[]>();
  for (const entry of entries) {
    const list = byProvision.get(entry.sourceProvisionId) ?? [];
    list.push(entry);
    byProvision.set(entry.sourceProvisionId, list);
  }

  const outProvisions: Provision[] = [];
  const segments: SpanSegment[] = [];
  for (const provision of provisions) {
    const projected = projectProvision(
      provision,
      provision.canonicalText,
      byProvision.get(provision.provisionId) ?? [],
    );
    outProvisions.push(projected.provision);
    segments.push(...projected.segments);
  }

  void RECOGNISER_VERSION;
  return { provisions: outProvisions, entries, segments, placeholderIndex };
}

export function applyDecisions(
  base: CanonicalResult,
  decisions: Record<string, { decision: "accept" | "correct" | "not_identifier"; replacement?: string }>,
): CanonicalResult {
  const sourceByProvision = new Map(
    base.provisions.map((provision) => [provision.provisionId, reconstructSource(base, provision)]),
  );

  const entries = base.entries.map((entry) => {
    const decision = decisions[entry.entryId];
    if (!decision) return entry;
    if (decision.decision === "not_identifier") {
      return { ...entry, userDecision: decision.decision, replacement: entry.originalValue };
    }
    if (decision.decision === "correct") {
      const replacement = decision.replacement?.trim();
      if (!replacement) {
        throw Object.assign(new Error("canonicalisation_correction_required"), {
          code: "canonicalisation_correction_required",
          entryId: entry.entryId,
        });
      }
      return { ...entry, userDecision: decision.decision, replacement };
    }
    return { ...entry, userDecision: decision.decision };
  });

  const byProvision = new Map<string, ProposedEntry[]>();
  for (const entry of entries) {
    const list = byProvision.get(entry.sourceProvisionId) ?? [];
    list.push(entry);
    byProvision.set(entry.sourceProvisionId, list);
  }

  const provisions: Provision[] = [];
  const segments: SpanSegment[] = [];
  for (const provision of base.provisions) {
    const source = sourceByProvision.get(provision.provisionId) ?? provision.canonicalText;
    const projected = projectProvision(
      provision,
      source,
      byProvision.get(provision.provisionId) ?? [],
    );
    provisions.push(projected.provision);
    segments.push(...projected.segments);
  }

  return { ...base, entries, provisions, segments };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mapSha(entries: ProposedEntry[]): string {
  const payload = entries
    .slice()
    .sort(
      (a, b) =>
        a.sourceProvisionId.localeCompare(b.sourceProvisionId) ||
        a.sourceStart - b.sourceStart ||
        a.sourceEnd - b.sourceEnd ||
        a.kind.localeCompare(b.kind),
    )
    .map((entry) => ({
      kind: entry.kind,
      identifierType: entry.identifierType,
      sourceProvisionId: entry.sourceProvisionId,
      sourceStart: entry.sourceStart,
      sourceEnd: entry.sourceEnd,
      replacement: entry.replacement,
      decision: entry.userDecision,
    }));
  return sha256Hex(JSON.stringify(payload));
}
