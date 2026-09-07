import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import JSZip from "jszip";
import { buildDocx } from "../agmt/docx.ts";
import { scanProofDocx } from "./proof-scan.ts";

test("Proof structural scan accepts a native DOCX", async () => {
  await assert.doesNotReject(async () => scanProofDocx(await buildDocx(["A short agreement."])));
});

test("PWC-04 structural scan inspects the central directory before JSZip and does not use private _data", async () => {
  const source = await readFile(new URL("./proof-scan.ts", import.meta.url), "utf8");
  assert.match(source, /inspectZipCentralDirectory/);
  assert.match(source, /verifyZipInflation/);
  assert.doesNotMatch(source, /_data/);
  assert.doesNotMatch(source, /JSZip\.loadAsync/);
  assert.doesNotMatch(source, /extractDocx/);
});

test("Proof structural scan rejects invalid, macro and external-content packages", async () => {
  await assert.rejects(() => scanProofDocx(Buffer.from("not a docx")), /invalid_docx_zip/);
  const source = await buildDocx(["A short agreement."]);
  const macroZip = await JSZip.loadAsync(source);
  macroZip.file("word/vbaProject.bin", Buffer.from("macro"));
  await assert.rejects(async () => scanProofDocx(Buffer.from(await macroZip.generateAsync({ type: "nodebuffer" }))), /active_content_not_supported/);
  const externalZip = await JSZip.loadAsync(source);
  externalZip.file("word/_rels/document.xml.rels", '<Relationships><Relationship Target="https://example.test" TargetMode="External"/></Relationships>');
  await assert.rejects(async () => scanProofDocx(Buffer.from(await externalZip.generateAsync({ type: "nodebuffer" }))), /external_content_not_supported/);
});
