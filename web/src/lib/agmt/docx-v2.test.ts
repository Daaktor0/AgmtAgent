import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { extractDocx } from "./docx-v2.ts";

async function docx(documentXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file("word/document.xml", documentXml);
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

const OPEN = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`;
const CLOSE = `<w:sectPr/></w:body></w:document>`;

function p(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

test("body paragraphs and table cells remain in Word source order", async () => {
  const bytes = await docx(
    `${OPEN}${p("Before")}` +
      `<w:tbl><w:tr><w:tc>${p("Inside table")}</w:tc></w:tr></w:tbl>` +
      `${p("After")}${CLOSE}`,
  );
  const extracted = await extractDocx(bytes);
  assert.deepEqual(
    extracted.blocks.filter((block) => !block.isHeaderFooter).map((block) => block.text),
    ["Before", "Inside table", "After"],
  );
  assert.equal(extracted.blocks[1]?.isTable, true);
});

test("visible text is the accepted/final revision view", async () => {
  const bytes = await docx(
    `${OPEN}<w:p>` +
      `<w:r><w:t>Live </w:t></w:r>` +
      `<w:del w:id="1"><w:r><w:delText>OLD</w:delText></w:r></w:del>` +
      `<w:ins w:id="2"><w:r><w:t>NEW</w:t></w:r></w:ins>` +
      `</w:p>${CLOSE}`,
  );
  const extracted = await extractDocx(bytes);
  assert.equal(extracted.blocks[0]?.text, "Live NEW");
  assert.equal(extracted.blocks[0]?.text.includes("OLD"), false);
  assert.deepEqual(
    extracted.revisions.map((revision) => [revision.type, revision.text]),
    [
      ["ins", "NEW"],
      ["del", "OLD"],
    ],
  );
});

test("feature absence is recorded as evaluated absence", async () => {
  const bytes = await docx(`${OPEN}${p("Clean")}${CLOSE}`);
  const extracted = await extractDocx(bytes);
  assert.equal(extracted.capabilities.find((capability) => capability.name === "comments")?.state, "evaluated_absent");
  assert.equal(extracted.capabilities.find((capability) => capability.name === "revisions")?.state, "evaluated_absent");
});
