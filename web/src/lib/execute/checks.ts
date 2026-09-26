/**
 * What is done, what is awaited and what needs a second look, for the grid,
 * the copies list and the chase list. Deterministic: every flag names the
 * file, the page or the certificate it is about.
 */
import { signingPartiesOf } from "./classify.ts";
import { stampNames } from "./estamp.ts";
import type { ReturnFile, Signing, SigningDocument } from "./model.ts";
import { copyParties, pagesOf, partyName, planFor, signedFor, stampsFor } from "./signing.ts";
import { nameMatch, recall, tokenSet } from "./text.ts";

export type Severity = "problem" | "check";

export type Flag = {
  severity: Severity;
  docId: string;
  partyId: string | null;
  fileId: string | null;
  message: string;
};

export type CellState = "done" | "check" | "problem" | "awaited" | "not-needed";

export type Cell = {
  signed: CellState;
  stamp: CellState;
  signedFiles: ReturnFile[];
  stampFiles: ReturnFile[];
  flags: Flag[];
};

/** How much of the final page's wording the returned page carries (0..1), or null without text. */
export function pageAgreement(doc: SigningDocument, pageIndices: number[], file: ReturnFile): number | null {
  if (!file.text || file.textSource === "none" || file.textSource === "pending") return null;
  const original = tokenSet(pageIndices.map((p) => doc.pages[p]?.text ?? "").join("\n"));
  if (original.size < 4) return null;
  return recall(original, tokenSet(file.text));
}

export function signingFlags(s: Signing): Flag[] {
  const flags: Flag[] = [];
  const certificates = new Map<string, ReturnFile[]>();

  for (const doc of s.documents) {
    for (const partyId of signingPartiesOf(doc)) {
      const pages = pagesOf(doc, partyId);
      for (const file of signedFor(s, doc.id, partyId)) {
        const agreement = pageAgreement(doc, pages, file);
        // OCR of a phone photo loses words, so the bar is low: this catches
        // the wrong page or a different document, not a changed word.
        if (agreement !== null && agreement < (file.textSource === "ocr" ? 0.35 : 0.6)) {
          flags.push({
            severity: "check",
            docId: doc.id,
            partyId,
            fileId: file.id,
            message: `“${file.fileName}” doesn't read like ${doc.title} p. ${pages.map((p) => p + 1).join(", ")}. Check it is the right page and version.`,
          });
        }
        if (file.pageCount > Math.max(1, pages.length) + 1) {
          flags.push({
            severity: "check",
            docId: doc.id,
            partyId,
            fileId: file.id,
            message: `“${file.fileName}” has ${file.pageCount} pages; ${partyName(s, partyId)} signs ${pages.length}. All of them will go into the copies.`,
          });
        }
      }
      for (const file of stampsFor(s, doc.id, partyId)) {
        const stamp = file.estamp;
        if (stamp?.certificateNo) {
          const key = stamp.certificateNo.toUpperCase();
          certificates.set(key, [...(certificates.get(key) ?? []), file]);
        }
        const names = stamp ? stampNames(stamp) : [];
        if (names.length && !names.some((n) => nameMatch(partyName(s, partyId), n) >= 0.99)) {
          flags.push({
            severity: "check",
            docId: doc.id,
            partyId,
            fileId: file.id,
            message: `Stamp paper ${stamp?.certificateNo ?? `“${file.fileName}”`} names ${names.join(" / ")}, not ${partyName(s, partyId)}.`,
          });
        }
      }
    }
  }

  for (const [cert, files] of certificates) {
    const distinct = new Set(files.map((f) => f.id));
    if (distinct.size < 2) continue;
    for (const file of files) {
      const p = file.placement;
      if (p.status !== "placed" || p.role !== "stamp") continue;
      flags.push({
        severity: "problem",
        docId: p.docId,
        partyId: p.partyId,
        fileId: file.id,
        message: `Certificate ${cert} is used in more than one copy. Each copy needs its own stamp paper.`,
      });
    }
  }
  return flags;
}

export function cellFor(s: Signing, doc: SigningDocument, partyId: string, flags: Flag[]): Cell {
  const signs = signingPartiesOf(doc).includes(partyId);
  const signedFiles = signs ? signedFor(s, doc.id, partyId) : [];
  const stampFiles = stampsFor(s, doc.id, partyId);
  const mine = flags.filter((f) => f.docId === doc.id && f.partyId === partyId);
  const stateOf = (files: ReturnFile[], needed: boolean): CellState => {
    if (!needed) return "not-needed";
    if (files.length === 0) return "awaited";
    const own = mine.filter((f) => files.some((x) => x.id === f.fileId));
    if (own.some((f) => f.severity === "problem")) return "problem";
    if (own.length || files.some((f) => f.autoPlaced)) return "check";
    return "done";
  };
  const needsStamp = signs && (doc.copies[partyId] ?? "counterpart") !== "none";
  return {
    signed: stateOf(signedFiles, signs),
    stamp: stateOf(stampFiles, needsStamp),
    signedFiles,
    stampFiles,
    flags: mine,
  };
}

export type CopyStatus = {
  docId: string;
  partyId: string;
  ready: boolean;
  awaitingSigned: string[];
  awaitingStamp: boolean;
  problems: Flag[];
  checks: Flag[];
};

export function copyStatus(s: Signing, doc: SigningDocument, partyId: string, flags: Flag[]): CopyStatus {
  const plan = planFor(s, doc, partyId);
  const docFlags = flags.filter((f) => f.docId === doc.id);
  const inCopy = new Set(plan.segments.flatMap((seg) => ("attachmentId" in seg ? [seg.attachmentId] : [])));
  const relevant = docFlags.filter((f) => f.fileId && inCopy.has(f.fileId));
  const problems = relevant.filter((f) => f.severity === "problem");
  return {
    docId: doc.id,
    partyId,
    ready: plan.missingParties.length === 0 && !plan.missingStamp && problems.length === 0,
    awaitingSigned: plan.missingParties,
    awaitingStamp: plan.missingStamp,
    problems,
    checks: relevant.filter((f) => f.severity === "check"),
  };
}

export type Progress = { signedDone: number; signedTotal: number; stampDone: number; stampTotal: number; copiesReady: number; copiesTotal: number };

export function progress(s: Signing, flags: Flag[]): Progress {
  const out: Progress = { signedDone: 0, signedTotal: 0, stampDone: 0, stampTotal: 0, copiesReady: 0, copiesTotal: 0 };
  for (const doc of s.documents) {
    for (const partyId of signingPartiesOf(doc)) {
      out.signedTotal += 1;
      if (signedFor(s, doc.id, partyId).length) out.signedDone += 1;
    }
    for (const partyId of copyParties(doc)) {
      out.stampTotal += 1;
      if (stampsFor(s, doc.id, partyId).length) out.stampDone += 1;
      out.copiesTotal += 1;
      if (copyStatus(s, doc, partyId, flags).ready) out.copiesReady += 1;
    }
  }
  return out;
}

/** Plain text for an email: what each party still owes. */
export function chaseList(s: Signing): string {
  const lines: string[] = [];
  for (const party of s.parties) {
    const owed: string[] = [];
    for (const doc of s.documents) {
      if (signingPartiesOf(doc).includes(party.id) && signedFor(s, doc.id, party.id).length === 0) {
        const pages = pagesOf(doc, party.id).map((p) => p + 1).join(", ");
        owed.push(`signed signature page for the ${doc.title} (p. ${pages})`);
      }
      if (copyParties(doc).includes(party.id) && stampsFor(s, doc.id, party.id).length === 0) {
        owed.push(`stamp paper for the ${doc.title}`);
      }
    }
    if (owed.length) lines.push(`${party.name}: ${owed.join("; ")}`);
  }
  return lines.length ? `Still awaited for ${s.name}:\n\n${lines.map((l) => `• ${l}`).join("\n")}` : `Everything for ${s.name} has been received.`;
}
