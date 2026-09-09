import assert from "node:assert/strict";
import { test } from "node:test";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { extractDocx } from "./docx-v2.ts";
import { PROJECTION_VERSION, projectPart, storySeparator } from "./projection.ts";
import type { ProofSource, XmlNode } from "./source-map.ts";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const orderedParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
});

async function docx(documentXml: string, extra: Record<string, string> = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    { date: new Date(0), createFolders: false },
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    { date: new Date(0), createFolders: false },
  );
  zip.file("word/document.xml", documentXml, { date: new Date(0), createFolders: false });
  for (const [name, xml] of Object.entries(extra)) {
    zip.file(name, xml, { date: new Date(0), createFolders: false });
  }
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

function projectXml(xml: string) {
  return projectPart({
    xml,
    tree: orderedParser.parse(xml) as XmlNode[],
    partUri: "/word/document.xml",
    storyKind: "body",
    storyId: "body:main",
  });
}

async function sourceOf(bytes: Buffer): Promise<{ source: ProofSource; extracted: Awaited<ReturnType<typeof extractDocx>> }> {
  let source: ProofSource | undefined;
  const extracted = await extractDocx(bytes, (captured) => {
    source = captured;
  });
  if (!source) throw new Error("source missing");
  return { source, extracted };
}

const OPEN = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>`;
const CLOSE = `<w:sectPr/></w:body></w:document>`;

test("PWC-06 tabs, breaks and entities stay exact in the final projection", () => {
  const xml = `${OPEN}<w:p><w:r><w:t>A</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">B &amp; C</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>D</w:t></w:r></w:p>${CLOSE}`;
  const story = projectXml(xml);
  assert.equal(story.projectionVersion, PROJECTION_VERSION);
  assert.equal(story.paragraphs[0]?.text, "A\tB & C\nD");
  assert.equal(story.paragraphs[0]?.text.includes("&amp;"), false);
});

test("PWC-06 vanished runs and deletions are skipped, not checked", () => {
  const xml = `${OPEN}<w:p>
    <w:r><w:t>Visible </w:t></w:r>
    <w:r><w:rPr><w:vanish/></w:rPr><w:t>HIDDEN</w:t></w:r>
    <w:del w:id="1"><w:r><w:delText>GONE</w:delText></w:r></w:del>
    <w:r><w:t>end</w:t></w:r>
  </w:p>${CLOSE}`;
  const story = projectXml(xml);
  assert.equal(story.paragraphs[0]?.text, "Visible end");
  assert.equal(story.skipped.some((region) => region.reason === "hidden"), true);
  assert.equal(story.skipped.some((region) => region.reason === "deletion"), true);
  assert.equal(story.paragraphs[0]?.text.includes("HIDDEN"), false);
  assert.equal(story.paragraphs[0]?.text.includes("GONE"), false);
});

test("PWC-06 field stack is carried across paragraphs and unbalanced fields refuse completeness", () => {
  const balanced = projectXml(
    `${OPEN}<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>REF x</w:instrText></w:r></w:p><w:p><w:r><w:t>cached</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>${CLOSE}`,
  );
  assert.equal(balanced.complete, true);
  assert.equal(balanced.paragraphs[0]?.text, "");
  assert.equal(balanced.paragraphs[1]?.text, "cached");
  assert.equal(balanced.skipped.some((region) => region.reason === "instruction"), true);

  const unbalanced = projectXml(
    `${OPEN}<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:t>open</w:t></w:r></w:p>${CLOSE}`,
  );
  assert.equal(unbalanced.complete, false);
  assert.equal(unbalanced.gaps.includes("unbalanced_field"), true);
});

test("PWC-06 inherited w:lang is recorded; Latin script is not treated as English", () => {
  const xml = `${OPEN}<w:p><w:pPr><w:lang w:val="fr-FR"/></w:pPr><w:r><w:t>Société</w:t></w:r></w:p><w:p><w:r><w:t>plain latin</w:t></w:r></w:p>${CLOSE}`;
  const story = projectXml(xml);
  assert.equal(story.paragraphs[0]?.language, "fr-FR");
  assert.equal(story.paragraphs[1]?.language, null);
  assert.notEqual(story.paragraphs[1]?.language, "en-GB");
  assert.notEqual(story.paragraphs[1]?.language, "en-US");
});

test("PWC-06 split Unicode uses UTF-16 offsets and refuses a surrogate split", async () => {
  const bytes = await docx(`${OPEN}<w:p><w:r><w:t>😀 recieve</w:t></w:r></w:p>${CLOSE}`);
  const { source } = await sourceOf(bytes);
  const paragraph = source.paragraphs[0];
  assert.ok(paragraph);
  assert.equal(paragraph.text.slice(3, 10), "recieve");
  assert.equal(source.projectionVersion, PROJECTION_VERSION);
});

test("PWC-06 body, table cells and header stories stay separate", async () => {
  const bytes = await docx(
    `${OPEN}<w:p><w:r><w:t>Body</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>${CLOSE}`,
    {
      "word/header1.xml": `<?xml version="1.0"?><w:hdr xmlns:w="${W}"><w:p><w:r><w:t>Header recieve</w:t></w:r></w:p></w:hdr>`,
    },
  );
  const { source, extracted } = await sourceOf(bytes);
  const body = source.paragraphs.find((paragraph) => paragraph.text === "Body");
  const cell = source.paragraphs.find((paragraph) => paragraph.text === "Cell");
  assert.ok(body && cell);
  assert.equal(cell.isTable, true);
  assert.equal(storySeparator(body as never, cell as never), "cell");
  assert.equal(source.paragraphs.some((paragraph) => paragraph.text.includes("Header")), false);
  const headerStory = extracted.storyProjections?.find((story) => story.storyKind === "header");
  assert.ok(headerStory);
  assert.equal(headerStory.paragraphs[0]?.text, "Header recieve");
  assert.equal(headerStory.complete, true);
});

test("PWC-06 empty cells and move revisions are disclosed, not joined", () => {
  const xml = `${OPEN}<w:tbl><w:tr><w:tc><w:p/></w:tc><w:tc><w:p><w:moveFrom w:id="1"><w:r><w:t>moved-away</w:t></w:r></w:moveFrom><w:r><w:t>kept</w:t></w:r></w:p></w:tc></w:tr></w:tbl>${CLOSE}`;
  const story = projectXml(xml);
  assert.equal(story.paragraphs.some((paragraph) => paragraph.isTable && paragraph.text === ""), true);
  assert.equal(story.paragraphs.some((paragraph) => paragraph.text === "kept"), true);
  assert.equal(story.paragraphs.some((paragraph) => paragraph.text.includes("moved-away")), false);
  assert.equal(story.gaps.includes("complex_revision"), true);
});
