#!/usr/bin/env node
/**
 * Signature pages Agmt makes, end to end, in Chromium against a running app
 * (default http://127.0.0.1:8080; pass a URL to test another):
 *
 *   a final agreement with no signature pages -> "Make from the parties" is
 *   chosen -> parties read from the clause and from Schedule 1, Part A ->
 *   footer without a date -> pages made -> the zip of one page per party
 *   (no Agmt mark anywhere) -> "Use my template" with a PDF template -> the
 *   sample name found, replaced on every page and gone from the text ->
 *   signed returns under scanner names sorted to their parties -> each copy
 *   ends with the signed pages after the schedules -> back to "In this
 *   agreement" asks first.
 *
 * Fails on any console error, page error or Content-Security-Policy violation.
 *
 *   npm run execute:make-journey [-- https://app.agmt.legal]     SCREENSHOTS=dir to keep screenshots
 */
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildNoSignatureAgreement, buildSignatureTemplate, NO_SIGNATURE_EXPECTED } from "../src/lib/execute/sample-parties.ts";

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
async function textOf(bytes) {
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const parts = [];
  for (let n = 1; n <= pdf.numPages; n += 1) parts.push((await (await pdf.getPage(n)).getTextContent()).items.map((i) => i.str).join(" "));
  return parts.join("\n");
}

const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" }));
const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const problems = [];
const fontHost = (url) => /fonts\.(googleapis|gstatic)\.com/.test(url ?? "");
const PLATFORM_SCRIPT = "https://grok.com/grok-app-builder/extensions.js";
const expected = (text) => text.includes(PLATFORM_SCRIPT) || /script-src eval from .*zod/.test(text);
page.on("console", (m) => {
  const text = m.text();
  if (m.type() === "error" && !/^Failed to load resource/.test(text) && !expected(text)) problems.push(`console: ${text}`);
});
page.on("requestfailed", (r) => {
  if (r.url() !== PLATFORM_SCRIPT && !fontHost(r.url())) problems.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ""}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() =>
  document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI} from ${e.sourceFile}:${e.lineNumber}`)),
);

const everyone = [...NO_SIGNATURE_EXPECTED.named.map((n) => n.name), ...NO_SIGNATURE_EXPECTED.investors];

try {
  const final = Buffer.from(await buildNoSignatureAgreement());
  const template = Buffer.from(await buildSignatureTemplate());

  await page.goto(`${BASE}/`);
  await page.locator("[data-testid='start'][data-ready='true']").waitFor({ timeout: 60_000 });
  await page.getByTestId("start-drop").locator("input[type=file]").setInputFiles({ name: "Saffron SHA - final.pdf", mimeType: "application/pdf", buffer: final });

  // No signature pages in it: "Make from the parties" is chosen and the parties are read.
  await page.getByTestId("make-parties").waitFor({ timeout: 60_000 });
  check((await page.getByTestId("source-parties").getAttribute("aria-checked")) === "true", "an agreement without signature pages opens on 'Make from the parties'");
  check((await page.getByTestId("source-agreement").innerText()).includes("None found"), "'In this agreement' says none were found");
  await page.waitForFunction((n) => document.querySelectorAll("[data-testid='make-party']").length === n, everyone.length, { timeout: 30_000 });
  const names = await page.locator("[data-testid='make-party'] input").evaluateAll((els) => els.map((e) => e.value));
  check(JSON.stringify(names) === JSON.stringify(everyone), `parties read from the clause and Schedule 1, Part A: ${names.join(" | ")}`);
  const note = await page.getByTestId("parties-note").innerText();
  check(/Found 3 parties in the parties clause and 6 more in Part A of Schedule 1/.test(note), `the lawyer is told where they came from: ${note}`);
  const footer = await page.getByTestId("make-footer").inputValue();
  check(footer === NO_SIGNATURE_EXPECTED.footer, "the footer names the agreement and parties, with no date");
  await shot(page, "parties");

  await page.getByTestId("make-pages").click();
  await page.waitForFunction((n) => document.querySelectorAll("[data-testid='made-pages'] figure img").length === n, everyone.length, { timeout: 60_000 });
  check(true, `${everyone.length} signature pages made and shown`);
  await shot(page, "made-from-parties");

  let download = page.waitForEvent("download");
  await page.getByTestId("download-packs").click();
  let zip = unzipSync(readFileSync(await (await download).path()));
  const files = Object.keys(zip);
  check(files.length === everyone.length && files.some((f) => /Vikram Mehta/.test(f)), `one PDF per party, named after the party (${files.length})`);
  const vikram = await textOf(zip[files.find((f) => /Vikram Mehta/.test(f))]);
  check(/SIGNED AND DELIVERED by/.test(vikram) && /Vikram Mehta/.test(vikram) && /forms an integral part of the Shareholders' Agreement/.test(vikram), "an individual's page reads right, with the footer");
  check(Object.values(zip).every((b) => !/agmt|execute/i.test(Buffer.from(b).toString("latin1"))), "no Execute or Agmt name in any page, metadata included");

  // The lawyer's own template.
  await page.getByTestId("source-template").click();
  await page.getByTestId("make-template").waitFor();
  check((await page.locator("[data-testid='make-party']").count()) === everyone.length, "switching to a template keeps the confirmed parties");
  await page.getByTestId("add-template").locator("input[type=file]").setInputFiles({ name: "Signature page - template.pdf", mimeType: "application/pdf", buffer: template });
  await page.getByTestId("template-card").waitFor({ timeout: 30_000 });
  check((await page.getByTestId("template-sample").inputValue()) === "Orchid Capital Private Limited", "the name on the template is found for the lawyer to confirm");
  check(/Found once/.test(await page.getByTestId("template-status").innerText()), "and where it stands on the page");
  await page.waitForTimeout(500);
  await shot(page, "template");
  await page.getByTestId("make-pages").click();
  await page.waitForFunction(() => /signature pages made/.test(document.querySelector("[data-testid='make-pages']")?.closest("section")?.textContent ?? ""), null, { timeout: 60_000 });
  await page.waitForFunction((n) => document.querySelectorAll("[data-testid='made-pages'] figure img").length === n, everyone.length, { timeout: 60_000 });
  await shot(page, "made-from-template");

  download = page.waitForEvent("download");
  await page.getByTestId("download-packs").click();
  zip = unzipSync(readFileSync(await (await download).path()));
  const radhika = await textOf(zip[Object.keys(zip).find((f) => /Radhika Menon/.test(f))]);
  check(/RADHIKA MENON/.test(radhika) && !/ORCHID/.test(radhika), "a template page carries the party's name, and the sample name is gone from its text");

  // Everything is kept in this browser: after a reload the pages and the template are still there.
  await page.waitForFunction(() => /Saved in this browser/.test(document.body.textContent ?? ""), null, { timeout: 15_000 });
  await page.reload();
  await page.locator("[data-testid='start'][data-ready='true']").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /Saffron SHA/ }).first().click();
  await page.getByTestId("make-template").waitFor({ timeout: 30_000 });
  await page.waitForFunction((n) => document.querySelectorAll("[data-testid='made-pages'] figure img").length === n, everyone.length, { timeout: 60_000 });
  check((await page.getByTestId("template-card").count()) === 1, "after a reload, the template and the pages made from it are still there");

  // Signed returns come back under scanner names and are sorted by what they say.
  await page.getByTestId("tab-returns").click();
  const signed = Object.entries(zip).map(([, bytes], i) => ({ name: `Scan_${String(i + 1).padStart(4, "0")}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(bytes) }));
  await page.getByTestId("returns-drop").locator("input[type=file]").setInputFiles(signed);
  await page.waitForFunction((n) => new RegExp(`All ${n} placed`).test(document.querySelector("[data-testid='batch']")?.textContent ?? ""), everyone.length, { timeout: 60_000 });
  check((await page.getByTestId("tray").count()) === 0, "every signed page is sorted to its party; none left for the lawyer");
  await shot(page, "returns");

  // Each copy: the whole agreement, then the signed pages at the end.
  await page.getByTestId("tab-copies").click();
  const row = page.getByTestId("copy-row").filter({ hasText: "Vikram Mehta" }).first();
  await row.getByRole("button", { name: "Show pages" }).click();
  const order = await row.locator("ol[aria-label='Pages of this copy in order'] > li").evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ""));
  check(order.length === 7 + everyone.length, `the copy is 7 agreement pages then ${everyone.length} signed pages (${order.length})`);
  check(order.slice(7).every((t) => /Signed/.test(t)) && order.slice(0, 7).every((t) => !/Signed/.test(t)), "signed pages come after the schedules");
  await shot(page, "copy-preview");

  // Going back to the agreement's own pages asks first.
  await page.getByTestId("tab-documents").click();
  await page.getByTestId("source-agreement").click();
  await page.getByRole("alert").filter({ hasText: "back to the tray" }).waitFor();
  check(true, "switching back to 'In this agreement' asks first, because returns are sorted to the made pages");
  await page.getByRole("button", { name: "Keep the pages Execute made" }).click();
  check((await page.getByTestId("source-template").getAttribute("aria-checked")) === "true", "keeping them changes nothing");

  // Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `fits a phone (overflow ${overflow}px)`);
  await shot(page, "phone");

  check(problems.length === 0, `no console errors, page errors or policy violations${problems.length ? `:\n  ${problems.join("\n  ")}` : ""}`);
} finally {
  await browser.close();
}
