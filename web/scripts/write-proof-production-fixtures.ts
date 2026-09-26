import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { buildDocx } from "../src/lib/agmt/docx.ts";
import { LAUNCH_FIXTURES, launchFixture } from "../src/lib/agmt/corpus/launch-fixtures.ts";
import { PROOF_LOCAL_MAX_SOURCE_BYTES } from "../src/lib/proof-local/limits.ts";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: write-proof-production-fixtures.ts <dir>");
mkdirSync(outDir, { recursive: true });

for (const kind of LAUNCH_FIXTURES) {
  writeFileSync(join(outDir, `${kind}.docx`), await launchFixture(kind));
}

writeFileSync(join(outDir, "user_report.docx"), await buildDocx([
  "Please recieve the attached schedule.",
  "Kindly correct teh attached draft before circulation.",
  "The Company shall goverment the process in writing.",
  "The Company shall have mispelled the defined term in this clause.",
  "The Company have an obligation to notify the Buyer promptly.",
  "The Buyer must pay,, the amount immediately.",
  "Northwind Traders Limited shall keep the Confidential Information.",
]));

writeFileSync(join(outDir, "repeat_misspelling.docx"), await buildDocx(
  Array.from({ length: 10 }, (_, index) => `Please send the enviroment notice in writing ${index}.`),
));

writeFileSync(join(outDir, "clean_traps.docx"), await buildDocx([
  "The Company shall deliver the notice in writing.",
  "Please send the colour certificate to the buyer.",
  "The amount is 3.14 percent of the price stated below.",
  "The Company shall use e.g. the attached form.",
  "Mr. Smith shall notify the buyer before completion.",
  "The Buyer must wait... then collect the papers from the office.",
  "Zyxxco Blorple Limited shall keep the records with the file.",
  "The Company shall use \"goverment\" only as a quoted example.",
  "The Buyer must pay the amount (including tax",
  "and insurance) immediately after completion.",
]));

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
  files: [...LAUNCH_FIXTURES.map((kind) => `${kind}.docx`), "user_report.docx", "repeat_misspelling.docx", "clean_traps.docx", "hostile_vba.docx", "cancel_load.docx", "oversized.docx"],
}, null, 2));
