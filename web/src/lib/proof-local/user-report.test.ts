import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { buildDocx } from "../agmt/docx.ts";
import { analyzeProof } from "../agmt/proof/launch.ts";
import { processProofLocal } from "./pipeline.ts";
import { PROOF_LOCAL_ZERO_DETAIL, PROOF_LOCAL_ZERO_FINDINGS } from "./copy.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const here = dirname(fileURLToPath(import.meta.url));

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function revisionDocx(): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await buildDocx(["The Company shall seperate the assets on completion."]));
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>`
    + `<w:p><w:r><w:t xml:space="preserve">${escapeXml("The Company shall seperate the assets on completion.")}</w:t></w:r></w:p>`
    + `<w:p><w:ins w:id="7" w:author="Prior Reviewer" w:date="2026-01-01T00:00:00Z"><w:r><w:t xml:space="preserve">${escapeXml("The Company shall occured the inserted notice.")}</w:t></w:r></w:ins></w:p>`
    + `<w:sectPr/></w:body></w:document>`,
    { date: new Date(0) },
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

test("browser entry: ordinary sentences with planted typos and spelling errors are marked", async () => {
  const source = await buildDocx([
    "Please recieve the attached schedule.",
    "Kindly correct teh attached draft before circulation.",
    "The Company shall goverment the process in writing.",
    "The Company shall have mispelled the defined term in this clause.",
    "The Company have an obligation to notify the Buyer promptly.",
    "The Buyer must pay,, the amount immediately.",
    "Northwind Traders Limited shall keep the Confidential Information.",
  ]);
  const result = await processProofLocal(new Uint8Array(source));
  const quotes = result.findings.map((finding) => `${finding.ruleId}:${finding.kind}:${finding.quote}`);
  assert.ok(quotes.includes("language.typo_allowlist:correction:recieve"), quotes.join(" | "));
  assert.ok(quotes.includes("language.typo_allowlist:correction:teh"), quotes.join(" | "));
  assert.ok(quotes.includes("spelling.dictionary:comment:goverment"), quotes.join(" | "));
  assert.ok(quotes.includes("spelling.dictionary:comment:mispelled"), quotes.join(" | "));
  assert.ok(quotes.includes("punctuation.duplicate_mark:correction:,,"), quotes.join(" | "));
  assert.equal(result.findings.some((finding) => /have an obligation/.test(finding.quote)), false);
  assert.equal(result.findings.some((finding) => finding.kind === "correction" && /Northwind|Confidential|Acme/.test(finding.quote)), false);
  assert.ok(result.corrections >= 2);
  assert.ok(result.comments >= 2);
  const xml = await (await JSZip.loadAsync(result.output)).file("word/document.xml")!.async("string");
  assert.match(xml, /<w:ins\b/);
  assert.match(xml, /<w:del\b/);
  assert.match(xml, /<w:commentRangeStart\b/);
});

test("browser entry: a clean sentence stays unmarked and is not a processing failure", async () => {
  const source = await buildDocx(["The Company shall deliver the notice in writing."]);
  const result = await processProofLocal(new Uint8Array(source));
  assert.equal(result.corrections, 0);
  assert.equal(result.comments, 0);
  assert.equal(result.coverage, "complete");
  assert.deepEqual(result.output, new Uint8Array(source));
  const ui = readFileSync(join(here, "../../components/agmt/proof-local.tsx"), "utf8");
  assert.match(ui, /PROOF_LOCAL_ZERO_FINDINGS/);
  assert.equal(PROOF_LOCAL_ZERO_FINDINGS, "Completed checks found nothing to mark.");
  assert.match(PROOF_LOCAL_ZERO_DETAIL, /does not check grammar/);
});

test("errors inside existing insertions are not relocated; coverage records the limitation", async () => {
  const source = await revisionDocx();
  const analysis = await analyzeProof(source);
  const local = await processProofLocal(new Uint8Array(source));
  assert.equal(analysis.plan.findings.some((finding) => finding.exactQuote === "occured"), false);
  assert.equal(analysis.plan.notices.some((notice) => /occured/.test(notice.comment)), false);
  assert.ok(analysis.gaps.includes("prior_revision"));
  assert.equal(analysis.coverage, "limited");
  assert.ok(local.findings.some((finding) => finding.ruleId === "language.typo_allowlist" && finding.quote === "seperate"));
  assert.ok(local.coverageLines.some((line) => line.text.includes("existing tracked changes")));
  assert.ok(local.coverageLines.some((line) => line.kind === "skipped" && line.text.includes("prior revision")));
});
