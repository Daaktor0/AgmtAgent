import { test } from "node:test";
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import { copyStatus, progress, signingFlags } from "./checks.ts";
import { readEStamp } from "./estamp.ts";
import { analyseDocument, returnText } from "./extract.ts";
import { buildClosingIndex } from "./index-pdf.ts";
import { createCompiler, type RenderAttachment } from "./render.ts";
import { buildSampleSigning } from "./sample.ts";
import { addDocument, addReturn, copyParties, createSigning, partyName, planFor, signedFor, stampsFor, unplaced } from "./signing.ts";

const open = (bytes: Uint8Array) => pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;

test("sample signing: finds signature pages, sorts every return by content, builds every copy", async () => {
  const sample = await buildSampleSigning();
  let s = createSigning("Untitled signing");
  for (const [i, file] of sample.documents.entries()) {
    const pages = await analyseDocument(await open(file.bytes));
    s = addDocument(s, { fileId: `doc${i}`, fileName: file.name, pages }).signing;
  }

  for (const doc of s.documents) {
    const expected = sample.expected[doc.title];
    assert.ok(expected, `expected data for ${doc.title}`);
    assert.deepEqual(Object.keys(doc.sigPages).map(Number), expected.signaturePages, doc.title);
    for (const page of expected.signaturePages) {
      assert.deepEqual(doc.sigPages[page].map((id) => partyName(s, id)), expected.partiesByPage[page], `${doc.title} p. ${page + 1}`);
    }
  }
  assert.equal(s.parties.length, 7, "parties shared across the two documents are one party each");

  for (const [i, file] of sample.returns.entries()) {
    const text = await returnText(await open(file.bytes));
    s = addReturn(s, { id: `r${i}`, fileName: file.name, hash: `h${i}`, kind: "pdf", pageCount: (await PDFDocument.load(file.bytes)).getPageCount(), text, textSource: "pdf", estamp: readEStamp(text) });
  }
  assert.deepEqual(unplaced(s).map((r) => r.fileName), [], "every sample return is placed");

  const [sha, ssa] = s.documents;
  const tamarind = s.parties.find((p) => p.name === "Tamarind Growth Partners")!;
  // The two promoters sign one page; each sent their own copy of it.
  const rahul = s.parties.find((p) => p.name === "Rahul Mehta")!;
  assert.deepEqual(signedFor(s, sha.id, rahul.id).map((r) => r.fileName), ["Rahul Mehta - SHA signed.pdf"]);
  // Scanner-named SSA pages and stamp papers still land in the SSA.
  for (const party of copyParties(ssa)) {
    assert.equal(signedFor(s, ssa.id, party).length, 1, `SSA page for ${partyName(s, party)}`);
    assert.equal(stampsFor(s, ssa.id, party).length, 1, `SSA stamp for ${partyName(s, party)}`);
  }

  const flags = signingFlags(s);
  assert.deepEqual(flags.map((f) => f.message), [], "no checks raised on a clean sample");
  const p = progress(s, flags);
  assert.deepEqual([p.signedDone, p.signedTotal, p.stampDone, p.stampTotal], [10, 11, 11, 11]);
  assert.equal(p.copiesReady, 4, "only the SSA copies are complete while Tamarind's SHA page is awaited");
  assert.deepEqual(copyStatus(s, sha, rahul.id, flags).awaitingSigned, [tamarind.id]);

  const attachments = new Map<string, RenderAttachment>(
    s.returns.map((r, i) => [r.id, { source: { type: "pdf", bytes: sample.returns[i].bytes }, rotation: 0, label: r.fileName }]),
  );
  const compiler = await createCompiler(sample.documents[1].bytes, attachments);
  for (const party of copyParties(ssa)) {
    const out = await PDFDocument.load(await compiler.build(planFor(s, ssa, party), "copy"));
    // stamp + 2 body pages + 4 countersigned pages + schedule
    assert.equal(out.getPageCount(), 1 + 2 + 4 + 1, partyName(s, party));
  }
  const index = await PDFDocument.load(await buildClosingIndex(s));
  assert.ok(index.getPageCount() >= 1);
});
