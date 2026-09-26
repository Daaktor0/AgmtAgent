#!/usr/bin/env node
/**
 * Screenshots of every Execute screen state, for design review. Not a test:
 * it drives the app against a running dev server and writes PNGs.
 *
 *   node --experimental-strip-types scripts/execute-screens.mjs [base-url] [out-dir]
 *
 * States: start (empty, with saved signings, phone), sample documents,
 * returns (awaited, needs-you, problem), cell panel, copies with a preview,
 * a 20-party / 3-document signing (desktop and phone), the closing index,
 * the feedback dialog.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { buildSampleSigning } from "../src/lib/execute/sample.ts";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
const OUT = process.argv[3] ?? "screens";
mkdirSync(OUT, { recursive: true });
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });

const A4 = [595.28, 841.89];
const PEN = rgb(0.05, 0.15, 0.55);

/** A long-form agreement with one signature page per party, in the sample's block style. */
async function stressAgreement(title, parties, bodyPages) {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < bodyPages; i += 1) {
    const p = doc.addPage(A4);
    p.drawText(`${i + 1}. ${title.toUpperCase()} - CLAUSE ${i + 1}`, { x: 72, y: 760, size: 10.5, font: b });
    for (let l = 0; l < 30; l += 1) p.drawText("Subject to the terms of this Agreement each party shall take all actions required.", { x: 72, y: 730 - l * 14, size: 10, font: f });
  }
  const placed = [];
  for (const party of parties) {
    const p = doc.addPage(A4);
    p.drawText("For and on behalf of", { x: 72, y: 700, size: 10, font: f });
    p.drawText(party.toUpperCase(), { x: 72, y: 685, size: 10, font: b, maxWidth: 440 });
    p.drawText("______________________________", { x: 72, y: 640, size: 10, font: f });
    p.drawText("Name:", { x: 72, y: 624, size: 10, font: f });
    p.drawText(`[Signature page to the ${title}]`, { x: 200, y: 54, size: 9, font: f });
    placed.push({ page: doc.getPageCount() - 1, party });
  }
  return { bytes: await doc.save(), placed };
}

async function signed(agreement, pageIndex) {
  const out = await PDFDocument.create();
  const [copied] = await out.copyPages(await PDFDocument.load(agreement), [pageIndex]);
  out.addPage(copied);
  copied.drawSvgPath("M 0 0 C 10 -12 20 6 30 -6 S 50 12 62 -2 S 84 -6 96 6 L 120 -4", { x: 80, y: 654, borderColor: PEN, borderWidth: 1.4 });
  return out.save();
}

async function stamp(cert, party, description) {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const p = doc.addPage(A4);
  let y = 760;
  for (const line of [
    "SPECIMEN - NOT A STAMP PAPER",
    `Certificate No. : ${cert}`,
    "Certificate Issued Date : 12-Sep-2026 11:04 AM",
    `Purchased by : ${party}`,
    `Description of Document : ${description}`,
    "First Party : Meridian Foods Private Limited",
    `Second Party : ${party}`,
    `Stamp Duty Paid By : ${party}`,
    "Stamp Duty Amount(Rs.) : 500",
  ]) {
    p.drawText(line, { x: 72, y, size: 10.5, font: f });
    y -= 22;
  }
  return doc.save();
}

const STRESS_PARTIES = [
  "Meridian Foods Private Limited",
  "Rahul Mehta",
  "Priya Nair",
  "Banyan Capital Fund I",
  "Kestrel Ventures LLP",
  "Anand Iyer",
  "Tamarind Growth Partners",
  "Hindustan Infrastructure and Agri-Value Chain Opportunities Fund II, acting through its trustee Vistara Trusteeship Services Private Limited",
  "Saraswati Family Trust",
  "Oriole Holdings (Mauritius) Limited",
  "Nilgiri Early Stage Fund",
  "Deepa Raghavan",
  "Kavya Menon",
  "Lotus Bay Capital LLP",
  "Sundaram Agro Private Limited",
  "Vikram Sethi",
  "Harbourline Advisors LLP",
  "Arjun Kapoor",
  "Peregrine Growth Fund III",
  "Chinar Holdings Private Limited",
];

async function toPng(pdfBytes, pageNo, width, path) {
  const pdf = await pdfjs.getDocument({ data: pdfBytes.slice(), verbosity: 0 }).promise;
  const p = await pdf.getPage(pageNo);
  const viewport = p.getViewport({ scale: width / p.getViewport({ scale: 1 }).width });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvas, canvasContext: ctx, viewport }).promise;
  writeFileSync(path, canvas.toBuffer("image/png"));
}

const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" }));
const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const ready = () => page.locator("[data-testid='start'][data-ready='true']").waitFor({ timeout: 60_000 });
const settle = (ms = 1200) => page.waitForTimeout(ms);

try {
  await page.goto(`${BASE}/`);
  await ready();
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "start-phone");
  await page.setViewportSize({ width: 1360, height: 900 });

  // The sample, as it opens: one countersigned page awaited.
  await page.getByTestId("sample").click();
  await page.getByTestId("signing-name").waitFor();
  await page.waitForFunction(() => /Sorted \d+ files/.test(document.querySelector("[data-testid='batch']")?.textContent ?? ""), null, { timeout: 120_000 });
  await page.getByTestId("tab-documents").click();
  await settle(4000);
  await shot(page, "documents");
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  await shot(page, "documents-phone");
  await page.getByTestId("tab-returns").click();
  await settle();
  await shot(page, "returns-phone");
  await page.locator("tr", { hasText: "Tamarind Growth Partners" }).getByTestId("cell").first().click();
  await settle();
  await shot(page, "cell-panel-phone", false);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1360, height: 900 });

  // Needs you: a photo with no readable text and a meaningless name, plus a
  // second copy of Banyan's SHA stamp paper (one certificate used twice).
  const sample = await buildSampleSigning();
  const banyanStamp = sample.returns.find((r) => r.name === "e-Stamp Banyan Capital Fund I SHA.pdf");
  const blank = createCanvas(900, 1200);
  const bctx = blank.getContext("2d");
  bctx.fillStyle = "#d9d4ca";
  bctx.fillRect(0, 0, 900, 1200);
  await page.getByTestId("returns-drop").locator("input[type=file]").setInputFiles([
    { name: "WhatsApp Image 2026-09-25 at 23.14.07.png", mimeType: "image/png", buffer: blank.toBuffer("image/png") },
    { name: "Kestrel stamp.pdf", mimeType: "application/pdf", buffer: Buffer.from(banyanStamp.bytes) },
  ]);
  await page.waitForFunction(() => /Sorted \d+ file/.test(document.querySelector("[data-testid='batch']")?.textContent ?? "") && !/still being read/.test(document.querySelector("[data-testid='batch']")?.textContent ?? ""), null, { timeout: 120_000 });
  await settle(2500);
  await shot(page, "returns-needs-you");
  await page.getByTestId("tab-copies").click();
  await page.locator("[data-testid='copy-row']").first().getByRole("button", { name: "See pages" }).click();
  await settle(2500);
  await shot(page, "copies-preview");

  // Back to the start screen, which now lists the saved signing.
  await page.getByRole("button", { name: /All signings/ }).click();
  await ready();
  await shot(page, "start-saved", false);

  // The closing index, as the client receives it: complete the sample with Tamarind's page.
  await page.getByText("Sample: Meridian Foods Series A").first().click();
  await page.getByTestId("tab-copies").click();
  const download = page.waitForEvent("download");
  await page.getByTestId("download-all").click();
  const zip = unzipSync(readFileSync(await (await download).path()));
  await toPng(zip["00 Closing index.pdf"], 1, 1100, `${OUT}/closing-index.png`);
  writeFileSync(`${OUT}/closing-index.pdf`, zip["00 Closing index.pdf"]);

  // Twenty parties, three documents, long names, one party with two stamp papers.
  await page.getByRole("button", { name: /All signings/ }).click();
  await ready();
  const sha = await stressAgreement("Shareholders' Agreement", STRESS_PARTIES, 6);
  const ssa = await stressAgreement("Share Subscription Agreement", STRESS_PARTIES.filter((_, i) => i % 2 === 0 || i === 7), 4);
  const dta = await stressAgreement("Deed of Adherence", STRESS_PARTIES.slice(0, 6), 2);
  await page.getByTestId("start-drop").locator("input[type=file]").setInputFiles([
    { name: "SHA_Project Kestrel_Execution Version_v14.pdf", mimeType: "application/pdf", buffer: Buffer.from(sha.bytes) },
    { name: "SSA_Project Kestrel_Execution Version_v6.pdf", mimeType: "application/pdf", buffer: Buffer.from(ssa.bytes) },
    { name: "Deed of Adherence_Project Kestrel_final.pdf", mimeType: "application/pdf", buffer: Buffer.from(dta.bytes) },
  ]);
  await page.getByTestId("signing-name").waitFor({ timeout: 120_000 });
  await settle(3000);
  await shot(page, "stress-documents");
  const returns = [];
  let n = 1;
  for (const { page: p } of sha.placed.slice(0, 13)) returns.push({ name: `scan${String(n++).padStart(4, "0")}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(await signed(sha.bytes, p)) });
  for (const { page: p } of ssa.placed.slice(0, 5)) returns.push({ name: `scan${String(n++).padStart(4, "0")}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(await signed(ssa.bytes, p)) });
  for (const [i, party] of STRESS_PARTIES.slice(0, 9).entries()) {
    returns.push({ name: `e-Stamp ${i}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(await stamp(`IN-DEMO7${String(i).padStart(5, "0")}`, party, "Article 5(h) Agreement - Shareholders' Agreement")) });
  }
  returns.push({ name: "e-Stamp Meridian second sheet.pdf", mimeType: "application/pdf", buffer: Buffer.from(await stamp("IN-DEMO799999", STRESS_PARTIES[0], "Article 5(h) Agreement - Shareholders' Agreement")) });
  await page.getByTestId("tab-returns").click();
  await page.getByTestId("returns-drop").locator("input[type=file]").setInputFiles(returns);
  await page.waitForFunction(() => /Sorted \d+ file/.test(document.querySelector("[data-testid='batch']")?.textContent ?? ""), null, { timeout: 180_000 });
  await settle(2000);
  await shot(page, "stress-returns");
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  await shot(page, "stress-returns-phone");
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.getByTestId("tab-copies").click();
  await settle();
  await shot(page, "stress-copies");
  console.log("screens written to", OUT);
} catch (err) {
  await shot(page, "failure");
  throw err;
} finally {
  await browser.close();
}
