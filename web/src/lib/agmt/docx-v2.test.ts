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

const OPEN = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`;
const CLOSE = `<w:sectPr/></w:body></w:document>`;
function mutateZipEntry(
  bytes: Buffer,
  name: string,
  mutation: (archive: Buffer, kind: "local" | "central", offset: number) => void,
): Buffer {
  const archive = Buffer.from(bytes);
  const signature = Buffer.from("PK\x03\x04", "binary");
  const centralSignature = Buffer.from("PK\x01\x02", "binary");
  let localFound = false;
  let centralFound = false;
  for (let offset = 0; (offset = archive.indexOf(signature, offset)) >= 0; offset += 4) {
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const entryName = archive.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    if (entryName === name) {
      mutation(archive, "local", offset);
      localFound = true;
      break;
    }
    offset += 30 + nameLength + extraLength;
  }
  for (let offset = 0; (offset = archive.indexOf(centralSignature, offset)) >= 0; offset += 4) {
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const entryName = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (entryName === name) {
      mutation(archive, "central", offset);
      centralFound = true;
      break;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(localFound, true, "fixture local entry was not found");
  assert.equal(centralFound, true, "fixture central entry was not found");
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
  return error instanceof ZipSafetyError && error.code === code;
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
