/**
 * End-to-end check of the built app in Chromium: sample deal -> place returns
 * -> add a phone-style photo -> download every executed copy -> verify the
 * PDFs. Fails on any console error or Content-Security-Policy violation.
 *
 *   npm run build && npm run e2e            (SCREENSHOTS=dir to keep screenshots)
 *   npm run build:artifact && E2E_OUTDIR=dist-artifact npm run e2e
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";

const URL = "http://127.0.0.1:4174/";
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });

// Run vite directly in its own process group, so stopping it frees the port.
// E2E_OUTDIR=dist-artifact checks the claude.ai preview build instead.
const outDir = process.env.E2E_OUTDIR ?? "dist";
const server = spawn("node", ["node_modules/vite/bin/vite.js", "preview", "--outDir", outDir], { stdio: "ignore", detached: true });
const stop = () => {
  try {
    process.kill(-server.pid);
  } catch {}
};
process.on("exit", stop);

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("preview server did not start");
}

function check(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

await waitForServer();
const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" }));
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() =>
  document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)),
);

try {
  await page.goto(URL);
  if (shots) await page.screenshot({ path: `${shots}/1-start.png` });
  await page.getByTestId("sample").click();

  await page.getByTestId("tray").waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".page img").length === 13);
  const flagged = await page.locator(".page-on").count();
  check(flagged === 6, "six signature pages detected in the sample SHA");
  const names = await page.locator(".party-inputs input").evaluateAll((els) => els.map((e) => e.value));
  check(names.length === 7 && names.includes("Rahul Mehta") && names.includes("Priya Nair"), `party names read: ${names.join(" | ")}`);

  const packs = page.waitForEvent("download");
  await page.getByTestId("download-packs").click();
  const packZip = unzipSync(readFileSync(await (await packs).path()));
  check(Object.keys(packZip).length === 7, "seven signature-page PDFs to send out");

  await page.getByTestId("place-all").filter({ hasText: "Place 13" }).waitFor();
  await page.getByTestId("place-all").click();
  check((await page.locator("[data-testid=tray]").count()) === 0, "all 13 returned files placed by file name");

  await page.locator(".party-card").first().locator("select").selectOption("original");

  const warnings = await page.getByTestId("copy-warning").allInnerTexts();
  check(warnings.length === 7 && warnings.every((w) => w.includes("Tamarind")), "every copy flags Tamarind's missing countersigned page");
  if (shots) await page.screenshot({ path: `${shots}/2-deal.png`, fullPage: true });

  // Tamarind sends a photo instead of a PDF: use a PNG of its signature page.
  const png = await page.locator("[data-testid=sig-page-12] img").screenshot();
  const tamarind = page.locator(".party-card").filter({ hasText: "Tamarind" });
  await tamarind.locator("input[type=file]").first().setInputFiles({ name: "IMG_4411.png", mimeType: "image/png", buffer: png });
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=copy-warning]").length === 0);
  check(true, "photo return accepted; all copies complete");

  const all = page.waitForEvent("download");
  await page.getByTestId("download-all").click();
  const download = await all;
  const files = unzipSync(readFileSync(await download.path()));
  const entries = Object.entries(files);
  check(entries.length === 7, `seven executed copies in ${download.suggestedFilename()}`);
  check(Object.keys(files).some((n) => n.includes("Executed Original - Meridian")), "original copy named for the company");
  for (const [name, bytes] of entries) {
    const doc = await PDFDocument.load(bytes);
    const stamp = name.endsWith("Meridian Foods Private Limited.pdf") ? 2 : 1;
    // stamp + 6 body pages + 7 countersigned pages + schedule
    check(doc.getPageCount() === stamp + 6 + 7 + 1, `${name}: ${doc.getPageCount()} pages`);
  }
  if (shots) await page.screenshot({ path: `${shots}/3-complete.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  if (shots) await page.screenshot({ path: `${shots}/4-mobile.png`, fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, "no horizontal scroll at phone width");

  check(problems.length === 0, `no console errors or CSP violations${problems.length ? `: ${problems.join("; ")}` : ""}`);
} catch (err) {
  console.error(problems.join("\n"));
  if (shots) await page.screenshot({ path: `${shots}/failure.png`, fullPage: true });
  throw err;
} finally {
  await browser.close();
  stop();
}
