import assert from "node:assert/strict";
import test from "node:test";
import { createNumberingResolver } from "./numbering.ts";
import { buildProvisionTree } from "./provision-tree.ts";
import type { ExtractedBlock, ExtractedDocument } from "./types.ts";

const numberingXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl>
    <w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="(%3)"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="ordinal"/><w:lvlText w:val="%1"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="7"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="8"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride></w:num>
  <w:num w:numId="9"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="ClauseHeading">
    <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr>
  </w:style>
</w:styles>`;

test("resolves multilevel legal numbering in document order", () => {
  const resolver = createNumberingResolver(numberingXml, stylesXml);
  assert.equal(resolver.resolve({ numId: "7", level: 0 })?.label, "1.");
  assert.equal(resolver.resolve({ numId: "7", level: 1 })?.label, "1.1");
  assert.equal(resolver.resolve({ numId: "7", level: 1 })?.label, "1.2");
  assert.equal(resolver.resolve({ numId: "7", level: 2 })?.label, "(a)");
  assert.equal(resolver.resolve({ numId: "7", level: 0 })?.label, "2.");
  assert.equal(resolver.resolve({ numId: "7", level: 1 })?.label, "2.1");
});

test("honours numbering instance start overrides", () => {
  const resolver = createNumberingResolver(numberingXml, stylesXml);
  assert.equal(resolver.resolve({ numId: "8", level: 0 })?.label, "5.");
  assert.equal(resolver.resolve({ numId: "8", level: 0 })?.label, "6.");
});

test("resolves style-linked numbering", () => {
  const resolver = createNumberingResolver(numberingXml, stylesXml);
  const resolved = resolver.resolve({ numId: null, level: null, styleId: "ClauseHeading" });
  assert.equal(resolved?.label, "1.");
  assert.equal(resolved?.numId, "7");
  assert.equal(resolved?.level, 0);
});

test("marks unsupported Word formats instead of pretending exact support", () => {
  const resolver = createNumberingResolver(numberingXml, stylesXml);
  const resolved = resolver.resolve({ numId: "9", level: 0 });
  assert.equal(resolved?.supported, false);
  assert.equal(resolver.unsupportedFormats.has("ordinal"), true);
});

function block(
  index: number,
  text: string,
  numbering: string,
  level: number,
): ExtractedBlock {
  return {
    index,
    text,
    xmlAnchor: { kind: "paragraph", path: `/w:document/w:body/w:p[${index}]` },
    styleId: null,
    numbering,
    numberingNumId: "7",
    numberingLevel: level,
    numberingFormat: "decimal",
    isTable: false,
    isHeaderFooter: false,
    pageBreakBefore: false,
    sourceStart: index * 100,
    sourceEnd: index * 100 + text.length,
  };
}

function extracted(blocks: ExtractedBlock[]): ExtractedDocument {
  return {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    wordCount: 12,
    nonWhitespaceChars: blocks.reduce((sum, item) => sum + item.text.replace(/\s/g, "").length, 0),
    explicitPageBreaks: 0,
    appPages: null,
    pageCount: 1,
    pageCountMethod: "estimated",
    blocks,
    comments: [],
    fields: [],
    revisions: [],
    headersFooters: [],
    hiddenChars: [],
    capabilities: [
      {
        name: "numbering",
        available: true,
        state: "evaluated_present",
        detectorVersion: "word-numbering-v1",
        suppressionReason: null,
      },
    ],
    sourceQualityHint: "ok",
  };
}

test("resolved numbering becomes legal clause structure without losing definition scope", () => {
  const tree = buildProvisionTree(
    extracted([
      block(0, "Definitions", "1", 0),
      block(1, '"Affiliate" means any controlled entity.', "1.1", 1),
      block(2, "Obligations", "2", 0),
    ]),
  );

  const definitions = tree.find((node) => node.blockIndex === 0);
  const affiliate = tree.find((node) => node.blockIndex === 1);
  const obligations = tree.find((node) => node.blockIndex === 2);

  assert.equal(definitions?.nodeType, "clause");
  assert.equal(definitions?.number, "1");
  assert.equal(definitions?.scopeType, "definitions");
  assert.equal(affiliate?.nodeType, "definition_entry");
  assert.equal(affiliate?.number, "1.1");
  assert.equal(affiliate?.scopeType, "definitions");
  assert.equal(obligations?.nodeType, "clause");
  assert.equal(obligations?.number, "2");
  assert.equal(obligations?.scopeType, "main_body");
});
