import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { LAUNCH_FIXTURES, launchFixture } from "../src/lib/agmt/corpus/launch-fixtures.ts";
import { PROOF_LOCAL_MAX_SOURCE_BYTES } from "../src/lib/proof-local/limits.ts";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: write-proof-production-fixtures.ts <dir>");
mkdirSync(outDir, { recursive: true });

for (const kind of LAUNCH_FIXTURES) {
  writeFileSync(join(outDir, `${kind}.docx`), await launchFixture(kind));
}

const hostile = await JSZip.loadAsync(await launchFixture("body"));
hostile.file("word/vbaProject.bin", "macro");
writeFileSync(
  join(outDir, "hostile_vba.docx"),
  await hostile.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
);

const cancelZip = await JSZip.loadAsync(await launchFixture("body"));
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const cancelParagraphs = Array.from({ length: 600 }, (_, index) => {
  const unique = randomBytes(128).toString("hex");
  return `<w:p><w:r><w:t xml:space="preserve">The Company shall recieve the the notice ${index} ${unique} under Clause 99.2 by [●].</w:t></w:r></w:p>`;
}).join("");
cancelZip.file(
  "word/document.xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${cancelParagraphs}<w:sectPr/></w:body></w:document>`,
);
const cancelBytes = await cancelZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
if (cancelBytes.byteLength > PROOF_LOCAL_MAX_SOURCE_BYTES) {
  throw new Error("cancel fixture exceeded the published source cap");
}
if (cancelBytes.byteLength < 80_000) {
  throw new Error("cancel fixture compressed too far to leave a cancel window");
}
writeFileSync(join(outDir, "cancel_load.docx"), cancelBytes);

writeFileSync(join(outDir, "oversized.docx"), Buffer.alloc(PROOF_LOCAL_MAX_SOURCE_BYTES + 1, 0x41));
writeFileSync(join(outDir, "manifest.json"), JSON.stringify({
  maxSourceBytes: PROOF_LOCAL_MAX_SOURCE_BYTES,
  files: [...LAUNCH_FIXTURES.map((kind) => `${kind}.docx`), "hostile_vba.docx", "cancel_load.docx", "oversized.docx"],
}, null, 2));
