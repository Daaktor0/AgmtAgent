/**
 * Sorting a returned file: is it a countersigned page or a stamp paper, for
 * which document, from which party? Deterministic and explainable: it reads
 * the file's text (PDF text layer or OCR) against the signature pages of the
 * final documents and the e-stamp fields, then falls back to the file name.
 * Every answer carries a confidence and a one-line reason for the screen.
 */
import { looksLikeStampPaper, stampNames, type EStamp } from "./estamp.ts";
import type { Confidence, Party, ReturnRole, Signing, SigningDocument, Suggestion } from "./model.ts";
import { guessRoleByFileName } from "./names.ts";
import { nameMatch, nameTokens, recall, tokenSet } from "./text.ts";

type Candidate = { doc: SigningDocument; pageIndex: number; score: number };

const ABBREVIATIONS: Record<string, string> = {
  sha: "shareholders agreement",
  ssa: "share subscription agreement",
  spa: "share purchase agreement",
  bta: "business transfer agreement",
  apa: "asset purchase agreement",
  nda: "non disclosure agreement",
  jva: "joint venture agreement",
  doa: "deed of adherence",
  msa: "master services agreement",
  ccps: "compulsorily convertible preference shares",
  ccd: "compulsorily convertible debentures",
};

/**
 * The words that name a document: its title, the name it gives itself on
 * its signature pages ("[Signature page to the Shareholders' Agreement]")
 * and the long form of a title abbreviation (SHA, SSA, SPA, ...).
 */
export function documentWords(doc: SigningDocument): Set<string> {
  const parts = [doc.title];
  for (const t of tokenSet(doc.title)) if (ABBREVIATIONS[t]) parts.push(ABBREVIATIONS[t]);
  for (const page of Object.keys(doc.sigPages).map(Number)) {
    const m = (doc.pages[page]?.text ?? "").match(/signature\s+page\s+to\s+(?:the\s+)?([^\]\n]{3,120})/i);
    if (m) parts.push(m[1]);
  }
  return tokenSet(parts.join(" "));
}

/** Per document, the naming words no other document in the signing shares. */
function distinctiveDocumentWords(signing: Signing): Map<string, Set<string>> {
  const all = signing.documents.map((d) => ({ id: d.id, words: documentWords(d) }));
  const out = new Map<string, Set<string>>();
  for (const { id, words } of all) {
    const others = all.filter((o) => o.id !== id);
    const own = new Set([...words].filter((w) => !others.some((o) => o.words.has(w))));
    out.set(id, own.size ? own : words);
  }
  return out;
}

export function partiesOnPage(doc: SigningDocument, pageIndex: number): string[] {
  return doc.sigPages[pageIndex] ?? [];
}

export function signingPartiesOf(doc: SigningDocument): string[] {
  const out: string[] = [];
  for (const page of Object.keys(doc.sigPages).map(Number).sort((a, b) => a - b)) {
    for (const id of doc.sigPages[page]) if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Score every signature page by the share of its distinctive words found in
 * the file. Words printed on every signature page of a document (the
 * "Signature page to the Agreement" footer, "Name:", "Designation:") say
 * nothing about which page this is, so they only count when a document has
 * a single signature page.
 */
export function rankSignaturePages(signing: Signing, text: string, fileName = ""): Candidate[] {
  const found = tokenSet(text);
  const named = tokenSet(`${text} ${fileName}`);
  const docWords = distinctiveDocumentWords(signing);
  const out: Candidate[] = [];
  for (const doc of signing.documents) {
    const pages = Object.keys(doc.sigPages).map(Number);
    const sets = pages.map((p) => tokenSet(doc.pages[p]?.text ?? ""));
    const common = sets.length > 1 ? new Set([...sets[0]].filter((t) => sets.every((s) => s.has(t)))) : new Set<string>();
    pages.forEach((pageIndex, i) => {
      const distinctive = new Set([...sets[i]].filter((t) => !common.has(t)));
      const own = recall(distinctive.size >= 2 ? distinctive : sets[i], found);
      // A party that signs two documents often has the same block on both,
      // so the document's own name ("Signature page to the Shareholders'
      // Agreement", or "SHA" in the file name) decides between them.
      const title = recall(docWords.get(doc.id) ?? tokenSet(doc.title), named);
      out.push({ doc, pageIndex, score: own * 0.6 + title * 0.4 });
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Parties named in `text`: every word of the name is there, or a word of
 * four letters or more that no other candidate's name has ("Acme signed.pdf"
 * for Acme Industries Limited, but not "Banyan.pdf" when two Banyans sign).
 */
function partyByName(parties: Party[], candidates: string[], text: string): Party[] {
  const pool = parties.filter((p) => candidates.includes(p.id));
  const found = tokenSet(text);
  const words = new Map(pool.map((p) => [p.id, nameTokens(p.name)]));
  return pool.filter((p) => {
    const own = words.get(p.id)!;
    if (own.size === 0) return false;
    if (nameMatch(p.name, text) >= 0.99) return true;
    return [...own].some(
      (w) => w.length >= 4 && found.has(w) && !pool.some((o) => o.id !== p.id && words.get(o.id)!.has(w)),
    );
  });
}

function docByWords(signing: Signing, text: string): SigningDocument | null {
  if (signing.documents.length === 1) return signing.documents[0];
  const found = tokenSet(text);
  const words = distinctiveDocumentWords(signing);
  const ranked = signing.documents
    .map((doc) => ({ doc, s: recall(words.get(doc.id) ?? tokenSet(doc.title), found) }))
    .sort((a, b) => b.s - a.s);
  if (ranked[0] && ranked[0].s >= 0.5 && (ranked.length === 1 || ranked[0].s - ranked[1].s >= 0.25)) return ranked[0].doc;
  return null;
}

function stampSuggestion(signing: Signing, text: string, fileName: string, estamp: EStamp | null): Suggestion {
  const printed = estamp ? stampNames(estamp).join(" \n ") : "";
  const docFromText = docByWords(signing, `${estamp?.description ?? ""} ${fileName}`) ?? docByWords(signing, text);
  const allParties = signing.parties.map((p) => p.id);
  const eligible = docFromText
    ? signingPartiesOf(docFromText).filter((id) => docFromText.copies[id] !== "none")
    : allParties;

  // Who is this stamp paper for? Prefer the name in the file name (the
  // sender usually names it), then whoever bought it or paid the duty, then
  // any name printed on the certificate.
  const byFile = partyByName(signing.parties, eligible, fileName);
  const buyer = estamp ? [estamp.purchasedBy, estamp.paidBy].filter(Boolean).join(" \n ") : "";
  const byBuyer = buyer ? partyByName(signing.parties, eligible, buyer) : [];
  const byPrint = byBuyer.length === 1 ? byBuyer : printed ? partyByName(signing.parties, eligible, printed) : [];
  let party: Party | null = null;
  let reason = "";
  if (byFile.length === 1) {
    party = byFile[0];
    reason = `File name mentions ${party.name}.`;
  } else if (byPrint.length === 1) {
    party = byPrint[0];
    reason = `Certificate names ${party.name}.`;
  }
  const certificate = estamp?.certificateNo ? ` Certificate ${estamp.certificateNo}.` : "";
  if (party && docFromText) {
    return { role: "stamp", docId: docFromText.id, partyIds: [party.id], pageIndex: null, confidence: "high", reason: reason + certificate };
  }
  return {
    role: "stamp",
    docId: docFromText?.id ?? null,
    partyIds: party ? [party.id] : [],
    pageIndex: null,
    confidence: party || docFromText ? "medium" : "low",
    reason: party
      ? `${reason} Which document is it for?`
      : byPrint.length > 1
        ? `Certificate names several parties.${certificate} Choose whose copy it goes in.`
        : `Stamp paper.${certificate} Choose whose copy it goes in.`,
  };
}

function signedFromText(signing: Signing, text: string, fileName: string): Suggestion | null {
  const ranked = rankSignaturePages(signing, text, fileName);
  const best = ranked[0];
  if (!best || best.score < 0.45) return null;
  const second = ranked[1];
  const margin = second ? best.score - second.score : best.score;
  const onPage = partiesOnPage(best.doc, best.pageIndex);
  const byFile = partyByName(signing.parties, onPage, fileName);
  let partyIds: string[] = onPage;
  let who = "";
  if (onPage.length > 1 && byFile.length >= 1) {
    partyIds = byFile.map((p) => p.id);
    who = ` File name points to ${byFile.map((p) => p.name).join(", ")}.`;
  }
  const clear = margin >= 0.15;
  const single = onPage.length === 1 || byFile.length >= 1;
  const confidence: Confidence = clear && single ? "high" : clear ? "medium" : "low";
  const pageNo = best.pageIndex + 1;
  return {
    role: "signed",
    docId: best.doc.id,
    partyIds,
    pageIndex: best.pageIndex,
    confidence,
    reason:
      onPage.length > 1 && byFile.length === 0
        ? `Reads like ${best.doc.title} p. ${pageNo}, which several parties sign. Tick who signed this copy.`
        : clear
          ? `Reads like ${best.doc.title} p. ${pageNo}.${who}`
          : `Closest match is ${best.doc.title} p. ${pageNo}, but another page is similar.`,
  };
}

function signedFromFileName(signing: Signing, fileName: string): Suggestion {
  const everyone = signing.parties.map((p) => p.id);
  const parties = partyByName(signing.parties, everyone, fileName);
  if (parties.length !== 1) {
    return { role: "signed", docId: null, partyIds: [], pageIndex: null, confidence: "low", reason: "Could not tell whose page this is." };
  }
  const party = parties[0];
  const docs = signing.documents.filter((d) => signingPartiesOf(d).includes(party.id));
  const named = docs.length > 1 ? docByWords({ ...signing, documents: docs }, fileName) : docs[0] ?? null;
  return {
    role: "signed",
    docId: named?.id ?? null,
    partyIds: [party.id],
    pageIndex: null,
    confidence: named ? "medium" : "low",
    reason: named ? `File name mentions ${party.name}.` : `File name mentions ${party.name}. Which document?`,
  };
}

/**
 * The best guess for one returned file. `text` is null while OCR is still
 * running; the guess is then from the file name alone and is refined later.
 */
export function suggestFor(
  signing: Signing,
  file: { fileName: string; text: string | null; estamp: EStamp | null },
): Suggestion {
  const text = file.text ?? "";
  const nameRole: ReturnRole | null = guessRoleByFileName(file.fileName);
  const stampByText = text ? looksLikeStampPaper(text) : false;

  if (stampByText || (!text && nameRole === "stamp")) {
    return stampSuggestion(signing, text, file.fileName, file.estamp);
  }
  if (text) {
    const fromText = signedFromText(signing, text, file.fileName);
    if (fromText) return fromText;
    if (nameRole === "stamp") return stampSuggestion(signing, text, file.fileName, file.estamp);
    const fallback = signedFromFileName(signing, file.fileName);
    return {
      ...fallback,
      confidence: "low",
      reason: `Doesn't read like any signature page in this signing. ${fallback.partyIds.length ? fallback.reason : ""}`.trim(),
    };
  }
  return signedFromFileName(signing, file.fileName);
}

/** Auto-place only guesses that are complete and not ambiguous. */
export function isPlaceable(s: Suggestion): boolean {
  return s.confidence !== "low" && s.role !== null && s.docId !== null && s.partyIds.length > 0;
}
