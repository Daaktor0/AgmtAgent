import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { DocxPackage } from "./docx-package.ts";
import { extractDocx } from "./docx-v2.ts";
import { exportProofDocx } from "./export/docx.ts";
import { analyzeProof } from "./proof/launch.ts";
import { processProofLocal } from "../proof-local/pipeline.ts";
import {
  BODY_CLEAN,
  FOOTNOTE_TYPO,
  HEADER_TYPO_SENTENCE,
  emptyHeaderDocx,
  footnoteSeparatorDocx,
  headerCleanDocx,
  headerTypoDocx,
  sharedHeaderDocx,
} from "./corpus/pwc/story-fixtures.ts";
import { mapDocumentStories, STORY_EXPORT_POLICY, STORY_MAP_VERSION } from "./story-map.ts";
import type { ProofSource } from "./source-map.ts";

async function sourceOf(bytes: Buffer): Promise<ProofSource> {
  let source: ProofSource | undefined;
  await extractDocx(bytes, (captured) => {
    source = captured;
  });
  assert.ok(source);
  return source;
}

test("PWC-38 maps unique header parts, linked sections, note separators and empty stories", async () => {
  const headerBytes = await sharedHeaderDocx();
  const headerSource = await sourceOf(headerBytes);
  const headerMap = mapDocumentStories(DocxPackage.open(headerBytes, { verify: false }), headerSource);
  assert.equal(headerMap.version, STORY_MAP_VERSION);
  const headers = headerMap.stories.filter((story) => story.storyKind === "header");
  assert.equal(headers.length, 1);
  assert.equal(headers[0]?.partUri, "/word/header1.xml");
  assert.equal(headers[0]?.linked, true);
  assert.ok(headers[0]?.sectionTypes.includes("default"));
  assert.ok(headers[0]?.sectionTypes.includes("even"));
  assert.equal(headers[0]?.paragraphs.some((paragraph) => paragraph.text === HEADER_TYPO_SENTENCE), true);
  assert.equal(headerSource.paragraphs.some((paragraph) => paragraph.text.includes("recieve")), false);

  const notesBytes = await footnoteSeparatorDocx();
  const notesSource = await sourceOf(notesBytes);
  const notesMap = mapDocumentStories(DocxPackage.open(notesBytes, { verify: false }), notesSource);
  const notes = notesMap.stories.filter((story) => story.storyKind === "footnote");
  assert.ok(notes.some((story) => story.separator && (story.noteId === "-1" || story.noteId === "0")));
  assert.ok(notes.some((story) => story.noteId === "1" && !story.separator));
  assert.equal(notes.filter((story) => story.noteId === "1").length, 1);
  const content = notes.find((story) => story.noteId === "1");
  assert.equal(content?.lexical, false);
  assert.equal(content?.paragraphs.some((paragraph) => paragraph.text === FOOTNOTE_TYPO), true);

  const empty = await emptyHeaderDocx();
  const emptyMap = mapDocumentStories(DocxPackage.open(empty, { verify: false }), await sourceOf(empty));
  const emptyHeader = emptyMap.stories.find((story) => story.storyKind === "header");
  assert.ok(emptyHeader);
  assert.equal(emptyHeader.paragraphs.every((paragraph) => !paragraph.text.trim()) || emptyHeader.paragraphs.length <= 1, true);
});

test("PWC-38 header typo is corrected in the header part and never moved into the body", async () => {
  const bytes = await headerTypoDocx();
  const analysis = await analyzeProof(bytes);
  const hits = analysis.plan.findings.filter((finding) => finding.exactQuote === "recieve");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.kind, "correction");
  assert.equal(hits[0]?.primarySpan.partUri, "/word/header1.xml");
  assert.equal(analysis.source.paragraphs.some((paragraph) => paragraph.text.includes("recieve")), false);
  assert.ok(analysis.gaps.includes("header_comments_unanchorable") || analysis.gaps.includes("footers_not_checked") || analysis.coverage === "limited");

  const exported = await exportProofDocx(bytes, new Date("2026-09-11T00:00:00Z"), { analysis });
  const zip = await JSZip.loadAsync(exported.bytes);
  const headerXml = await zip.file("word/header1.xml")!.async("string");
  const documentXml = await zip.file("word/document.xml")!.async("string");
  assert.match(headerXml, /<w:del\b/);
  assert.match(headerXml, /recieve/);
  assert.doesNotMatch(documentXml, /<w:del\b/);
  assert.match(documentXml, new RegExp(BODY_CLEAN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(exported.receipt.modifiedParts.includes("word/header1.xml"), true);
  assert.equal(exported.receipt.modifiedParts.includes("word/document.xml"), true);
});

test("PWC-38 footnote typos stay unpublished and are not relocated", async () => {
  const bytes = await footnoteSeparatorDocx();
  const analysis = await analyzeProof(bytes);
  assert.equal(analysis.plan.findings.some((finding) => finding.exactQuote === "recieve"), false);
  assert.ok(analysis.gaps.includes("notes_not_checked"));
  const exported = await exportProofDocx(bytes, new Date("2026-09-11T00:00:00Z"), { analysis });
  const zip = await JSZip.loadAsync(exported.bytes);
  const notes = await zip.file("word/footnotes.xml")!.async("string");
  assert.match(notes, /recieve/);
  assert.doesNotMatch(notes, /<w:commentRangeStart\b/);
});

test("PWC-38 browser pipeline keeps a clean header unmarked and a dirty header corrected", async () => {
  const dirty = await processProofLocal(new Uint8Array(await headerTypoDocx()));
  assert.ok(dirty.findings.some((finding) => finding.quote === "recieve" && finding.kind === "correction"));
  const headerXml = await (await JSZip.loadAsync(dirty.output)).file("word/header1.xml")!.async("string");
  assert.match(headerXml, /<w:ins\b/);

  const clean = await processProofLocal(new Uint8Array(await headerCleanDocx()));
  assert.equal(clean.findings.some((finding) => /recieve|receive/.test(finding.quote) && finding.kind === "correction"), false);
});

test("PWC-38 header comments remain unanchorable until Word validates them", () => {
  assert.equal(STORY_EXPORT_POLICY.header.comment, false);
  assert.equal(STORY_EXPORT_POLICY.header.correction, true);
  assert.equal(STORY_EXPORT_POLICY.footer.lexical, false);
  assert.equal(STORY_EXPORT_POLICY.footnote.lexical, false);
});
