import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { extractDocx } from "./docx-v2.ts";
import { sourceSpan, validateSourceSpan, evaluatedScope, type ProofSource } from "./source-map.ts";
import { buildDocx } from "./docx.ts";
import { launchFixture } from "./corpus/launch-fixtures.ts";

async function read(bytes: Buffer) {
  let source: ProofSource | undefined;
  await extractDocx(bytes, (s) => { source = s; });
  assert.ok(source);
  return source;
}

test("exact repeated phrase/table/split-run node anchors and immutable package", async () => {
  for (const kind of ["body", "split_runs", "table", "prior_review"] as const) {
    const bytes = await launchFixture(kind), before = Buffer.from(bytes);
    const s = await read(bytes), p = s.paragraphs[0];
    const span = sourceSpan(p, 18, 25);
    validateSourceSpan(s, span, "recieve");
    assert.equal(span.nodeSegments.length, kind === "split_runs" ? 2 : 1);
    assert.deepEqual(bytes, before);
    assert.throws(() => { s.paragraphs[0].text = "forged"; }, TypeError);
    assert.throws(() => validateSourceSpan(s, { ...span, textStart: 17 }, "recieve"));
    const first = sourceSpan(p, 26, 29), second = sourceSpan(p, 30, 33);
    assert.throws(() => validateSourceSpan(s, { ...second, nodeSegments: first.nodeSegments }, "the"), /source_node_mismatch/);
  }
  const s = await read(await buildDocx(["recieve", "recieve"], { tableRows: [["recieve"]] }));
  const a = sourceSpan(s.paragraphs[0], 0, 7), b = sourceSpan(s.paragraphs[2], 0, 7);
  assert.throws(() => validateSourceSpan(s, { ...b, nodeSegments: a.nodeSegments }, "recieve"), /source_node_mismatch/);
});

test("UTF-16 offsets preserve astral characters, combining marks, whitespace and XML entities", async () => {
  const s = await read(await buildDocx(["😀 e\u0301 & recieve  notice"]));
  const p = s.paragraphs[0];
  assert.equal(p.text, "😀 e\u0301 & recieve  notice");
  validateSourceSpan(s, sourceSpan(p, 8, 15), "recieve");
  assert.throws(() => sourceSpan(p, 1, 2), /invalid_source_span/);
});

test("final projection keeps original insertion, omits deletion and blocks incomplete absence scope", async () => {
  const s = await read(await launchFixture("prior_review"));
  assert.ok(s.paragraphs[1].text.includes("Added earlier."));
  assert.ok(!s.paragraphs[1].text.includes("Removed earlier."));
  assert.ok(s.paragraphs[1].nodes.some((n) => n.revision && !n.editable));
  assert.equal(evaluatedScope(s, "main_body", 0).matchCount, 0);
  const zip = await JSZip.loadAsync(await buildDocx(["Clause 99.2"]));
  const xml = await zip.file("word/document.xml")!.async("string");
  zip.file("word/document.xml", xml.replace("<w:p>", "<w:sdt><w:sdtContent><w:p>").replace("</w:p>", "</w:p></w:sdtContent></w:sdt>"));
  const incomplete = await read(await zip.generateAsync({ type: "nodebuffer" }));
  assert.equal(incomplete.complete, false);
  assert.throws(() => evaluatedScope(incomplete, "main_body", 0), /incomplete_scope/);
});

test("malformed XML and DTD cannot be accepted as an evaluated source", async () => {
  for (const bad of ["<w:document><w:body></w:document>", '<!DOCTYPE x [<!ENTITY x "hello">]><w:document/>']) {
    const zip = await JSZip.loadAsync(await buildDocx(["test"]));
    zip.file("word/document.xml", bad);
    await assert.rejects(() => zip.generateAsync({ type: "nodebuffer" }).then(read));
  }
});
