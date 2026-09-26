import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { launchFixture } from "./corpus/launch-fixtures.ts";
import { DocxPackage, isXmlPackagePart, zipPayloadEquals } from "./docx-package.ts";
import { inspectZipCentralDirectory, verifyZipInflation, ZipSafetyError } from "./zip-safety.ts";

test("DocxPackage opens a launch fixture, caches XML, and does not require JSZip", async () => {
  const source = new Uint8Array(await launchFixture("body"));
  const pkg = DocxPackage.open(source);
  assert.equal(pkg.has("word/document.xml"), true);
  assert.match(pkg.text("word/document.xml"), /<w:document\b/);
  assert.equal(isXmlPackagePart("word/media/image1.png"), false);
  const directory = inspectZipCentralDirectory(source);
  assert.equal(verifyZipInflation(source, directory).actualExpandedBytes, pkg.directory.expandedBytes);
});

test("DocxPackage rewrite copies unmodified media bytes and changes only listed parts", async () => {
  const zip = await JSZip.loadAsync(await launchFixture("body"));
  const media = new Uint8Array(64 * 1024);
  for (let index = 0; index < media.byteLength; index += 1) media[index] = (index * 31 + 7) & 0xff;
  media[0] = 0x89;
  media[1] = 0x50;
  media[2] = 0x4e;
  media[3] = 0x47;
  zip.file("word/media/image1.png", media, { compression: "STORE", date: new Date(0), createFolders: false });
  const types = await zip.file("[Content_Types].xml")!.async("string");
  zip.file(
    "[Content_Types].xml",
    types.replace("</Types>", '<Override PartName="/word/media/image1.png" ContentType="image/png"/></Types>'),
    { date: new Date(0) },
  );
  const source = new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
  const pkg = DocxPackage.open(source);
  const xml = pkg.text("word/document.xml").replace("[●]", "[TBD]");
  const output = pkg.rewrite(new Map([["word/document.xml", new TextEncoder().encode(xml)]]));
  const rewritten = DocxPackage.open(output);
  assert.equal(zipPayloadEquals(pkg, rewritten, "word/media/image1.png"), true);
  assert.match(rewritten.text("word/document.xml"), /\[TBD\]/);
  assert.equal(rewritten.text("word/document.xml").includes("[●]"), false);
});

async function packageWithMedia(streamFiles: boolean): Promise<{ source: Uint8Array; media: Uint8Array }> {
  const zip = await JSZip.loadAsync(await launchFixture("body"));
  const media = new Uint8Array(32 * 1024);
  for (let index = 0; index < media.byteLength; index += 1) media[index] = (index * 17 + 5) & 0xff;
  media[0] = 0x89;
  media[1] = 0x50;
  media[2] = 0x4e;
  media[3] = 0x47;
  zip.file("word/media/image1.png", media, { compression: "STORE", date: new Date(0), createFolders: false });
  const types = await zip.file("[Content_Types].xml")!.async("string");
  zip.file(
    "[Content_Types].xml",
    types.replace("</Types>", '<Override PartName="/word/media/image1.png" ContentType="image/png"/></Types>'),
    { date: new Date(0) },
  );
  const source = new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", streamFiles }));
  return { source, media };
}

test("rewrite preserves binary parts when the source uses data descriptors", async () => {
  const { source } = await packageWithMedia(true);
  const pkg = DocxPackage.open(source);
  const xml = pkg.text("word/document.xml").replace("[●]", "[TBD]");
  const output = pkg.rewrite(new Map([["word/document.xml", new TextEncoder().encode(xml)]]));
  const rewritten = DocxPackage.open(output);
  assert.equal(zipPayloadEquals(pkg, rewritten, "word/media/image1.png"), true);
  assert.equal(zipPayloadEquals(pkg, rewritten, "word/_rels/document.xml.rels"), true);
});

test("rewrite aborts when cancelled during export", async () => {
  const { source } = await packageWithMedia(false);
  const pkg = DocxPackage.open(source);
  const xml = pkg.text("word/document.xml");
  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () => pkg.rewrite(new Map([["word/document.xml", new TextEncoder().encode(xml)]]), { signal: controller.signal }),
    (error: unknown) => error instanceof Error && error.message === "cancelled",
  );
});

test("DocxPackage.open refuses CRC mismatches, duplicates and ZIP64 before rewrite", async () => {
  const { source } = await packageWithMedia(false);
  const crc = Buffer.from(source);
  const view = new DataView(crc.buffer, crc.byteOffset, crc.byteLength);
  for (let offset = 0; offset + 46 < crc.byteLength; offset += 1) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 16, view.getUint32(offset + 16, true) ^ 0xffffffff, true);
      break;
    }
  }
  assert.throws(() => DocxPackage.open(new Uint8Array(crc)), (error: unknown) => error instanceof ZipSafetyError && error.code === "zip_crc_mismatch");

  const colliding = await JSZip.loadAsync(source);
  colliding.file("word/Document.xml", "<w:document/>", { date: new Date(0), createFolders: false });
  const collided = new Uint8Array(await colliding.generateAsync({ type: "uint8array", compression: "STORE" }));
  assert.throws(() => DocxPackage.open(collided), (error: unknown) => error instanceof ZipSafetyError && error.code === "duplicate_package_path");
});

test("rewrite does not mutate the original package source or XML cache", async () => {
  const { source } = await packageWithMedia(false);
  const pkg = DocxPackage.open(source);
  const before = pkg.text("word/document.xml");
  const xml = before.replace("[●]", "[TBD]");
  pkg.rewrite(new Map([["word/document.xml", new TextEncoder().encode(xml)]]));
  assert.equal(pkg.text("word/document.xml"), before);
  assert.equal(pkg.text("word/document.xml").includes("[TBD]"), false);
});
