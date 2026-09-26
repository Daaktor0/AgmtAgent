/**
 * Every change to a signing, as a pure function: old signing in, new signing
 * out. The screen calls these; storage saves the result.
 */
import { isPlaceable, signingPartiesOf, suggestFor } from "./classify.ts";
import { displayName } from "./detect.ts";
import type { EStamp } from "./estamp.ts";
import {
  newId,
  type CopyType,
  type PageInfo,
  type Party,
  type Placement,
  type ReturnFile,
  type Rotation,
  type Signing,
  type SigningDocument,
} from "./model.ts";
import { executedCopyName, signaturePackName, titleFromFileName } from "./names.ts";
import { planExecutedCopy, type Plan } from "./plan.ts";
import { nameTokens } from "./text.ts";

const clone = <T>(v: T): T => structuredClone(v);
const touch = (s: Signing): Signing => ({ ...s, updatedAt: Date.now() });

export function createSigning(name: string, now = Date.now()): Signing {
  return { version: 1, id: newId("sgn"), name, createdAt: now, updatedAt: now, parties: [], documents: [], returns: [] };
}

export const sigPageIndices = (doc: SigningDocument): number[] =>
  Object.keys(doc.sigPages).map(Number).sort((a, b) => a - b);

export const partyName = (s: Signing, id: string): string => s.parties.find((p) => p.id === id)?.name ?? "Unknown party";

/** The same party across documents: "BANYAN CAPITAL FUND I" and "Banyan Capital Fund I". */
function findParty(s: Signing, name: string): Party | undefined {
  const want = [...nameTokens(name)].sort().join(" ");
  if (!want) return undefined;
  return s.parties.find((p) => [...nameTokens(p.name)].sort().join(" ") === want);
}

function ensureParty(s: Signing, rawName: string): string {
  const name = displayName(rawName.trim()) || "Unnamed party";
  const existing = findParty(s, name);
  if (existing) return existing.id;
  const id = newId("pty");
  s.parties.push({ id, name });
  return id;
}

function seedPage(s: Signing, doc: SigningDocument, index: number) {
  const names = doc.pages[index]?.suggestedParties ?? [];
  const ids = (names.length ? names : [`Party on p. ${index + 1}`]).map((n) => ensureParty(s, n));
  doc.sigPages[index] = [...new Set(ids)];
  for (const id of doc.sigPages[index]) doc.copies[id] ??= "counterpart";
}

/** Parties that no longer sign anything are removed, with anything placed for them. */
function prune(s: Signing) {
  const live = new Set(s.documents.flatMap((d) => signingPartiesOf(d)));
  s.parties = s.parties.filter((p) => live.has(p.id));
  for (const doc of s.documents) {
    const signers = new Set(signingPartiesOf(doc));
    for (const id of Object.keys(doc.copies)) if (!signers.has(id)) delete doc.copies[id];
    for (const id of Object.keys(doc.copyNames)) if (!signers.has(id)) delete doc.copyNames[id];
  }
  const docIds = new Set(s.documents.map((d) => d.id));
  for (const r of s.returns) {
    const p = r.placement;
    if (p.status !== "placed") continue;
    const doc = s.documents.find((d) => d.id === p.docId);
    if (!docIds.has(p.docId) || !doc) {
      r.placement = { status: "unplaced" };
      continue;
    }
    const signers = new Set(signingPartiesOf(doc));
    if (p.role === "signed") {
      p.partyIds = p.partyIds.filter((id) => signers.has(id));
      if (p.partyIds.length === 0) r.placement = { status: "unplaced" };
    } else if (!signers.has(p.partyId)) {
      r.placement = { status: "unplaced" };
    }
  }
}

export function renameSigning(signing: Signing, name: string): Signing {
  return touch({ ...signing, name });
}

export function addDocument(
  signing: Signing,
  input: { fileId: string; fileName: string; pages: PageInfo[] },
): { signing: Signing; docId: string } {
  const s = clone(signing);
  const doc: SigningDocument = {
    id: newId("doc"),
    fileId: input.fileId,
    fileName: input.fileName,
    title: titleFromFileName(input.fileName),
    pageCount: input.pages.length,
    pages: input.pages,
    sigPages: {},
    copies: {},
    copyNames: {},
  };
  s.documents.push(doc);
  input.pages.forEach((p, i) => {
    if (p.likelySignature) seedPage(s, doc, i);
  });
  if (!s.name || s.name === "Untitled signing") s.name = doc.title;
  return { signing: touch(resort(s)), docId: doc.id };
}

export function removeDocument(signing: Signing, docId: string): Signing {
  const s = clone(signing);
  s.documents = s.documents.filter((d) => d.id !== docId);
  prune(s);
  return touch(s);
}

function withDoc(signing: Signing, docId: string, fn: (s: Signing, doc: SigningDocument) => void): Signing {
  const s = clone(signing);
  const doc = s.documents.find((d) => d.id === docId);
  if (!doc) return signing;
  fn(s, doc);
  prune(s);
  return touch(s);
}

export const setDocumentTitle = (s: Signing, docId: string, title: string) =>
  withDoc(s, docId, (_s, doc) => {
    doc.title = title;
  });

export const toggleSignaturePage = (s: Signing, docId: string, pageIndex: number) =>
  withDoc(s, docId, (next, doc) => {
    if (doc.sigPages[pageIndex]) delete doc.sigPages[pageIndex];
    else seedPage(next, doc, pageIndex);
  });

export const addPartyToPage = (s: Signing, docId: string, pageIndex: number, name: string) =>
  withDoc(s, docId, (next, doc) => {
    const id = ensureParty(next, name);
    const list = doc.sigPages[pageIndex] ?? [];
    if (!list.includes(id)) doc.sigPages[pageIndex] = [...list, id];
    doc.copies[id] ??= "counterpart";
  });

export const removePartyFromPage = (s: Signing, docId: string, pageIndex: number, partyId: string) =>
  withDoc(s, docId, (_next, doc) => {
    doc.sigPages[pageIndex] = (doc.sigPages[pageIndex] ?? []).filter((id) => id !== partyId);
    if (doc.sigPages[pageIndex].length === 0) delete doc.sigPages[pageIndex];
  });

export function renameParty(signing: Signing, partyId: string, name: string): Signing {
  const s = clone(signing);
  const party = s.parties.find((p) => p.id === partyId);
  if (party) party.name = name;
  return touch(s);
}

export const setCopyType = (s: Signing, docId: string, partyId: string, copy: CopyType) =>
  withDoc(s, docId, (_next, doc) => {
    doc.copies[partyId] = copy;
  });

export const setCopyName = (s: Signing, docId: string, partyId: string, name: string) =>
  withDoc(s, docId, (_next, doc) => {
    doc.copyNames[partyId] = name;
  });

/* -------------------------------------------------------------- returns */

export type NewReturn = {
  id: string;
  fileName: string;
  hash: string;
  kind: "pdf" | "image";
  image?: { width: number; height: number };
  pageCount: number;
  text: string | null;
  textSource: ReturnFile["textSource"];
  estamp: EStamp | null;
};

function placementFrom(suggestion: ReturnFile["suggestion"]): Placement {
  if (!suggestion || !isPlaceable(suggestion) || !suggestion.docId || !suggestion.role) return { status: "unplaced" };
  return suggestion.role === "stamp"
    ? { status: "placed", role: "stamp", docId: suggestion.docId, partyId: suggestion.partyIds[0] }
    : { status: "placed", role: "signed", docId: suggestion.docId, partyIds: suggestion.partyIds };
}

/**
 * A file placed on a clear reading of its content needs nothing more. One
 * placed on a weaker signal (its file name alone) is shown for a glance.
 */
function needsGlance(placement: Placement, suggestion: ReturnFile["suggestion"]): boolean {
  return placement.status === "placed" && suggestion?.confidence !== "high";
}

/** Add a returned file and, when the guess is clear, place it. */
export function addReturn(signing: Signing, input: NewReturn, now = Date.now()): Signing {
  const s = clone(signing);
  const suggestion = suggestFor(s, input);
  const placement = placementFrom(suggestion);
  s.returns.push({
    ...input,
    rotation: 0,
    addedAt: now,
    suggestion,
    placement,
    autoPlaced: needsGlance(placement, suggestion),
  });
  return touch(s);
}

/**
 * New text for a file (OCR finished). The guess is refreshed; a file the
 * user already placed or reviewed stays where it is.
 */
export function updateReturnText(
  signing: Signing,
  id: string,
  text: string | null,
  textSource: ReturnFile["textSource"],
  estamp: EStamp | null,
): Signing {
  const s = clone(signing);
  const r = s.returns.find((x) => x.id === id);
  if (!r) return signing;
  r.text = text;
  r.textSource = textSource;
  r.estamp = estamp;
  r.suggestion = suggestFor(s, r);
  if (r.placement.status === "unplaced" || r.autoPlaced) {
    r.placement = placementFrom(r.suggestion);
    r.autoPlaced = needsGlance(r.placement, r.suggestion);
  }
  return touch(s);
}

export function placeReturn(signing: Signing, id: string, placement: Placement): Signing {
  const s = clone(signing);
  const r = s.returns.find((x) => x.id === id);
  if (!r) return signing;
  r.placement = placement;
  r.autoPlaced = false;
  prune(s);
  return touch(s);
}

export function confirmReturn(signing: Signing, id: string): Signing {
  const s = clone(signing);
  const r = s.returns.find((x) => x.id === id);
  if (r) r.autoPlaced = false;
  return touch(s);
}

export function confirmAllAutoPlaced(signing: Signing): Signing {
  const s = clone(signing);
  for (const r of s.returns) r.autoPlaced = false;
  return touch(s);
}

export function removeReturn(signing: Signing, id: string): Signing {
  return touch({ ...signing, returns: signing.returns.filter((r) => r.id !== id) });
}

export function rotateReturn(signing: Signing, id: string): Signing {
  const s = clone(signing);
  const r = s.returns.find((x) => x.id === id);
  if (r) r.rotation = ((r.rotation + 90) % 360) as Rotation;
  return touch(s);
}

/** Tick or untick a party on a countersigned page shared by several parties. */
export function toggleSignedBy(signing: Signing, id: string, partyId: string): Signing {
  const s = clone(signing);
  const r = s.returns.find((x) => x.id === id);
  if (!r || r.placement.status !== "placed" || r.placement.role !== "signed") return signing;
  const ids = r.placement.partyIds;
  r.placement.partyIds = ids.includes(partyId) ? ids.filter((x) => x !== partyId) : [...ids, partyId];
  if (r.placement.partyIds.length === 0) r.placement = { status: "unplaced" };
  r.autoPlaced = false;
  return touch(s);
}

/** Re-run the guesses for unplaced files, e.g. after parties were renamed. */
export function resort(signing: Signing): Signing {
  const s = clone(signing);
  for (const r of s.returns) {
    r.suggestion = suggestFor(s, r);
    if (r.placement.status === "unplaced") {
      r.placement = placementFrom(r.suggestion);
      r.autoPlaced = needsGlance(r.placement, r.suggestion);
    }
  }
  return s;
}

/* -------------------------------------------------------------- derived */

export function signedFor(s: Signing, docId: string, partyId: string): ReturnFile[] {
  return s.returns.filter(
    (r) => r.placement.status === "placed" && r.placement.role === "signed" && r.placement.docId === docId && r.placement.partyIds.includes(partyId),
  );
}

export function stampsFor(s: Signing, docId: string, partyId: string): ReturnFile[] {
  return s.returns.filter(
    (r) => r.placement.status === "placed" && r.placement.role === "stamp" && r.placement.docId === docId && r.placement.partyId === partyId,
  );
}

export const unplaced = (s: Signing): ReturnFile[] => s.returns.filter((r) => r.placement.status === "unplaced");

export function planFor(s: Signing, doc: SigningDocument, partyId: string): Plan {
  return planExecutedCopy({
    pageCount: doc.pageCount,
    signaturePages: new Map(sigPageIndices(doc).map((p) => [p, doc.sigPages[p]])),
    signedByParty: new Map(signingPartiesOf(doc).map((id) => [id, signedFor(s, doc.id, id).map((r) => r.id)])),
    stampIds: stampsFor(s, doc.id, partyId).map((r) => r.id),
  });
}

export function copyParties(doc: SigningDocument): string[] {
  return signingPartiesOf(doc).filter((id) => (doc.copies[id] ?? "counterpart") !== "none");
}

export function copyFileName(s: Signing, doc: SigningDocument, partyId: string): string {
  return doc.copyNames[partyId] ?? executedCopyName(doc.title || "Agreement", partyName(s, partyId), doc.copies[partyId] ?? "counterpart");
}

export function packFileName(s: Signing, doc: SigningDocument, partyId: string): string {
  return signaturePackName(doc.title || "Agreement", partyName(s, partyId));
}

export function pagesOf(doc: SigningDocument, partyId: string): number[] {
  return sigPageIndices(doc).filter((p) => doc.sigPages[p].includes(partyId));
}
