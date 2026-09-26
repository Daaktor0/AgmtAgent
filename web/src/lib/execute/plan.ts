/**
 * The page order of one executed copy, worked out before any PDF is touched:
 *
 *   that party's stamp paper(s)
 *   -> the final agreement, page by page
 *      (each signature page replaced by the countersigned page(s) returned for it)
 *
 * Pure data in, pure data out, so the rules can be tested without PDFs.
 */

export type Segment =
  | { kind: "stamp"; attachmentId: string }
  | { kind: "agreement"; pageIndex: number; unsigned: boolean }
  | { kind: "signed"; attachmentId: string };

export type PlanInput = {
  pageCount: number;
  /** Agreement page index -> ids of the parties who sign on that page. */
  signaturePages: Map<number, string[]>;
  /** Party id -> ids of the returned, countersigned files covering that party. */
  signedByParty: Map<string, string[]>;
  /** The stamp paper files placed at the front of this copy, in order. */
  stampIds: string[];
};

export type Plan = {
  segments: Segment[];
  /** Parties whose countersigned page has not been added yet. */
  missingParties: string[];
  missingStamp: boolean;
};

export function planExecutedCopy(input: PlanInput): Plan {
  const segments: Segment[] = input.stampIds.map((attachmentId) => ({ kind: "stamp", attachmentId }));
  const placedParties = new Set<string>();
  const placedFiles = new Set<string>();
  const missing: string[] = [];

  for (let pageIndex = 0; pageIndex < input.pageCount; pageIndex += 1) {
    const parties = input.signaturePages.get(pageIndex);
    if (!parties || parties.length === 0) {
      segments.push({ kind: "agreement", pageIndex, unsigned: false });
      continue;
    }

    let pageStillUnsigned = false;
    for (const partyId of parties) {
      if (placedParties.has(partyId)) continue;
      const files = input.signedByParty.get(partyId) ?? [];
      if (files.length === 0) {
        pageStillUnsigned = true;
        if (!missing.includes(partyId)) missing.push(partyId);
        continue;
      }
      // A page signed by several parties together is one file shared by
      // them: place it once. A party whose return spans two signature pages
      // is placed at the first of them.
      for (const id of files) {
        if (placedFiles.has(id)) continue;
        placedFiles.add(id);
        segments.push({ kind: "signed", attachmentId: id });
      }
      placedParties.add(partyId);
    }
    // Keep the unsigned original page so the copy is never silently short.
    if (pageStillUnsigned) segments.push({ kind: "agreement", pageIndex, unsigned: true });
  }

  return { segments, missingParties: missing, missingStamp: input.stampIds.length === 0 };
}

/** "Final pp. 1–24" style summary for the screen. */
export function describePlan(plan: Plan, pagesOf: (attachmentId: string) => number): string[] {
  type Chunk =
    | { kind: "stamp" | "signed"; pages: number }
    | { kind: "agreement" | "unsigned"; from: number; to: number };
  const chunks: Chunk[] = [];
  for (const seg of plan.segments) {
    const last = chunks[chunks.length - 1];
    if (seg.kind === "stamp" || seg.kind === "signed") {
      const pages = pagesOf(seg.attachmentId);
      if (last && last.kind === seg.kind) last.pages += pages;
      else chunks.push({ kind: seg.kind, pages });
    } else {
      const kind = seg.unsigned ? "unsigned" : "agreement";
      if (last && last.kind === kind && last.to === seg.pageIndex - 1) last.to = seg.pageIndex;
      else chunks.push({ kind, from: seg.pageIndex, to: seg.pageIndex });
    }
  }
  const pp = (n: number) => `${n} page${n === 1 ? "" : "s"}`;
  const range = (from: number, to: number) => (from === to ? `p. ${from + 1}` : `pp. ${from + 1}–${to + 1}`);
  return chunks.map((c) => {
    if ("pages" in c) return c.kind === "stamp" ? `Stamp paper (${pp(c.pages)})` : `Signed (${pp(c.pages)})`;
    return `${c.kind === "unsigned" ? "Unsigned" : "Final"} ${range(c.from, c.to)}`;
  });
}
