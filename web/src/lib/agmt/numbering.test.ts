import assert from "node:assert/strict";
import test from "node:test";
import { createNumberingResolver } from "./numbering.ts";

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
