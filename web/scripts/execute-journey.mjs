#!/usr/bin/env node
/**
 * Executed copies, end to end, in Chromium against a running app
 * (default http://127.0.0.1:8080; pass a URL to test another):
 *
 *   sample signing -> signature pages and parties found -> every return sorted
 *   by content -> a phone photo (no useful name, no text layer) read by local
 *   OCR and placed -> all copies ready -> zip with the closing index opened
 *   and checked -> the signing survives a reload -> phone width -> feedback.
 *
 * Fails on any console error, page error or Content-Security-Policy violation.
 *
 *   npm run execute:journey [-- https://app.agmt.legal]     SCREENSHOTS=dir to keep screenshots
 */
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { buildSampleSigning } from "../src/lib/execute/sample.ts";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
let step = 0;
const shot = async (page, name, fullPage = true) => {
  if (shots) await page.screenshot({ path: `${shots}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage });
};
function check(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

/** Tamarind's SHA signature page, signed and photographed: a PNG with no text layer. */
async function tamarindPhoto() {
  const sample = await buildSampleSigning();
  const sha = sample.documents[0].bytes;
  const page = Number(Object.entries(sample.expected["SHA Meridian Foods"].partiesByPage).find(([, v]) => v.includes("Tamarind Growth Partners"))[0]);
  const pdf = await pdfjs.getDocument({ data: sha.slice(), verbosity: 0 }).promise;
  const p = await pdf.getPage(page + 1);
  const viewport = p.getViewport({ scale: 1400 / p.getViewport({ scale: 1 }).width });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fbfaf7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvas, canvasContext: ctx, viewport }).promise;
  ctx.strokeStyle = "#1b2a7a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(190, 470);
  ctx.bezierCurveTo(260, 380, 300, 520, 380, 440);
  ctx.bezierCurveTo(430, 400, 470, 500, 540, 450);
  ctx.stroke();
  return canvas.toBuffer("image/png");
}

const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" }));
const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const problems = [];
// Web fonts come from Google; a network that blocks them is not an app
// failure. Chrome's "Failed to load resource" console line does not always
// say which URL, so failed requests are judged by URL instead.
const fontHost = (url) => /fonts\.(googleapis|gstatic)\.com/.test(url ?? "");
// Two refusals are expected and prove the page policy works: the template's
// grok.com platform script is blocked from this page, and zod's one-off eval
// probe is refused (it then runs without eval).
const PLATFORM_SCRIPT = "https://grok.com/grok-app-builder/extensions.js";
const expected = (text) => text.includes(PLATFORM_SCRIPT) || /script-src eval from .*zod/.test(text);
let platformBlocked = false;
page.on("console", (m) => {
  const text = m.text();
  if (text.includes(PLATFORM_SCRIPT)) platformBlocked = true;
  if (m.type() === "error" && !/^Failed to load resource/.test(text) && !expected(text)) problems.push(`console: ${text}`);
});
page.on("requestfailed", (r) => {
  if (r.url() === PLATFORM_SCRIPT) platformBlocked = true;
  else if (!fontHost(r.url())) problems.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ""}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() =>
  document.addEventListener("securitypolicyviolation", (e) =>
    console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI} from ${e.sourceFile}:${e.lineNumber}`),
  ),
);

try {
  await page.goto(`${BASE}/`);
  await page.locator("[data-testid='start'][data-ready='true']").waitFor({ timeout: 60_000 });
  await shot(page, "start", false);

  await page.getByTestId("sample").click();
  await page.getByTestId("signing-name").waitFor();
  await page.waitForFunction(() => /Sorted \d+ files/.test(document.querySelector("[data-testid='batch']")?.textContent ?? ""), null, { timeout: 120_000 });
  await page.getByTestId("tab-documents").click();
  await page.getByRole("button", { name: /^SHA Meridian Foods/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid^='sig-']").length > 0, null, { timeout: 60_000 });
  const parties = await page.locator("[data-testid^='sig-'] input").evaluateAll((els) => els.map((e) => e.value));
  check(parties.includes("Meridian Foods Private Limited") && parties.includes("Rahul Mehta") && parties.includes("Priya Nair"), `parties read from the SHA: ${parties.join(" | ")}`);
  await shot(page, "documents");

  await page.getByTestId("tab-returns").click();
  check((await page.getByTestId("tray").count()) === 0, "every sample return sorted by content, none left for the user");
  const awaited = await page.locator("[data-testid='cell'][data-signed='awaited']").count();
  check(awaited === 1, "exactly one countersigned page awaited (Tamarind, SHA)");
  await shot(page, "returns");

  const png = await tamarindPhoto();
  await page.getByTestId("returns-drop").locator("input[type=file]").setInputFiles({ name: "IMG_4411.png", mimeType: "image/png", buffer: png });
  await page.waitForFunction(() => document.querySelectorAll("[data-testid='cell'][data-signed='awaited']").length === 0, null, { timeout: 120_000 });
  check(true, "an unnamed phone photo was read by local OCR and placed on Tamarind's page");
  const tamarindCell = page.locator("tr", { hasText: "Tamarind Growth Partners" }).getByTestId("cell").first();
  await tamarindCell.click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(800);
  await shot(page, "cell-panel", false);
  await page.getByRole("dialog").getByRole("button", { name: /View IMG_4411\.png large/ }).click();
  await page.getByRole("dialog", { name: "Returned page beside the final" }).locator("img").nth(1).waitFor();
  await page.waitForTimeout(800);
  await shot(page, "compare", false);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").getByLabel("Close").click();

  await page.getByTestId("tab-copies").click();
  const ready = await page.locator("[data-testid='copy-row'][data-ready='true']").count();
  check(ready === 11, `all 11 executed copies ready (${ready})`);
  await shot(page, "copies");

  const download = page.waitForEvent("download");
  await page.getByTestId("download-all").click();
  const zip = unzipSync(readFileSync(await (await download).path()));
  const names = Object.keys(zip);
  check(names.length === 12 && names.includes("Closing index.pdf"), `zip holds 11 copies and the closing index (${names.length} files)`);
  for (const [name, bytes] of Object.entries(zip)) {
    if (name === "Closing index.pdf") continue;
    const doc = await PDFDocument.load(bytes);
    const sha = name.startsWith("SHA");
    const stamp = name.endsWith("Meridian Foods Private Limited.pdf") && sha ? 2 : 1;
    const expected = sha ? stamp + 4 + 7 + 1 : stamp + 2 + 4 + 1;
    check(doc.getPageCount() === expected, `${name}: ${doc.getPageCount()} pages`);
  }

  await page.reload();
  await page.locator("[data-testid='start'][data-ready='true']").waitFor({ timeout: 60_000 });
  await page.getByText("Sample: Meridian Foods Series A").first().waitFor();
  check(true, "the signing is still on this computer after a reload");
  await page.getByText("Sample: Meridian Foods Series A").first().click();
  await page.getByTestId("tab-returns").click();
  await page.locator("[data-testid='cell']").first().waitFor();
  check((await page.locator("[data-testid='cell'][data-signed='awaited']").count()) === 0, "reopened signing keeps every placement");

  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "phone", false);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, "no sideways scrolling of the page at phone width");
  await page.setViewportSize({ width: 1360, height: 900 });

  await page.getByTestId("feedback").click();
  await page.getByRole("dialog").getByRole("textbox").first().fill("Journey test: everything sorted.");
  await shot(page, "feedback", false);
  await page.getByRole("dialog").getByRole("button", { name: "Send" }).click();
  await page.getByText("Thank you.").waitFor();
  check(true, "feedback sends");

  if (platformBlocked) console.log("ok - the template's third-party platform script was refused by the page policy");
  check(problems.length === 0, `no console errors or unexpected policy violations${problems.length ? `: ${problems.join("; ")}` : ""}`);
} catch (err) {
  console.error(problems.join("\n"));
  await shot(page, "failure");
  throw err;
} finally {
  await browser.close();
}
