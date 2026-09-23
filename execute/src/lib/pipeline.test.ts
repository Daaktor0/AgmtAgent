import { test } from "node:test";
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import { analysePages } from "./extract.ts";
import { buildSampleDeal } from "./sample.ts";
import { planExecutedCopy } from "./plan.ts";
import { createCompiler, type RenderAttachment } from "./render.ts";

test("sample deal: finds the signature pages and parties, then builds every executed copy", async () => {
  const deal = await buildSampleDeal();
  const pdf = await pdfjs.getDocument({ data: deal.agreement.bytes.slice(), verbosity: 0 }).promise;
  const pages = await analysePages(pdf);

  const flagged = pages.flatMap((p, i) => (p.likelySignature ? [i] : []));
  assert.deepEqual(flagged, deal.expected.signaturePages);
  for (const index of flagged) {
    const expected = deal.expected.partiesByPage[index].map((n) => n.toUpperCase());
    assert.deepEqual(pages[index].suggestedParties.map((n) => n.toUpperCase()), expected, `page ${index + 1}`);
  }

  // Assign every return by the party name in its file name, as a lawyer would.
  const parties = Object.values(deal.expected.partiesByPage).flat();
  const attachments = new Map<string, RenderAttachment>();
  const signedByParty = new Map<string, string[]>();
  const stampsByParty = new Map<string, string[]>();
  deal.returns.forEach((file, i) => {
    const id = `f${i}`;
    attachments.set(id, { source: { type: "pdf", bytes: file.bytes }, rotation: 0, label: file.name });
    const party = parties.find((p) => file.name.includes(p))!;
    const bucket = file.name.startsWith("e-Stamp") ? stampsByParty : signedByParty;
    bucket.set(party, [...(bucket.get(party) ?? []), id]);
  });

  const signaturePages = new Map(Object.entries(deal.expected.partiesByPage).map(([k, v]) => [Number(k), v]));
  const compiler = await createCompiler(deal.agreement.bytes, attachments);
  for (const party of parties) {
    const plan = planExecutedCopy({
      pageCount: compiler.pageCount,
      signaturePages,
      signedByParty,
      stampIds: stampsByParty.get(party) ?? [],
    });
    assert.deepEqual(plan.missingParties, ["Tamarind Growth Partners"]);
    const bytes = await compiler.build(plan, `Executed - ${party}`);
    const out = await PDFDocument.load(bytes);
    const stampPages = party === "Meridian Foods Private Limited" ? 2 : 1;
    // stamp + 6 body + 7 returned pages (2 promoters on one page) + Tamarind's unsigned page + schedule
    assert.equal(out.getPageCount(), stampPages + 6 + 6 + 1 + 1, party);
  }
});
