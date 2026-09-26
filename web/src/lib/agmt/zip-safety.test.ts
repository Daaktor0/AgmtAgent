import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  ZIP_LIMITS,
  ZIP_LIMITS_VERSION,
  ZipSafetyError,
  inspectZipCentralDirectory,
  verifyZipInflation,
} from "./zip-safety.ts";

function errorCode(code: string) {
  return (error: unknown) => error instanceof ZipSafetyError && error.code === code;
}

async function packageWith(mutate: (zip: JSZip) => void): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>", { date: new Date(0), createFolders: false });
  zip.file("word/document.xml", "<w:document/>", { date: new Date(0), createFolders: false });
  mutate(zip);
  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "STORE", streamFiles: false }));
}

test("PWC-04 ZIP limits match section 20 and are versioned", () => {
  assert.equal(ZIP_LIMITS_VERSION, "proof-zip-limits-v1");
  assert.equal(ZIP_LIMITS.MAX_SOURCE_BYTES, 25 * 1024 * 1024);
  assert.equal(ZIP_LIMITS.MAX_OUTPUT_BYTES, 35 * 1024 * 1024);
  assert.equal(ZIP_LIMITS.MAX_ENTRIES, 2000);
  assert.equal(ZIP_LIMITS.MAX_EXPANDED_BYTES, 100 * 1024 * 1024);
  assert.equal(ZIP_LIMITS.MAX_ENTRY_BYTES, 32 * 1024 * 1024);
  assert.equal(ZIP_LIMITS.MAX_COMPRESSION_RATIO, 100);
  assert.equal(ZIP_LIMITS.MAX_PATH_DEPTH, 128);
});

test("PWC-04 inspects the central directory before inflation and rejects bombs", async () => {
  const bytes = await packageWith(() => undefined);
  const directory = inspectZipCentralDirectory(bytes);
  const verified = verifyZipInflation(bytes, directory);
  assert.equal(verified.actualExpandedBytes, directory.entries.filter((entry) => !entry.isDirectory).reduce((sum, entry) => sum + entry.uncompressedSize, 0));

  const bomb = Buffer.from(bytes);
  const view = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength);
  for (let offset = bomb.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 24, ZIP_LIMITS.MAX_ENTRY_BYTES + 1, true);
      break;
    }
  }
  assert.throws(() => inspectZipCentralDirectory(bomb), errorCode("package_entry_too_large"));
});

test("PWC-04 rejects duplicate and case-colliding paths, ZIP64 and deep paths", async () => {
  const colliding = await packageWith((zip) => {
    zip.file("word/Document.xml", "<w:document/>", { date: new Date(0), createFolders: false });
  });
  assert.throws(() => inspectZipCentralDirectory(colliding), errorCode("duplicate_package_path"));

  const deep = await packageWith((zip) => {
    zip.file(`${"a/".repeat(ZIP_LIMITS.MAX_PATH_DEPTH + 1)}x.xml`, "<x/>", { date: new Date(0), createFolders: false });
  });
  assert.throws(() => inspectZipCentralDirectory(deep), errorCode("package_too_complex"));

  const zip64 = Buffer.from(await packageWith(() => undefined));
  const view = new DataView(zip64.buffer, zip64.byteOffset, zip64.byteLength);
  for (let offset = zip64.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      view.setUint32(offset + 16, 0xffffffff, true);
      break;
    }
  }
  assert.throws(() => inspectZipCentralDirectory(zip64), errorCode("zip64_unsupported"));
});

test("PWC-04 aborts when inflated bytes disagree with declared sizes or CRC", async () => {
  const bytes = await packageWith(() => undefined);
  const forgedCrc = Buffer.from(bytes);
  const view = new DataView(forgedCrc.buffer, forgedCrc.byteOffset, forgedCrc.byteLength);
  for (let offset = 0; offset + 46 < forgedCrc.byteLength; offset += 1) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 16, view.getUint32(offset + 16, true) ^ 0xffffffff, true);
      break;
    }
  }
  const directory = inspectZipCentralDirectory(forgedCrc);
  assert.throws(() => verifyZipInflation(forgedCrc, directory), errorCode("zip_crc_mismatch"));

  const forgedLocal = Buffer.from(bytes);
  const localView = new DataView(forgedLocal.buffer, forgedLocal.byteOffset, forgedLocal.byteLength);
  for (let offset = 0; offset + 30 < forgedLocal.byteLength; offset += 1) {
    if (localView.getUint32(offset, true) === 0x04034b50) {
      const declared = localView.getUint32(offset + 22, true);
      if (declared > 0) {
        localView.setUint32(offset + 22, declared + 1, true);
        break;
      }
    }
  }
  assert.throws(() => inspectZipCentralDirectory(forgedLocal), errorCode("zip_local_header_mismatch"));
});

test("PWC-04 rejects malformed local offsets", async () => {
  const bytes = await packageWith(() => undefined);
  const forged = Buffer.from(bytes);
  const view = new DataView(forged.buffer, forged.byteOffset, forged.byteLength);
  for (let offset = 0; offset + 46 < forged.byteLength; offset += 1) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 42, 0xffffff00, true);
      break;
    }
  }
  assert.throws(() => inspectZipCentralDirectory(forged), errorCode("zip_local_header_invalid"));
});
