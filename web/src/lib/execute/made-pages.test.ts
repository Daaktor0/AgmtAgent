import { test } from "node:test";
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import { signingFlags } from "./checks.ts";
import { layoutSegments, type TextItem } from "./detect.ts";
import { analyseDocument, pageItems, returnText } from "./extract.ts";
import { buildSignaturePages, findNameSlots, fontStyle, PRESET_FORMATS, type Sheet, type StyledItem } from "./generate.ts";
import { agreementName, namesFromSchedule, partyKind, readPartiesClause, signatureFooter, type ClauseEntry } from "./parties.ts";
import { createCompiler } from "./render.ts";
import { buildNoSignatureAgreement, buildSignatureTemplate, NO_SIGNATURE_EXPECTED, TEMPLATE_SAMPLE_NAME } from "./sample-parties.ts";
import {
  addDocument, addReturn, applyMadePages, chooseAgreementPages, createSigning, pageLabel, pagesOf, partyName, planFor, signedFor,
  totalPages, unplaced,
} from "./signing.ts";

const A4: [number, number] = [595.28, 841.89];
const open = (bytes: Uint8Array) => pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;

/** What the Documents tab does: read the parties, then the schedule. */
async function partiesOf(bytes: Uint8Array): Promise<{ names: string[]; footer: string }> {
  const pdf = await open(bytes);
  const items: TextItem[][] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) items.push(await pageItems(pdf, n));
  const texts = items.map((i) => layoutSegments(i).map((s) => s.text).join("\n"));
  const clause = readPartiesClause(texts)!;
  const names: string[] = [];
  const footerParties: Parameters<typeof signatureFooter>[1] = [];
  for (const entry of clause.entries as ClauseEntry[]) {
    if (entry.type === "named") {
      names.push(entry.name);
      footerParties.push({ name: entry.name });
    } else {
      names.push(...namesFromSchedule(items, texts, entry.ref, clause.pageIndex));
      footerParties.push({ name: "", group: { term: entry.term, ref: entry.ref } });
    }
  }
  return { names, footer: signatureFooter(agreementName(texts, "Agreement"), footerParties) };
}

async function readBack(bytes: Uint8Array) {
  return returnText(await open(bytes));
}

test("an agreement with no signature pages: pages made from its parties, returns sorted to them, signed pages at the end", async () => {
  const final = await buildNoSignatureAgreement();
  const pages = await analyseDocument(await open(final));
  let s = createSigning("Untitled signing");
  s = addDocument(s, { fileId: "final", fileName: "Saffron SHA - final.pdf", pages }).signing;
  const doc0 = s.documents[0];
  assert.deepEqual(Object.keys(doc0.sigPages), [], "no signature pages are found in it");

  const { names, footer } = await partiesOf(final);
  assert.deepEqual(names, [...NO_SIGNATURE_EXPECTED.named.map((n) => n.name), ...NO_SIGNATURE_EXPECTED.investors]);
  assert.equal(footer, NO_SIGNATURE_EXPECTED.footer);

  const sheets: Sheet[] = names.map((name) => ({ name, kind: "plain", body: PRESET_FORMATS[partyKind(name)].body }));
  const made = await buildSignaturePages({ size: A4, sheets, footer });
  s = applyMadePages(s, doc0.id, { from: "parties", fileId: "made", sheets: names.map((name, i) => ({ name, text: made.texts[i] })) });
  const doc = s.documents[0];
  assert.equal(totalPages(doc), 7 + 9);
  assert.equal(s.parties.length, 9);
  assert.equal(pageLabel(doc, 9), "signature page 3");

  // Each party's page is cut from the made pages, signed and sent back under a scanner's name.
  const compiler = await createCompiler(final, new Map(), made.bytes);
  const order = [4, 0, 8, 2, 6, 1, 5, 3, 7];
  for (const [k, i] of order.entries()) {
    const party = s.parties.find((p) => p.name === names[i])!;
    const page = await compiler.extract(pagesOf(doc, party.id), names[i]);
    s = addReturn(s, { id: `r${k}`, fileName: `Scan_${String(k + 1).padStart(4, "0")}.pdf`, hash: `h${k}`, kind: "pdf", pageCount: 1, text: await readBack(page), textSource: "pdf", estamp: null });
  }
  assert.deepEqual(unplaced(s).map((r) => r.fileName), [], "every return is sorted by what it says");
  for (const party of s.parties) {
    const files = signedFor(s, doc.id, party.id);
    assert.equal(files.length, 1, party.name);
  }
  assert.deepEqual(signingFlags(s).filter((f) => f.severity === "check"), [], "each return reads like the page that was sent");

  // The executed copy: the whole agreement, then the signed pages, in the parties' order.
  const returns = new Map(
    await Promise.all(
      s.returns.map(async (r) => {
        const party = s.parties.find((p) => signedFor(s, doc.id, p.id).some((x) => x.id === r.id))!;
        const bytes = await compiler.extract(pagesOf(doc, party.id), party.name);
        return [r.id, { source: { type: "pdf" as const, bytes }, rotation: 0 as const, label: r.fileName }] as const;
      }),
    ),
  );
  const assemble = await createCompiler(final, returns, made.bytes);
  const vikram = s.parties.find((p) => p.name === "Vikram Mehta")!;
  const copy = await assemble.build(planFor(s, doc, vikram.id), "Copy");
  const pdf = await open(copy);
  assert.equal(pdf.numPages, 16);
  const tail: string[] = [];
  for (let n = 8; n <= 16; n += 1) tail.push(layoutSegments(await pageItems(pdf, n)).map((x) => x.text).join(" "));
  names.forEach((name, i) => assert.match(tail[i], new RegExp(name.replace(/[–]/g, ".")), `page ${8 + i} is ${name}'s`));
  const firstLines = layoutSegments(await pageItems(pdf, 1)).map((x) => x.text);
  assert.ok(firstLines.includes("SHAREHOLDERS' AGREEMENT"), "the agreement comes first, untouched");

  // Back to the agreement's own pages: none, so the made parties and their placements go.
  const back = chooseAgreementPages(s, doc.id);
  assert.equal(back.documents[0].made, null);
  assert.equal(back.parties.length, 0);
  assert.equal(unplaced(back).length, 9);
});

test("pages made from the lawyer's PDF template sort as well, with their own footer", async () => {
  const final = await buildNoSignatureAgreement();
  const template = await buildSignatureTemplate();
  const tpdf = await open(template);
  const tpage = await tpdf.getPage(1);
  const content = await tpage.getTextContent();
  await tpage.getOperatorList();
  const items: StyledItem[] = [];
  for (const raw of content.items) {
    if (!("str" in raw)) continue;
    const [, , c, d, e, f] = raw.transform as number[];
    const font = tpage.commonObjs.has(raw.fontName) ? tpage.commonObjs.get(raw.fontName) : null;
    items.push({ str: raw.str, x: e, y: f, width: raw.width, height: raw.height || Math.hypot(c, d), style: fontStyle(font, content.styles[raw.fontName]?.fontFamily) });
  }
  const spec = { bytes: template, pageIndex: 0, sample: TEMPLATE_SAMPLE_NAME, slots: findNameSlots(items, TEMPLATE_SAMPLE_NAME, 595.28), text: layoutSegments(items).map((x) => x.text).join("\n") };
  const names = NO_SIGNATURE_EXPECTED.investors;
  const made = await buildSignaturePages({ size: A4, footer: null, sheets: names.map((name) => ({ name, kind: "template", template: spec })) });

  let s = createSigning("x");
  s = addDocument(s, { fileId: "final", fileName: "SHA.pdf", pages: await analyseDocument(await open(final)) }).signing;
  s = applyMadePages(s, s.documents[0].id, { from: "template", fileId: "made", sheets: names.map((name, i) => ({ name, text: made.texts[i] })) });
  const doc = s.documents[0];
  const compiler = await createCompiler(final, new Map(), made.bytes);
  for (const [k, name] of [...names].reverse().entries()) {
    const party = s.parties.find((p) => p.name === name)!;
    const text = await readBack(await compiler.extract(pagesOf(doc, party.id), name));
    if (!/orchid/i.test(name)) assert.doesNotMatch(text, /ORCHID/, `${name}'s page does not carry the sample name`);
    s = addReturn(s, { id: `t${k}`, fileName: `IMG_${k}.pdf`, hash: `t${k}`, kind: "pdf", pageCount: 1, text, textSource: "pdf", estamp: null });
  }
  assert.deepEqual(unplaced(s).map((r) => r.fileName), []);
  for (const party of s.parties) assert.equal(signedFor(s, doc.id, party.id).length, 1, partyName(s, party.id));
});
