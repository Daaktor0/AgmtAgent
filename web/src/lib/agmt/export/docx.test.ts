import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { exportProofDocx, validateProofExport, planProofExport } from "./docx.ts";
import { analyzeProof } from "../proof/launch.ts";
import { launchFixture, DEMO_ACCEPTED, DEMO_SENTENCE } from "../corpus/launch-fixtures.ts";
import { buildDocx } from "../docx.ts";
import { extractDocx } from "../docx-v2.ts";

test("DOCX export creates genuine tracked corrections and exact comments, preserving source and prior review", async () => {
  for (const kind of ["body", "split_runs", "table", "prior_review"] as const) {
    const source = await launchFixture(kind), before = Buffer.from(source);
    const exported = await exportProofDocx(source, new Date("2026-09-05T00:00:00Z"));
    assert.deepEqual(source, before);
    assert.equal(exported.receipt.revisionIds.length, 3); // Replacement = deletion + insertion; repeated word = deletion.
    assert.equal(exported.receipt.commentIds.length, 2);
    const extracted = await extractDocx(exported.bytes);
    assert.equal(extracted.blocks[0].text, DEMO_ACCEPTED);
    assert.equal((await extractDocx(source)).blocks[0].text, DEMO_SENTENCE);
    const xml = await (await JSZip.loadAsync(exported.bytes)).file("word/document.xml")!.async("string");
    assert.match(xml, /<w:del\b/); assert.match(xml, /<w:ins\b/); assert.match(xml, /<w:delText\b/);
    assert.match(xml, /w:author="Agmt Proof"/);
    if (kind === "prior_review") { assert.equal(extracted.comments.length, 3); assert.equal(extracted.revisions.length, 5); }
    if (kind === "split_runs") assert.match(xml, /<w:ins[^>]*><w:r><w:rPr><w:b\/><\/w:rPr><w:t[^>]*>re<\/w:t><\/w:r><w:r><w:rPr><w:i\//);
    await validateProofExport(source, exported.bytes, exported.receipt);
  }
});

test("zero findings returns exact original bytes; limited coverage adds an explicit notice", async () => {
  const clean = await launchFixture("party_name");
  assert.deepEqual((await exportProofDocx(clean)).bytes, clean);
  const bytes = await buildDocx(["The Company shall deliver notice."], { header: "A readable header." });
  const result = await exportProofDocx(bytes);
  assert.equal(result.analysis.coverage, "limited");
  assert.equal(result.receipt.plan.findings.length, 0);
  assert.equal(result.receipt.plan.notices[0].anchorMode, "document_notice");
  assert.match((await extractDocx(result.bytes)).comments[0].text, /Agmt Proof — coverage/);
});

test("reject missing anchors, altered untouched parts, wrong comment text and forged source binding", async () => {
  const source = await launchFixture("body"), result = await exportProofDocx(source);
  const mutations = [
    ["word/document.xml", (s: string) => s.replace(/<w:commentRangeStart[^>]*\/>/, "")],
    ["word/comments.xml", (s: string) => s.replace("Please confirm the reference.", "This is legally invalid.")],
    ["docProps/app.xml", (s: string) => s.replace(/<Pages>.*?<\/Pages>/, "<Pages>999</Pages>")],
  ] as const;
  for (const [path, mutate] of mutations) {
    const zip = await JSZip.loadAsync(result.bytes); zip.file(path, mutate(await zip.file(path)!.async("string")));
    await assert.rejects(() => zip.generateAsync({ type: "nodebuffer" }).then((bad) => validateProofExport(source, bad, result.receipt)));
  }
  await assert.rejects(() => validateProofExport(Buffer.from("not the source"), result.bytes, result.receipt));
});

test("planner rejects forged predicates and conflicting same-ID findings, deduplicates identical findings", async () => {
  const analysis = await analyzeProof(await launchFixture("body"));
  analysis.plan.findings.push(structuredClone(analysis.plan.findings[0]));
  assert.equal(planProofExport(analysis).findings.length, 4);
  analysis.plan.findings.at(-1)!.replacement = "wrong";
  assert.throws(() => planProofExport(analysis), /export_conflicting_id/);
});
