/**
 * Signed-out production header check: choose → process → download a synthetic
 * header document at https://app.agmt.legal/proof, then leave the file for
 * Word COM inspection. Does not send document bytes to Agmt APIs.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { headerTypoDocx } from "../src/lib/agmt/corpus/pwc/story-fixtures.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "docs", "proof", "word-review");
const ORIGIN = (process.env.AGMT_PROOF_ORIGIN || "https://app.agmt.legal").replace(/\/+$/, "");

mkdirSync(outDir, { recursive: true });
const source = await headerTypoDocx();
const sourcePath = join(outDir, "production_header_typo.docx");
writeFileSync(sourcePath, source);

const playwright = await import("playwright");
const browser = await playwright.chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const dest = join(outDir, "production_header_typo_Proofread.docx");
try {
  await page.goto(`${ORIGIN}/proof`, { waitUntil: "load", timeout: 30_000 });
  await page.getByRole("heading", { name: "Proofread your Word document." }).waitFor({ timeout: 30_000 });
  await page.getByText("No account required. Your document is processed on this device and isn’t sent to Agmt.").first().waitFor({ timeout: 15_000 });
  const input = page.locator("input[type=file]").first();
  await input.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1_500);
  await input.setInputFiles(sourcePath);
  await page.getByText(/production_header_typo\.docx · .+ KiB selected on your device/).waitFor({ timeout: 20_000 });
  const button = page.getByRole("button", { name: "Proofread document" });
  if (await button.isDisabled()) throw new Error("proofread_disabled");
  await button.click();
  const terminal = page.getByRole("heading", { name: "Your document is ready with limited coverage." })
    .or(page.getByRole("heading", { name: "Your proofread document is ready." }));
  await terminal.waitFor({ timeout: 120_000 });
  const state = (await page.locator("#proof-main").innerText()).includes("limited coverage") ? "limited" : "ready";
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    page.getByRole("button", { name: "Download Word document" }).click(),
  ]);
  await download.saveAs(dest);
  const zip = await JSZip.loadAsync(readFileSync(dest));
  const headerXml = await zip.file("word/header1.xml")!.async("string");
  const documentXml = await zip.file("word/document.xml")!.async("string");
  const commentsXml = zip.file("word/comments.xml") ? await zip.file("word/comments.xml")!.async("string") : "";
  const report = {
    origin: ORIGIN,
    state,
    dest,
    headerDel: (headerXml.match(/<w:del\b/g) || []).length,
    headerIns: (headerXml.match(/<w:ins\b/g) || []).length,
    headerHasRecieve: headerXml.includes("recieve"),
    headerHasReceive: headerXml.includes("receive"),
    headerComments: (headerXml.match(/<w:commentRangeStart\b/g) || []).length,
    bodyHasRecieve: documentXml.includes("recieve"),
    bodyDel: (documentXml.match(/<w:del\b/g) || []).length,
    coverageMentionsHeader: /header_comments_unanchorable/.test(commentsXml),
  };
  writeFileSync(join(outDir, "production_header_typo_receipt.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.headerDel < 1 || report.headerIns < 1 || report.headerComments !== 0 || report.bodyHasRecieve) {
    process.exit(1);
  }
} finally {
  await browser.close();
}
