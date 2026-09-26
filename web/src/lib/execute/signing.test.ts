import { test } from "node:test";
import assert from "node:assert/strict";
import { chaseList, copyStatus, progress, signingFlags } from "./checks.ts";
import type { PageInfo } from "./model.ts";
import {
  addDocument, addPartyToPage, addReturn, copyFileName, createSigning, placeReturn, removePartyFromPage,
  setCopyType, signedFor, stampsFor, toggleSignaturePage, unplaced, type NewReturn,
} from "./signing.ts";

const body: PageInfo = { text: "1. DEFINITIONS\nThe Company shall procure that each Shareholder complies with this Agreement.", likelySignature: false, suggestedParties: [] };
const sig = (lines: string[], parties: string[]): PageInfo => ({
  text: [...lines, "Name:", "Designation:", "[Signature page to the Share Purchase Agreement]"].join("\n"),
  likelySignature: true,
  suggestedParties: parties,
});

function spa() {
  return addDocument(createSigning("Untitled signing"), {
    fileId: "f-spa",
    fileName: "SPA_Final_v3.pdf",
    pages: [
      body,
      body,
      sig(["For and on behalf of ACME INDUSTRIES LIMITED", "through its director"], ["ACME INDUSTRIES LIMITED"]),
      sig(["SIGNED AND DELIVERED by the within named Seller,", "RAHUL MEHTA"], ["RAHUL MEHTA"]),
      body,
    ],
  });
}

const ret = (id: string, fileName: string, text: string | null): NewReturn => ({
  id, fileName, hash: id, kind: "pdf", pageCount: 1, text, textSource: text ? "pdf" : "pending", estamp: null,
});

test("a document seeds the signing, its parties and its copies", () => {
  const { signing: s } = spa();
  assert.equal(s.name, "SPA");
  assert.deepEqual(s.parties.map((p) => p.name), ["Acme Industries Limited", "Rahul Mehta"]);
  const doc = s.documents[0];
  assert.deepEqual(Object.keys(doc.sigPages), ["2", "3"]);
  assert.equal(copyFileName(s, doc, s.parties[1].id), "SPA - Executed Counterpart - Rahul Mehta.pdf");
});

test("the same party in a second document is one party", () => {
  const { signing: a } = spa();
  const { signing: b } = addDocument(a, {
    fileId: "f-doa",
    fileName: "Deed of Adherence.pdf",
    pages: [body, sig(["SIGNED by RAHUL MEHTA"], ["Rahul Mehta"])],
  });
  assert.equal(b.parties.length, 2);
  assert.equal(b.documents.length, 2);
});

test("a scan with no name is placed by what it says", () => {
  const { signing: s0, docId } = spa();
  const s = addReturn(s0, ret("r1", "scan0001.pdf", "SIGNED AND DELIVERED by the within named Seller,\nRAHUL MEHTA\nName: Rahul Mehta\n[Signature page to the Share Purchase Agreement]"));
  const rahul = s.parties[1].id;
  assert.deepEqual(signedFor(s, docId, rahul).map((r) => r.id), ["r1"]);
  assert.equal(s.returns[0].autoPlaced, false, "a clear reading needs no confirmation");
  assert.equal(s.returns[0].suggestion?.confidence, "high");
});

test("an unreadable file with no useful name waits for the user", () => {
  const { signing: s0 } = spa();
  const s = addReturn(s0, ret("r1", "IMG_2231.jpg", null));
  assert.deepEqual(unplaced(s).map((r) => r.id), ["r1"]);
});

test("stamp papers go to the party who bought them; a reused certificate is a problem", () => {
  const { signing: s0, docId } = spa();
  const cert = (id: string, buyer: string) => ({
    ...ret(id, `${id}.pdf`, `e-Stamp\nCertificate No. : IN-KA12345678\nPurchased by : ${buyer}\nStamp Duty Paid By : ${buyer}`),
    estamp: { certificateNo: "IN-KA12345678", issuedDate: null, purchasedBy: buyer, firstParty: null, secondParty: null, paidBy: buyer, amount: "500", description: null },
  });
  let s = addReturn(s0, cert("st1", "ACME INDUSTRIES LIMITED"));
  s = addReturn(s, cert("st2", "RAHUL MEHTA"));
  const [acme, rahul] = s.parties.map((p) => p.id);
  assert.deepEqual(stampsFor(s, docId, acme).map((r) => r.id), ["st1"]);
  assert.deepEqual(stampsFor(s, docId, rahul).map((r) => r.id), ["st2"]);
  const flags = signingFlags(s);
  assert.equal(flags.filter((f) => f.severity === "problem").length, 2);
  assert.equal(copyStatus(s, s.documents[0], acme, flags).ready, false);
});

test("a stamp paper in the wrong copy is flagged by name", () => {
  const { signing: s0, docId } = spa();
  let s = addReturn(s0, {
    ...ret("st", "stamp.pdf", "e-Stamp\nPurchased by : RAHUL MEHTA"),
    estamp: { certificateNo: "IN-KA999", issuedDate: null, purchasedBy: "RAHUL MEHTA", firstParty: null, secondParty: null, paidBy: null, amount: null, description: null },
  });
  const acme = s.parties[0].id;
  s = placeReturn(s, "st", { status: "placed", role: "stamp", docId, partyId: acme });
  const flags = signingFlags(s);
  assert.match(flags[0].message, /names RAHUL MEHTA, not Acme Industries Limited/);
});

test("progress, readiness and the chase list follow the returns", () => {
  const { signing: s0, docId } = spa();
  let s = setCopyType(s0, docId, s0.parties[1].id, "none");
  s = addReturn(s, ret("r1", "Acme signed.pdf", null));
  const flags = signingFlags(s);
  const p = progress(s, flags);
  assert.deepEqual([p.signedDone, p.signedTotal, p.stampDone, p.stampTotal, p.copiesTotal], [1, 2, 0, 1, 1]);
  assert.match(chaseList(s), /Rahul Mehta: signed signature page for the SPA \(p\. 4\)/);
  assert.match(chaseList(s), /Acme Industries Limited: stamp paper for the SPA/);
});

test("unmarking a signature page drops its parties and frees their files", () => {
  const { signing: s0, docId } = spa();
  let s = addReturn(s0, ret("r1", "Rahul Mehta signed.pdf", null));
  assert.equal(s.returns[0].placement.status, "placed");
  s = toggleSignaturePage(s, docId, 3);
  assert.equal(s.parties.length, 1);
  assert.equal(s.returns[0].placement.status, "unplaced");
  s = addPartyToPage(s, docId, 2, "Rahul Mehta");
  s = removePartyFromPage(s, docId, 2, s.parties[0].id);
  assert.deepEqual(s.parties.map((x) => x.name), ["Rahul Mehta"]);
});
