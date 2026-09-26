import { test } from "node:test";
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { layoutSegments, type TextItem } from "./detect.ts";
import { pageItems } from "./extract.ts";
import { agreementName, namesFromSchedule, partyKind, readPartiesClause, scheduleStart, signatureFooter, type ClauseEntry } from "./parties.ts";
import { buildNoSignatureAgreement, NO_SIGNATURE_EXPECTED } from "./sample-parties.ts";

async function read(bytes: Uint8Array): Promise<{ items: TextItem[][]; texts: string[] }> {
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const items: TextItem[][] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) items.push(await pageItems(pdf, n));
  return { items, texts: items.map((i) => layoutSegments(i).map((s) => s.text).join("\n")) };
}

test("the parties clause gives named parties with their defined terms, and a group kept in a schedule", async () => {
  const { texts } = await read(await buildNoSignatureAgreement());
  const clause = readPartiesClause(texts);
  assert.ok(clause, "a parties clause is found");
  const named = clause.entries.filter((e): e is Extract<ClauseEntry, { type: "named" }> => e.type === "named");
  assert.deepEqual(named.map(({ name, term }) => ({ name, term })), NO_SIGNATURE_EXPECTED.named);
  const groups = clause.entries.filter((e) => e.type === "group");
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0], { type: "group", term: "Investors", ref: NO_SIGNATURE_EXPECTED.group.ref });
});

test("the schedule's table gives the investors: the right Part, wrapped names joined, contents page ignored", async () => {
  const { items, texts } = await read(await buildNoSignatureAgreement());
  const ref = NO_SIGNATURE_EXPECTED.group.ref;
  assert.equal(scheduleStart(texts, ref), 5, "Schedule 1 starts on page 6, not the contents page");
  assert.deepEqual(namesFromSchedule(items, texts, ref), NO_SIGNATURE_EXPECTED.investors);
});

test("clause formats: numbered without PART endings, and 'AND' separated", () => {
  const numbered = readPartiesClause([
    'THIS AGREEMENT is made BETWEEN:\n(1) ACME INDUSTRIES LIMITED, a company incorporated in India ("Acme"); and\n(2) BETA LABS LLP, a limited liability partnership ("Beta").\nIT IS AGREED as follows:',
  ]);
  assert.deepEqual(numbered?.entries.map((e) => (e.type === "named" ? e.name : "group")), ["Acme Industries Limited", "Beta Labs LLP"]);
  const byAnd = readPartiesClause([
    'BY AND BETWEEN\nMS. PRIYA NAIR, residing at Mumbai (the "Seller")\nAND\nLOTUS HOLDINGS PRIVATE LIMITED, having its office at Pune (the "Buyer")\nWHEREAS the Seller holds shares',
  ]);
  assert.deepEqual(byAnd?.entries.map((e) => (e.type === "named" ? e.name : "group")), ["Priya Nair", "Lotus Holdings Private Limited"]);
});

test("the agreement's name comes from the cover, and each party gets a kind", async () => {
  const { texts } = await read(await buildNoSignatureAgreement());
  assert.equal(agreementName(texts, "fallback"), NO_SIGNATURE_EXPECTED.title);
  assert.deepEqual(
    ["Saffron Healthcare Private Limited", "Vikram Mehta", "Northstar Ventures LLP", "Peepal Family Trust", "Kestrel India Opportunities Fund – Scheme A", "Arjun Kapoor HUF"].map(partyKind),
    ["company", "individual", "llp", "trust", "trust", "huf"],
  );
});

test("the footer names the agreement and the parties, never a date", () => {
  const footer = signatureFooter(NO_SIGNATURE_EXPECTED.title, [
    ...NO_SIGNATURE_EXPECTED.named.map((n) => ({ name: n.name })),
    { name: "", group: { term: "Investors", ref: { word: "Schedule", number: "1", part: "A" } } },
  ]);
  assert.equal(footer, NO_SIGNATURE_EXPECTED.footer);
  assert.doesNotMatch(footer, /dated|\d{4}/i);
  assert.equal(
    signatureFooter("Share Purchase Agreement", [{ name: "Priya Nair" }, { name: "Lotus Holdings Private Limited" }]),
    "This signature page forms an integral part of the Share Purchase Agreement executed by and between Priya Nair and Lotus Holdings Private Limited.",
  );
});
