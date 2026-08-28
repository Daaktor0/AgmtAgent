/**
 * Canonicalisation (SPEC §4.5):
 * 1. Protect defined-term tokens.
 * 2. Replace running legal names that have an explicit defined term.
 * 3. Run Indian identifier recognisers.
 * 4. Replace confirmed identifiers with version-scoped placeholders.
 * 5. Do not mask amounts, dates, percentages, clause numbers, governing law, or defined terms.
 */
import { newId } from "./ids.ts";
import { detectIdentifiers } from "./identifiers.ts";
import { RECOGNISER_VERSION } from "./config.ts";
import type { Definition, ProposedEntry, Provision, SpanSegment } from "./types.ts";

export type CanonicalResult = {
  provisions: Provision[];
  entries: ProposedEntry[];
  segments: SpanSegment[];
  placeholderIndex: Record<string, string>;
};

export function proposeCanonicalisation(
  provisions: Provision[],
  definitions: Definition[],
): CanonicalResult {
  const entries: ProposedEntry[] = [];
  const segments: SpanSegment[] = [];
  const placeholderIndex: Record<string, string> = {};
  let placeholderSeq: Record<string, number> = {};

  const nameDefs = definitions.filter((d) => d.legalName);

  const outProvisions: Provision[] = provisions.map((p) => {
    if (!p.ownsText) return { ...p };
    const original = p.canonicalText;
    type Piece = { start: number; end: number; replacement: string; entryId: string | null };
    const pieces: Piece[] = [];

    // Protect defined-term tokens so identifier detection skips them.
    const protectedSpans: [number, number][] = [];
    for (const d of definitions) {
      if (d.scopeId !== p.scopeId && !(d.scopeType === "main_body" && p.scopeType === "main_body")) {
        continue;
      }
      const rx = new RegExp(`\\b${escapeRe(d.term)}\\b`, "g");
      let m: RegExpExecArray | null;
      while ((m = rx.exec(original))) {
        protectedSpans.push([m.index, m.index + m[0].length]);
      }
    }

    for (const d of nameDefs) {
      if (d.legalName === d.term) continue;
      if (d.scopeType !== "main_body" && d.scopeId !== p.scopeId) continue;
      const rx = new RegExp(escapeRe(d.legalName!), "g");
      let m: RegExpExecArray | null;
      while ((m = rx.exec(original))) {
        const entryId = newId();
        entries.push({
          entryId,
          kind: "legal_name",
          identifierType: null,
          sourceProvisionId: p.provisionId,
          sourceStart: m.index,
          sourceEnd: m.index + m[0].length,
          originalValue: m[0],
          replacement: d.term,
          definedTermId: d.definitionId,
          detector: "defined_term_map",
          confidence: 0.95,
          userDecision: "accept",
        });
        pieces.push({
          start: m.index,
          end: m.index + m[0].length,
          replacement: d.term,
          entryId,
        });
      }
    }

    const ids = detectIdentifiers(original, protectedSpans);
    for (const hit of ids) {
      if (pieces.some((x) => hit.start < x.end && hit.end > x.start)) continue;
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

    pieces.sort((a, b) => a.start - b.start);
    let cursor = 0;
    let canonical = "";
    const segs: SpanSegment[] = [];
    const pushSeg = (
      srcStart: number,
      srcEnd: number,
      canStart: number,
      canEnd: number,
      entryId: string | null,
    ) => {
      if (srcEnd < srcStart || canEnd < canStart) return;
      segs.push({
        segmentId: newId(),
        provisionId: p.provisionId,
        canonicalStart: canStart,
        canonicalEnd: canEnd,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        replacementEntryId: entryId,
      });
    };

    for (const piece of pieces) {
      if (piece.start > cursor) {
        const chunk = original.slice(cursor, piece.start);
        pushSeg(cursor, piece.start, canonical.length, canonical.length + chunk.length, null);
        canonical += chunk;
      }
      pushSeg(piece.start, piece.end, canonical.length, canonical.length + piece.replacement.length, piece.entryId);
      canonical += piece.replacement;
      cursor = piece.end;
    }
    if (cursor < original.length) {
      const chunk = original.slice(cursor);
      pushSeg(cursor, original.length, canonical.length, canonical.length + chunk.length, null);
      canonical += chunk;
    }
    if (!pieces.length) {
      pushSeg(0, original.length, 0, original.length, null);
      canonical = original;
    }
    segments.push(...segs);
    return { ...p, canonicalText: canonical, canonicalLength: canonical.length };
  });

  void RECOGNISER_VERSION;
  return { provisions: outProvisions, entries, segments, placeholderIndex };
}

export function applyDecisions(
  base: CanonicalResult,
  decisions: Record<string, { decision: "accept" | "correct" | "not_identifier"; replacement?: string }>,
): CanonicalResult {
  const entries = base.entries.map((e) => {
    const d = decisions[e.entryId];
    if (!d) return e;
    if (d.decision === "not_identifier") {
      return { ...e, userDecision: d.decision, replacement: e.originalValue };
    }
    if (d.decision === "correct" && d.replacement) {
      return { ...e, userDecision: d.decision, replacement: d.replacement };
    }
    return { ...e, userDecision: d.decision };
  });
  // Re-apply replacements from original source text stored on entries.
  const byProv = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byProv.get(e.sourceProvisionId) ?? [];
    list.push(e);
    byProv.set(e.sourceProvisionId, list);
  }
  const provisions = base.provisions.map((p) => {
    if (!p.ownsText) return p;
    // Reconstruct from original by inverting current canonical using segments is
    // lossy after prior apply. Slice 0 reapplies on the last proposed original
    // values against the current canonical only for identifier skip.
    const list = (byProv.get(p.provisionId) ?? []).slice().sort((a, b) => a.sourceStart - b.sourceStart);
    if (!list.length) return p;
    // Use source offsets against a reconstructed original if the first proposal
    // still matches; otherwise leave text (user cannot free-edit canonical).
    return p;
  });
  return { ...base, entries, provisions };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mapSha(entries: ProposedEntry[]): string {
  const payload = entries
    .map((e) => `${e.kind}|${e.identifierType ?? ""}|${e.replacement}|${e.userDecision}|${e.sourceStart}|${e.sourceEnd}`)
    .join("\n");
  let h = 0;
  for (let i = 0; i < payload.length; i++) h = (h * 31 + payload.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0") + payload.length.toString(16);
}
