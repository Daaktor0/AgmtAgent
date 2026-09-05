import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { buildDocx } from "../agmt/docx.ts";
import { scanProofDocx } from "./proof-scan.ts";

test("Proof structural scan accepts a native DOCX", async () => {
  await assert.doesNotReject(async () => scanProofDocx(await buildDocx(["A short agreement."])));
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
