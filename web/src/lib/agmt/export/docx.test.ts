import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { exportProofDocx, validateProofExport, planProofExport } from "./docx.ts";
import { analyzeProof, validateLaunchFinding } from "../proof/launch.ts";
import { resolveProofFindings } from "../proof/resolve-findings.ts";
import { launchFixture, DEMO_ACCEPTED, DEMO_SENTENCE } from "../corpus/launch-fixtures.ts";
import { buildDocx } from "../docx.ts";
import { extractDocx } from "../docx-v2.ts";

test("DOCX export creates genuine tracked corrections and exact comments, preserving source and prior review", async () => {
  for (const kind of ["body", "split_runs", "table", "prior_review"] as const) {
    const source = await launchFixture(kind), before = Buffer.from(source);
    const exported = await exportProofDocx(source, new Date("2026-09-05T00:00:00Z"));
    assert.deepEqual(source, before);
    if (kind === "split_runs") {
      assert.equal(exported.receipt.revisionIds.length, 1); // Mixed-format typo is comment-only; repeated word is a deletion.
      assert.equal(exported.receipt.commentIds.length, 3);
    } else {
      assert.equal(exported.receipt.revisionIds.length, 3); // Replacement = deletion + insertion; repeated word = deletion.
      assert.equal(exported.receipt.commentIds.length, 2);
    }
    const extracted = await extractDocx(exported.bytes);
    assert.equal(extracted.blocks[0].text, kind === "split_runs" ? "The Company shall recieve the notice under Clause 99.2 by [●]." : DEMO_ACCEPTED);
    assert.equal((await extractDocx(source)).blocks[0].text, DEMO_SENTENCE);
    const xml = await (await JSZip.loadAsync(exported.bytes)).file("word/document.xml")!.async("string");
    assert.match(xml, /<w:del\b/); assert.match(xml, /<w:delText\b/);
    assert.match(xml, /w:author="Agmt Proof"/);
    if (kind === "split_runs") assert.match(xml, /<w:commentRangeStart\b/);
    else {
      assert.match(xml, /<w:ins\b/);
    }
    if (kind === "prior_review") { assert.equal(extracted.comments.length, 3); assert.equal(extracted.revisions.length, 5); }
    await validateProofExport(source, exported.bytes, exported.receipt);
  }
});

test("export reuses a provided analysis instead of requiring a second parse", async () => {
  const source = await launchFixture("body");
  const now = new Date("2026-09-05T00:00:00Z");
  const analysis = await analyzeProof(source, { profile: "agreement", language: "en-GB" });
  const reused = await exportProofDocx(source, now, { analysis, profile: "agreement", language: "en-GB" });
  const fresh = await exportProofDocx(source, now, { profile: "agreement", language: "en-GB" });
  assert.deepEqual(reused.bytes, fresh.bytes);
  assert.equal(reused.receipt.revisionIds.length, fresh.receipt.revisionIds.length);
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
  const correction = analysis.plan.findings.find((finding) => finding.kind === "correction");
  assert.ok(correction);
  analysis.plan.findings.push(structuredClone(correction));
  assert.equal(planProofExport(analysis).findings.length, 4);
  const conflict = structuredClone(correction);
  conflict.replacement = "wrong";
  const resolved = resolveProofFindings(analysis.source, [...analysis.plan.findings, conflict]);
  assert.ok(resolved.findings.length <= 4);
  assert.ok(resolved.findings.some((finding) => finding.kind === "comment" && /conflicting/i.test(finding.comment)));
  assert.throws(() => validateLaunchFinding(analysis, { ...correction, comment: "forged claim" }), /invalid_rule_evidence/);
});

test("PWC-10 same-format replacements keep one insertion run with original rPr and xml:space", async () => {
  const zip = await JSZip.loadAsync(await launchFixture("body"));
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">The Company shall re</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">cieve the the notice under Clause 99.2 by [●].</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
  );
  const source = await zip.generateAsync({ type: "nodebuffer" });
  const exported = await exportProofDocx(source, new Date("2026-09-05T00:00:00Z"));
  const xml = await (await JSZip.loadAsync(exported.bytes)).file("word/document.xml")!.async("string");
  assert.match(xml, /<w:ins\b[^>]*>\s*<w:r>\s*<w:rPr>\s*<w:b\/>\s*<\/w:rPr>\s*<w:t xml:space="preserve">receive<\/w:t>/);
  assert.equal((xml.match(/<w:ins\b/g) ?? []).length, 1);
  assert.equal(exported.receipt.revisionIds.length, 3);
  await validateProofExport(source, exported.bytes, exported.receipt);
});

test("PWC-10 unicode, existing IDs and classic comments survive without reuse or relocation", async () => {
  const source = await launchFixture("prior_review");
  const exported = await exportProofDocx(source);
  for (const id of [...exported.receipt.revisionIds, ...exported.receipt.commentIds, ...exported.receipt.noticeIds]) {
    assert.equal(["0", "7", "8"].includes(id), false, `reused existing id ${id}`);
  }
  const originalComments = await (await JSZip.loadAsync(source)).file("word/comments.xml")!.async("string");
  const outputComments = await (await JSZip.loadAsync(exported.bytes)).file("word/comments.xml")!.async("string");
  assert.match(originalComments, /Existing comment stays unchanged/);
  assert.match(outputComments, /Existing comment stays unchanged/);
  const xml = await (await JSZip.loadAsync(exported.bytes)).file("word/document.xml")!.async("string");
  assert.match(xml, /w:id="7"/);
  assert.match(xml, /w:id="8"/);
  assert.match(xml, /w:id="0"/);

  const unicodeZip = await JSZip.loadAsync(await buildDocx([
    "The Company shall recieve notice.",
    "The café 日本語 clause remains.",
  ]));
  const unicode = await unicodeZip.generateAsync({ type: "nodebuffer" });
  const unicodeExport = await exportProofDocx(unicode);
  assert.equal(unicodeExport.receipt.plan.findings.some((finding) => finding.exactQuote === "recieve" && finding.kind === "correction"), true);
  assert.match(await (await JSZip.loadAsync(unicodeExport.bytes)).file("word/document.xml")!.async("string"), /café 日本語/);
  await validateProofExport(unicode, unicodeExport.bytes, unicodeExport.receipt);
});

test("PWC-10 findings inside existing revisions are suppressed with coverage, never nested or moved", async () => {
  const zip = await JSZip.loadAsync(await buildDocx(["The Company shall recieve notice."]));
  const xml = await zip.file("word/document.xml")!.async("string");
  zip.file(
    "word/document.xml",
    xml.replace(
      '<w:t xml:space="preserve">The Company shall recieve notice.</w:t>',
      '<w:t xml:space="preserve">The Company shall </w:t></w:r><w:ins w:id="9" w:author="Prior Reviewer" w:date="2026-01-01T00:00:00Z"><w:r><w:t xml:space="preserve">recieve</w:t></w:r></w:ins><w:r><w:t xml:space="preserve"> notice.</w:t>',
    ),
  );
  const source = await zip.generateAsync({ type: "nodebuffer" });
  const analysis = await analyzeProof(source);
  assert.equal(analysis.plan.findings.some((finding) => finding.exactQuote === "recieve"), false);
  assert.ok(analysis.gaps.includes("prior_revision") || analysis.gaps.includes("prior_agmt_revision"));
  const exported = await exportProofDocx(source);
  const outXml = await (await JSZip.loadAsync(exported.bytes)).file("word/document.xml")!.async("string");
  assert.match(outXml, /w:id="9"/);
  assert.equal(exported.receipt.revisionIds.length, 0);
  assert.equal(exported.receipt.plan.findings.filter((finding) => finding.kind === "correction").length, 0);
  assert.ok(exported.receipt.plan.notices.length >= 1);
  await validateProofExport(source, exported.bytes, exported.receipt);
});

test("PWC-10 duplicate and overlap decisions survive export without duplicated markup", async () => {
  const source = await launchFixture("body");
  const exported = await exportProofDocx(source);
  const xml = await (await JSZip.loadAsync(exported.bytes)).file("word/document.xml")!.async("string");
  assert.equal((xml.match(/<w:del\b/g) ?? []).length + (xml.match(/<w:ins\b/g) ?? []).length, exported.receipt.revisionIds.length);
  const commentStarts = xml.match(/<w:commentRangeStart\b/g) ?? [];
  assert.equal(commentStarts.length, exported.receipt.commentIds.length + exported.receipt.noticeIds.length);
  await validateProofExport(source, exported.bytes, exported.receipt);
});
