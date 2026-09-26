import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { headerTypoDocx, headerCleanDocx } from "../src/lib/agmt/corpus/pwc/story-fixtures.ts";
import { processProofLocal } from "../src/lib/proof-local/pipeline.ts";

const outDir = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "proof", "word-review");
mkdirSync(outDir, { recursive: true });

const dirty = await headerTypoDocx();
writeFileSync(join(outDir, "header_typo.docx"), dirty);
const dirtyOut = await processProofLocal(new Uint8Array(dirty));
writeFileSync(join(outDir, "header_typo_Proofread.docx"), Buffer.from(dirtyOut.output));
writeFileSync(join(outDir, "header_typo_receipt.json"), JSON.stringify({
  corrections: dirtyOut.corrections,
  comments: dirtyOut.comments,
  notices: dirtyOut.notices,
  coverage: dirtyOut.coverage,
  findings: dirtyOut.findings,
}, null, 2));

const clean = await headerCleanDocx();
writeFileSync(join(outDir, "header_clean.docx"), clean);
const cleanOut = await processProofLocal(new Uint8Array(clean));
writeFileSync(join(outDir, "header_clean_Proofread.docx"), Buffer.from(cleanOut.output));
console.log(JSON.stringify({
  dirty: { corrections: dirtyOut.corrections, comments: dirtyOut.comments, coverage: dirtyOut.coverage, findings: dirtyOut.findings },
  clean: { corrections: cleanOut.corrections, comments: cleanOut.comments, coverage: cleanOut.coverage, findings: cleanOut.findings },
}, null, 2));
