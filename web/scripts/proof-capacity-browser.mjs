/**
 * Chromium capacity measurement. Lab policy. Not a published claim.
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const distDir = join(here, "proof-capacity-dist");
const require = createRequire(join(webRoot, "..", "package.json"));
const esbuild = require("esbuild");
const mode = process.env.PROOF_CAPACITY_MODE ?? "image";
const sizes = (process.env.PROOF_CAPACITY_BROWSER_MIB ?? "8,25")
  .split(",")
  .map((value) => Number(value) * 1024 * 1024)
  .filter((value) => value > 0);

mkdirSync(distDir, { recursive: true });
const platform = join(webRoot, "src/lib/platform");
await esbuild.build({
  absWorkingDir: webRoot,
  entryPoints: [join(here, "proof-capacity-browser-entry.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  outfile: join(distDir, "capacity.js"),
  sourcemap: false,
  logLevel: "silent",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "node:crypto": join(platform, "node-crypto.ts"),
    "node:assert/strict": join(platform, "node-assert.ts"),
    "node:assert": join(platform, "node-assert.ts"),
    "node:zlib": join(platform, "node-zlib.ts"),
  },
  plugins: [{
    name: "agmt-proof-capacity-guards",
    setup(buildApi) {
      const envelope = join(platform, "envelope-forbidden.ts");
      buildApi.onResolve({ filter: /crypto\.ts$/ }, (args) => {
        const importer = (args.importer || "").split(/[/\\]/).join("/");
        if (importer.includes("/src/lib/agmt/")) return { path: envelope };
      });
    },
  }],
});

const js = readFileSync(join(distDir, "capacity.js"));
const html = `<!doctype html><meta charset="utf-8"><title>Proof capacity</title><script src="/capacity.js"></script>`;
const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  if (url.pathname === "/capacity.js") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    response.end(js);
    return;
  }
  response.writeHead(404);
  response.end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const playwright = await import("playwright");
const browser = await playwright.chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(300_000);
await page.goto(`http://127.0.0.1:${port}/`);
const rows = [];
if (mode !== "agreements") {
  for (const target of sizes) {
    const result = await page.evaluate(async (bytes) => {
      const api = globalThis.__agmtCapacity;
      const heapBefore = performance.memory?.usedJSHeapSize ?? null;
      const started = performance.now();
      try {
        const outcome = await api.runImageHeavy(bytes);
        return {
          ...outcome,
          elapsedMs: Math.round(performance.now() - started),
          heapBefore,
          heapAfter: performance.memory?.usedJSHeapSize ?? null,
        };
      } catch (error) {
        return {
          outcome: error instanceof Error ? error.message : "error",
          elapsedMs: Math.round(performance.now() - started),
          heapBefore,
          heapAfter: performance.memory?.usedJSHeapSize ?? null,
        };
      }
    }, target);
    rows.push({ targetBytes: target, ...result, viewport: "desktop" });
    console.log(JSON.stringify({ targetMiB: target / (1024 * 1024), ...result }));
  }
}
if (mode === "agreements" || mode === "all") {
  const pages = (process.env.PROOF_AGREEMENT_PAGES ?? "25,75,150,300").split(",").map((value) => Number(value));
  const kinds = ["labelled", "clean"];
  for (const pageCount of pages) {
    for (const kind of kinds) {
      const result = await page.evaluate(async ([targetPages, targetKind]) => {
        const api = globalThis.__agmtCapacity;
        const heapBefore = performance.memory?.usedJSHeapSize ?? null;
        const started = performance.now();
        const outcome = await api.runAgreement(targetPages, targetKind);
        return {
          ...outcome,
          elapsedMs: Math.round(performance.now() - started),
          heapBefore,
          heapAfter: performance.memory?.usedJSHeapSize ?? null,
        };
      }, [pageCount, kind]);
      rows.push({ pages: pageCount, kind, ...result, viewport: "desktop" });
      console.log(JSON.stringify({ pages: pageCount, kind, outcome: result.outcome, elapsedMs: result.elapsedMs, documentXmlBytes: result.documentXmlBytes, extractedCodePoints: result.extractedCodePoints }));
    }
  }
}
await browser.close();
await new Promise((resolve) => server.close(resolve));
const evidencePath = join(webRoot, "src/lib/proof-local", mode === "agreements" ? "capacity-evidence-chromium-agreements.json" : "capacity-evidence-chromium.json");
writeFileSync(evidencePath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  host: "chromium",
  policy: mode === "agreements" ? "PROOF_LOCAL_POLICY_DESKTOP" : "PROOF_LOCAL_POLICY_LAB",
  rows,
}, null, 2));
console.log(`wrote ${evidencePath}`);
if (rows.some((row) => row.outcome !== "ok")) process.exit(1);
void spawnSync;
