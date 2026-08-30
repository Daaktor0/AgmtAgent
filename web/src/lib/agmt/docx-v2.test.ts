import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { extractDocx } from "./docx-v2.ts";
import { ZipSafetyError, ZIP_LIMITS, inspectZipCentralDirectory } from "./zip-safety.ts";

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

async function richDocx(
  documentXml: string,
  relationshipTarget = "https://example.test",
  relationshipTargetMode = "External",
): Promise<Buffer> {
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
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdHyperlink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${relationshipTarget}" TargetMode="${relationshipTargetMode}"/>
</Relationships>`,
  );
  zip.file(
    "word/footnotes.xml",
    `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="1">${p("Footnote text")}</w:footnote></w:footnotes>`,
  );
  zip.file(
    "word/endnotes.xml",
    `<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:endnote w:id="2">${p("Endnote text")}</w:endnote></w:endnotes>`,
  );
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

const OPEN = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`;
const CLOSE = `<w:sectPr/></w:body></w:document>`;
function mutateZipEntry(
  bytes: Buffer,
  name: string,
  mutation: (archive: Buffer, kind: "local" | "central", offset: number) => void,
): Buffer {
  const archive = Buffer.from(bytes);
  const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let centralOffset = -1;
  let localOffset = -1;
  for (let offset = 0; (offset = archive.indexOf(centralSignature, offset)) >= 0; offset += 4) {
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const entryName = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (entryName === name) {
      centralOffset = offset;
      localOffset = archive.readUInt32LE(offset + 42);
      mutation(archive, "central", centralOffset);
      break;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  const localSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  assert.equal(centralOffset >= 0, true, "fixture central entry was not found");
  assert.equal(localOffset >= 0 && archive.subarray(localOffset, localOffset + 4).equals(localSignature), true, "fixture local entry was not found");
  mutation(archive, "local", localOffset);
  return archive;
}
function renameZipEntry(bytes: Buffer, oldName: string, newName: string): Buffer {
  assert.equal(Buffer.byteLength(oldName), Buffer.byteLength(newName));
  return mutateZipEntry(bytes, oldName, (archive, kind, offset) => {
    const nameOffset = kind === "local" ? offset + 30 : offset + 46;
    Buffer.from(newName).copy(archive, nameOffset);
  });
}

function errorCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof ZipSafetyError && error.code === code;
}


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


test("WRK-02 rejects central-directory expansion claims before ZIP extraction", async () => {
  const bytes = await docx(`${OPEN}${p("small")}${CLOSE}`);
  const bomb = mutateZipEntry(bytes, "word/document.xml", (archive, kind, offset) => {
    if (kind === "central") archive.writeUInt32LE(ZIP_LIMITS.MAX_ENTRY_BYTES + 1, offset + 24);
  });
  assert.throws(() => inspectZipCentralDirectory(bomb), errorCode("package_entry_too_large"));
});

test("WRK-02 rejects traversal names before OOXML parsing", async () => {
  const bytes = await docx(`${OPEN}${p("small")}${CLOSE}`);
  const traversal = renameZipEntry(bytes, "[Content_Types].xml", "../evil/12345678901");
  await assert.rejects(() => extractDocx(traversal), errorCode("unsafe_package_path"));
});

test("WRK-02 rejects unsupported compression methods from central and local headers", async () => {
  const bytes = await docx(`${OPEN}${p("small")}${CLOSE}`);
  const unsupported = mutateZipEntry(bytes, "word/document.xml", (archive, kind, offset) => {
    archive.writeUInt16LE(99, offset + (kind === "local" ? 8 : 10));
  });
  assert.throws(() => inspectZipCentralDirectory(unsupported), errorCode("unsupported_compression"));
});


test("WRK-03 inventories relationships, notes, bookmarks and sections", async () => {
  const bytes = await richDocx(
    `${OPEN}<w:p><w:bookmarkStart w:id="1" w:name="DefinedTerm"/><w:r><w:t>Body</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>${CLOSE}`,
  );
  const extracted = await extractDocx(bytes);
  const inventory = extracted as typeof extracted & {
    bookmarks?: Array<{ id: string; name: string }>;
    notes?: Array<{ type: "footnote" | "endnote"; id: string; text: string }>;
    relationships?: Array<{ source: string; target: string; external: boolean }>;
    sectionCount?: number;
  };
  const states = new Map(extracted.capabilities.map((capability) => [capability.name, capability.state]));
  assert.equal(states.get("content_types"), "evaluated_present");
  assert.equal(states.get("relationships"), "evaluated_present");
  assert.equal(states.get("external_relationships"), "evaluated_present");
  assert.equal(states.get("footnotes"), "evaluated_present");
  assert.equal(states.get("endnotes"), "evaluated_present");
  assert.equal(states.get("bookmarks"), "evaluated_present");
  assert.equal(states.get("sections"), "evaluated_present");
  assert.deepEqual(inventory.notes, [
    { type: "footnote", id: "1", text: "Footnote text" },
    { type: "endnote", id: "2", text: "Endnote text" },
  ]);
  assert.deepEqual(inventory.bookmarks, [{ id: "1", name: "DefinedTerm" }]);
  assert.equal(inventory.sectionCount, 1);
  assert.equal(inventory.relationships?.some((relationship) => relationship.external && relationship.target === "https://example.test"), true);
});

test("WRK-03 rejects internal relationship traversal instead of resolving outside the package", async () => {
  const bytes = await richDocx(`${OPEN}${p("Body")}${CLOSE}`, "../outside.xml", "");
  await assert.rejects(
    () => extractDocx(bytes),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "unsafe_relationship_target",
  );
});
