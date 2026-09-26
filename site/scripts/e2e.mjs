#!/usr/bin/env node
/**
 * Every page in a real browser, at phone, tablet and desktop widths, in light
 * and dark: no console errors, no sideways scrolling, no broken images, and
 * the old addresses redirect. Needs a running site:
 *
 *   npm run build && npm run preview        # serves on http://127.0.0.1:8081
 *   npm run test:e2e -- [base-url] [--shots <dir>]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const shotsAt = args.indexOf("--shots");
const shots = shotsAt >= 0 ? args[shotsAt + 1] : null;
const base = (args.find((a, i) => !a.startsWith("--") && i !== shotsAt + 1) ?? "http://127.0.0.1:8081").replace(/\/$/, "");
if (shots) mkdirSync(shots, { recursive: true });

const PAGES = ["/", "/products", "/products/execute", "/blog", "/about", "/contact", "/privacy", "/terms", "/admin", "/no-such-page"];
const WIDTHS = [
  ["phone", 390, 844],
  ["tablet", 820, 1180],
  ["desktop", 1440, 900],
];
const REDIRECTS = { "/what": "/about", "/beta": "/products/execute", "/builders": "/contact", "/legal": "/terms" };

// Posts come from the feed, so drafts are covered when the build shows them.
const feed = await fetch(`${base}/blog/rss.xml`).then((r) => (r.ok ? r.text() : ""));
for (const [, link] of feed.matchAll(/<link>https:\/\/agmt\.legal(\/blog\/[^<]+)<\/link>/g)) PAGES.push(link);

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
);
const problems = [];

for (const scheme of ["light", "dark"]) {
  for (const [label, width, height] of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
    page.on("pageerror", (err) => errors.push(String(err)));

    for (const path of PAGES) {
      errors.length = 0;
      const response = await page.goto(base + path, { waitUntil: "networkidle" });
      const status = response?.status() ?? 0;
      if (path === "/no-such-page" ? status !== 404 : status !== 200) problems.push(`${path}: HTTP ${status}`);

      // Scroll through the page so lazy images load, then wait for them.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
        window.scrollTo(0, 0);
        await Promise.all(
          [...document.images]
            .filter((img) => !img.complete)
            .map(
              (img) =>
                new Promise((done) => {
                  img.addEventListener("load", done, { once: true });
                  img.addEventListener("error", done, { once: true });
                }),
            ),
        );
      });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${path} @${label}/${scheme}: ${overflow}px sideways scroll`);

      const broken = await page.evaluate(() =>
        [...document.images].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src),
      );
      for (const src of broken) problems.push(`${path} @${label}: broken image ${src}`);

      const real = errors.filter((e) => !(path === "/no-such-page" && /404/.test(e)));
      for (const e of real) problems.push(`${path} @${label}/${scheme}: console error: ${e}`);

      if (shots) {
        const name = `${path === "/" ? "home" : path.slice(1).replaceAll("/", "-")}-${label}-${scheme}.png`;
        await page.screenshot({ path: join(shots, name), fullPage: true });
      }
    }
    await context.close();
  }
}

// Old addresses move permanently.
const context = await browser.newContext();
for (const [from, to] of Object.entries(REDIRECTS)) {
  const res = await context.request.get(base + from, { maxRedirects: 0 });
  const location = res.headers().location ?? "";
  if (res.status() !== 301 || !location.endsWith(to)) problems.push(`${from}: expected 301 to ${to}, got ${res.status()} ${location}`);
}
await context.close();
await browser.close();

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`✓ ${PAGES.length} pages × ${WIDTHS.length} widths × 2 themes, and ${Object.keys(REDIRECTS).length} redirects`);
