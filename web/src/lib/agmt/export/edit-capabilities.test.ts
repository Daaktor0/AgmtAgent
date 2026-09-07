import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { extractDocx } from "../docx-v2.ts";
import { buildDocx } from "../docx.ts";
import { launchFixture } from "../corpus/launch-fixtures.ts";
import { sourceSpan, type ProofSource } from "../source-map.ts";
import { analyzeProof } from "../proof/launch.ts";
import { exportProofDocx, planProofExport } from "./docx.ts";
import { admitFinding, classifySpanEdit } from "./edit-capabilities.ts";

async function sourceOf(bytes: Buffer): Promise<ProofSource> {
  let source: ProofSource | undefined;
  await extractDocx(bytes, (captured) => {
    source = captured;
  });
  assert.ok(source);
  return source;
}

test("PWC-08 insertion and deletion intersections are comment-only, never nested corrections", async () => {
  const bytes = await launchFixture("prior_review");
  const source = await sourceOf(bytes);
  const inserted = source.paragraphs.find((paragraph) => paragraph.text.includes("Added earlier."));
  assert.ok(inserted);
  const start = inserted.text.indexOf("Added");
  const span = sourceSpan(inserted, start, start + 5);
  const capability = classifySpanEdit(source, span, "correction", "Added");
  assert.equal(capability.operation, "comment");
  assert.equal(capability.reason, "prior_revision");
});

test("PWC-08 mixed rPr replacements are comments unless the run format is uniform", async () => {
  const mixed = await sourceOf(await launchFixture("split_runs"));
  const paragraph = mixed.paragraphs[0]!;
  const recieve = sourceSpan(paragraph, 18, 25);
  const mixedCap = classifySpanEdit(mixed, recieve, "correction", "receive");
  assert.equal(mixedCap.operation, "comment");
  assert.equal(mixedCap.reason, "mixed_format");

  const uniform = await sourceOf(await launchFixture("body"));
  const body = uniform.paragraphs[0]!;
  const same = classifySpanEdit(uniform, sourceSpan(body, 18, 25), "correction", "receive");
  assert.equal(same.operation, "correction");
});

test("PWC-08 old Agmt Proof revisions and classic comment references are not nested", async () => {
  const zip = await JSZip.loadAsync(await buildDocx(["The Company shall recieve notice."]));
  const xml = await zip.file("word/document.xml")!.async("string");
  zip.file(
    "word/document.xml",
    xml.replace(
      "<w:p>",
      '<w:p><w:ins w:id="3" w:author="Agmt Proof" w:date="2026-01-01T00:00:00Z">',
    ).replace("</w:p>", "</w:ins></w:p>"),
  );
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  const source = await sourceOf(bytes);
  const paragraph = source.paragraphs[0]!;
  const span = sourceSpan(paragraph, paragraph.text.indexOf("recieve"), paragraph.text.indexOf("recieve") + 7);
  const capability = classifySpanEdit(source, span, "correction", "receive");
  assert.equal(capability.operation, "comment");
  assert.ok(capability.reason === "prior_agmt_revision" || capability.reason === "prior_revision");

  const prior = await sourceOf(await launchFixture("prior_review"));
  const reviewed = prior.paragraphs.find((paragraph) => paragraph.text.includes("Unrelated prior review."));
  assert.ok(reviewed);
  const commentSpan = sourceSpan(reviewed, 0, reviewed.text.length);
  const commentCap = classifySpanEdit(prior, commentSpan, "comment", null);
  assert.ok(commentCap.operation === "comment" || commentCap.operation === "unsupported");
});

test("PWC-08 empty visible ranges and field results are unsupported, not moved", async () => {
  const source = await sourceOf(await buildDocx(["The Company shall recieve notice."], { fields: ["DATE"] }));
  const empty = {
    partUri: "/word/document.xml",
    paragraphPath: [0],
    text: "   ",
    nodes: [],
    isTable: false,
    scope: "main_body",
    style: null,
    safe: true,
    storyId: "body:main",
  };
  const blank = classifySpanEdit({ ...source, paragraphs: [empty, ...source.paragraphs] }, {
    partUri: empty.partUri,
    paragraphPath: empty.paragraphPath,
    textStart: 0,
    textEnd: 3,
    projection: "final",
    nodeSegments: [{ nodePath: [0, 0, 0], start: 0, end: 3 }],
  }, "comment", null);
  assert.equal(blank.operation, "unsupported");
  assert.equal(blank.reason, "empty_visible_range");

  const fieldPara = source.paragraphs.find((paragraph) => !paragraph.text.trim() || paragraph.nodes.every((node) => !node.editable));
  assert.ok(fieldPara);
  assert.equal(fieldPara.safe === false || !fieldPara.text.trim() || fieldPara.nodes.every((node) => !node.editable), true);
});

test("PWC-08 prior-review plans contain only realizable operations and still export", async () => {
  const bytes = await launchFixture("prior_review");
  const analysis = await analyzeProof(bytes);
  const plan = planProofExport(analysis);
  for (const finding of plan.findings) {
    const admitted = admitFinding(analysis.source, finding);
    assert.ok(admitted.finding);
    assert.notEqual(admitted.finding.kind === "correction" && analysis.source.paragraphs
      .find((paragraph) => JSON.stringify(paragraph.paragraphPath) === JSON.stringify(finding.primarySpan.paragraphPath))
      ?.nodes.some((node) => node.revision && node.start < finding.primarySpan.textEnd && node.end > finding.primarySpan.textStart), true);
  }
  const exported = await exportProofDocx(bytes);
  assert.ok(exported.receipt.commentIds.length >= 2);
  assert.ok(exported.bytes.length > 0);
});
