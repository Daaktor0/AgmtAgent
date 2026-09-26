import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildClosingIndex } from "./index-pdf.ts";
import type { PageInfo } from "./model.ts";
import { addDocument, addReturn, createSigning, placeReturn, type NewReturn } from "./signing.ts";

const body: PageInfo = { text: "1. DEFINITIONS\nThe Company shall procure compliance.", likelySignature: false, suggestedParties: [] };
const sig = (lines: string[], parties: string[]): PageInfo => ({
  text: [...lines, "Name:", "[Signature page to the Share Purchase Agreement]"].join("\n"),
  likelySignature: true,
  suggestedParties: parties,
});
const stamp = (id: string, cert: string, amount: string): NewReturn => ({
  id, fileName: `${id}.pdf`, hash: id, kind: "pdf", pageCount: 1, text: "e-Stamp", textSource: "pdf",
  estamp: { certificateNo: cert, issuedDate: null, purchasedBy: null, firstParty: null, secondParty: null, paidBy: null, amount, description: null },
});

function signing() {
  const { signing: s0, docId } = addDocument(createSigning("Project Søren"), {
    fileId: "f",
    fileName: "SPA_Final.pdf",
    pages: [body, sig(["For and on behalf of ACME INDUSTRIES LIMITED"], ["ACME INDUSTRIES LIMITED"]), sig(["SIGNED by SØREN IYER"], ["SØREN IYER"])],
  });
  const acme = s0.parties[0].id;
  let s = addReturn(s0, stamp("st1", "IN-KA111", "500"));
  s = addReturn(s, stamp("st2", "IN-KA222", "100"));
  s = placeReturn(s, "st1", { status: "placed", role: "stamp", docId, partyId: acme });
  s = placeReturn(s, "st2", { status: "placed", role: "stamp", docId, partyId: acme });
  return { s, docId, acme, soren: s.parties[1].id };
}

async function textOf(bytes: Uint8Array): Promise<string> {
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const content = await (await pdf.getPage(i)).getTextContent();
    out.push(content.items.map((it) => ("str" in it ? it.str : "")).join("\n"));
  }
  return out.join("\n");
}

test("the index lists only the copies in the zip and says why the rest are left out", async () => {
  const { s, docId, acme } = signing();
  const bytes = await buildClosingIndex(s, [{ docId, partyId: acme, fileName: "Acme Industries Limited - SPA - Executed Counterpart.pdf" }], { now: new Date("2026-09-26") });
  const text = await textOf(bytes);
  assert.match(text, /Acme Industries Limited/);
  assert.match(text, /Not included/);
  assert.match(text, /awaiting the signed pages? from/);
  assert.match(text, /26 September 2026/);
});

test("each stamp paper on a copy gets its own line", async () => {
  const { s, docId, acme } = signing();
  const text = await textOf(await buildClosingIndex(s, [{ docId, partyId: acme, fileName: "a.pdf" }]));
  const lines = text.split("\n");
  assert.ok(lines.some((l) => /^IN-KA111 - Rs\. 500$/.test(l.trim())), text);
  assert.ok(lines.some((l) => /^IN-KA222 - Rs\. 100$/.test(l.trim())), text);
});

test("with the Execute typefaces, names print as written", async () => {
  const { s, docId, soren } = signing();
  const font = (n: string) => new Uint8Array(readFileSync(new URL(`../../../public/fonts/${n}`, import.meta.url)));
  const bytes = await buildClosingIndex(s, [{ docId, partyId: soren, fileName: "Søren Iyer - SPA.pdf" }], {
    fonts: { serif: font("source-serif-4-400.ttf"), sans: font("archivo-400.ttf"), sansBold: font("archivo-600.ttf") },
  });
  const text = await textOf(bytes);
  assert.match(text, /Søren Iyer/);
  assert.match(text, /Project Søren/);
});
