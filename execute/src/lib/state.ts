/**
 * Everything the screen shows, as plain data. File bytes live outside this
 * state (see App); here are only ids, names and choices, so every change is a
 * small pure function that can be tested.
 */
import type { PageText } from "./extract.ts";
import {
  executedCopyName, guessRoleByFileName, matchPartyByFileName, signaturePackName, titleFromFileName,
  type AttachmentRole, type CopyType,
} from "./names.ts";
import { planExecutedCopy, type Plan } from "./plan.ts";
import type { Rotation } from "./render.ts";

export type Party = { id: string; name: string; copy: CopyType };

export type AttachmentMeta = {
  id: string;
  fileName: string;
  pageCount: number;
  thumb: string;
  rotation: Rotation;
};

export type Placement =
  | { role: "unassigned"; suggestedRole: AttachmentRole | null; suggestedParty: string | null }
  | { role: "signed"; partyIds: string[] }
  | { role: "stamp"; partyId: string };

export type AppState = {
  title: string;
  agreement: { fileName: string; pageCount: number; pages: PageText[] } | null;
  /** Agreement page index -> party ids signing on it. */
  sigPages: Record<number, string[]>;
  parties: Record<string, Party>;
  /** Attachment ids in the order they arrived. */
  attachments: string[];
  meta: Record<string, AttachmentMeta>;
  placement: Record<string, Placement>;
  /** File names the user typed over the suggestion, by party id. */
  fileNames: Record<string, string>;
};

export const emptyState: AppState = {
  title: "",
  agreement: null,
  sigPages: {},
  parties: {},
  attachments: [],
  meta: {},
  placement: {},
  fileNames: {},
};

let counter = 0;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

const clone = (s: AppState): AppState => structuredClone(s);

function makeParty(s: AppState, name: string): string {
  const id = newId("p");
  s.parties[id] = { id, name, copy: "counterpart" };
  return id;
}

function seedPage(s: AppState, index: number) {
  const names = s.agreement?.pages[index]?.suggestedParties ?? [];
  s.sigPages[index] = (names.length ? names : [`Party on page ${index + 1}`]).map((n) => makeParty(s, n));
}

export function withAgreement(fileName: string, pages: PageText[]): AppState {
  const s = clone(emptyState);
  s.title = titleFromFileName(fileName);
  s.agreement = { fileName, pageCount: pages.length, pages };
  pages.forEach((p, i) => {
    if (p.likelySignature) seedPage(s, i);
  });
  return s;
}

export const signaturePageIndices = (s: AppState) =>
  Object.keys(s.sigPages).map(Number).sort((a, b) => a - b);

/** Parties in the order they sign in the agreement. */
export function partyOrder(s: AppState): string[] {
  const order: string[] = [];
  for (const page of signaturePageIndices(s)) for (const id of s.sigPages[page]) if (!order.includes(id)) order.push(id);
  return order;
}

export const partyPages = (s: AppState, partyId: string) =>
  signaturePageIndices(s).filter((p) => s.sigPages[p].includes(partyId));

/** Parties sharing a signature page with this one (who might sign one page together). */
export function coParties(s: AppState, partyId: string): string[] {
  const out = new Set<string>();
  for (const page of partyPages(s, partyId)) for (const id of s.sigPages[page]) if (id !== partyId) out.add(id);
  return [...out];
}

/** Drop parties that no longer sign anywhere, and anything placed with them. */
function prune(s: AppState) {
  const live = new Set(partyOrder(s));
  for (const id of Object.keys(s.parties)) {
    if (live.has(id)) continue;
    delete s.parties[id];
    delete s.fileNames[id];
  }
  for (const [attId, place] of Object.entries(s.placement)) {
    if (place.role === "signed") {
      place.partyIds = place.partyIds.filter((p) => live.has(p));
      if (place.partyIds.length === 0) s.placement[attId] = unassignedFor(s, attId);
    } else if (place.role === "stamp" && !live.has(place.partyId)) {
      s.placement[attId] = unassignedFor(s, attId);
    } else if (place.role === "unassigned" && place.suggestedParty && !live.has(place.suggestedParty)) {
      place.suggestedParty = null;
    }
  }
}

export function toggleSignaturePage(state: AppState, index: number): AppState {
  const s = clone(state);
  if (s.sigPages[index]) delete s.sigPages[index];
  else seedPage(s, index);
  prune(s);
  return s;
}

export function addParty(state: AppState, page: number, name = "New party"): AppState {
  const s = clone(state);
  s.sigPages[page] = [...(s.sigPages[page] ?? []), makeParty(s, name)];
  return s;
}

export function addExistingParty(state: AppState, page: number, partyId: string): AppState {
  const s = clone(state);
  if (!s.sigPages[page].includes(partyId)) s.sigPages[page].push(partyId);
  return s;
}

export function removePartyFromPage(state: AppState, page: number, partyId: string): AppState {
  const s = clone(state);
  s.sigPages[page] = s.sigPages[page].filter((id) => id !== partyId);
  prune(s);
  return s;
}

export function updateParty(state: AppState, partyId: string, patch: Partial<Omit<Party, "id">>): AppState {
  const s = clone(state);
  Object.assign(s.parties[partyId], patch);
  return s;
}

export function setTitle(state: AppState, title: string): AppState {
  return { ...state, title };
}

function unassignedFor(s: AppState, attId: string): Placement {
  const fileName = s.meta[attId]?.fileName ?? "";
  const parties = partyOrder(s).map((id) => s.parties[id]);
  return {
    role: "unassigned",
    suggestedRole: guessRoleByFileName(fileName),
    suggestedParty: matchPartyByFileName(fileName, parties),
  };
}

/**
 * Add a returned file. With both a role and a party (dropped on a party's
 * card) it is placed straight away; otherwise it waits in the tray with a
 * suggestion taken from its file name.
 */
export function addAttachment(
  state: AppState,
  meta: AttachmentMeta,
  target?: { role: AttachmentRole; partyId: string },
): AppState {
  const s = clone(state);
  s.attachments.push(meta.id);
  s.meta[meta.id] = meta;
  s.placement[meta.id] = target
    ? target.role === "stamp"
      ? { role: "stamp", partyId: target.partyId }
      : { role: "signed", partyIds: [target.partyId] }
    : unassignedFor(s, meta.id);
  return s;
}

export function assign(state: AppState, attId: string, role: AttachmentRole, partyId: string): AppState {
  const s = clone(state);
  s.placement[attId] = role === "stamp" ? { role: "stamp", partyId } : { role: "signed", partyIds: [partyId] };
  return s;
}

/** Place every tray file whose role and party were both guessed. */
export function assignAllSuggested(state: AppState): AppState {
  const s = clone(state);
  for (const id of s.attachments) {
    const place = s.placement[id];
    if (place.role !== "unassigned" || !place.suggestedRole || !place.suggestedParty) continue;
    s.placement[id] =
      place.suggestedRole === "stamp"
        ? { role: "stamp", partyId: place.suggestedParty }
        : { role: "signed", partyIds: [place.suggestedParty] };
  }
  return s;
}

export function unassign(state: AppState, attId: string): AppState {
  const s = clone(state);
  s.placement[attId] = unassignedFor(s, attId);
  return s;
}

export function removeAttachment(state: AppState, attId: string): AppState {
  const s = clone(state);
  s.attachments = s.attachments.filter((id) => id !== attId);
  delete s.meta[attId];
  delete s.placement[attId];
  return s;
}

/** One countersigned file may carry the signatures of several parties on a shared page. */
export function toggleSignedParty(state: AppState, attId: string, partyId: string): AppState {
  const s = clone(state);
  const place = s.placement[attId];
  if (place.role !== "signed") return state;
  place.partyIds = place.partyIds.includes(partyId)
    ? place.partyIds.filter((p) => p !== partyId)
    : [...place.partyIds, partyId];
  if (place.partyIds.length === 0) s.placement[attId] = unassignedFor(s, attId);
  return s;
}

export function rotateAttachment(state: AppState, attId: string): AppState {
  const s = clone(state);
  s.meta[attId].rotation = (((s.meta[attId].rotation + 90) % 360) as Rotation);
  return s;
}

export function moveStamp(state: AppState, attId: string, delta: -1 | 1): AppState {
  const s = clone(state);
  const place = s.placement[attId];
  if (place.role !== "stamp") return state;
  const siblings = s.attachments.filter((id) => {
    const p = s.placement[id];
    return p.role === "stamp" && p.partyId === place.partyId;
  });
  const i = siblings.indexOf(attId);
  const swapWith = siblings[i + delta];
  if (!swapWith) return state;
  const a = s.attachments.indexOf(attId);
  const b = s.attachments.indexOf(swapWith);
  [s.attachments[a], s.attachments[b]] = [s.attachments[b], s.attachments[a]];
  return s;
}

export const signedFor = (s: AppState, partyId: string) =>
  s.attachments.filter((id) => {
    const p = s.placement[id];
    return p.role === "signed" && p.partyIds.includes(partyId);
  });

export const stampsFor = (s: AppState, partyId: string) =>
  s.attachments.filter((id) => {
    const p = s.placement[id];
    return p.role === "stamp" && p.partyId === partyId;
  });

export const unassigned = (s: AppState) => s.attachments.filter((id) => s.placement[id].role === "unassigned");

export function planFor(s: AppState, partyId: string): Plan {
  const signedByParty = new Map(partyOrder(s).map((id) => [id, signedFor(s, id)]));
  return planExecutedCopy({
    pageCount: s.agreement?.pageCount ?? 0,
    signaturePages: new Map(signaturePageIndices(s).map((p) => [p, s.sigPages[p]])),
    signedByParty,
    stampIds: stampsFor(s, partyId),
  });
}

export const copyParties = (s: AppState) => partyOrder(s).filter((id) => s.parties[id].copy !== "none");

export function copyFileName(s: AppState, partyId: string): string {
  const party = s.parties[partyId];
  return s.fileNames[partyId] ?? executedCopyName(s.title || "Agreement", party.name, party.copy);
}

export function setCopyFileName(state: AppState, partyId: string, name: string): AppState {
  return { ...state, fileNames: { ...state.fileNames, [partyId]: name } };
}

export const packFileName = (s: AppState, partyId: string) =>
  signaturePackName(s.title || "Agreement", s.parties[partyId].name);
