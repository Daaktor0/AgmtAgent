import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const distDir = join(here, "proof-local-dist");
const evidencePath = join(webRoot, "src/lib/proof-local/evidence.json");
const require = createRequire(join(repoRoot, "package.json"));
const esbuild = require("esbuild");

function fail(message) {
  throw new Error(message);
}

async function buildHarness() {
  mkdirSync(distDir, { recursive: true });
  const platform = join(webRoot, "src/lib/platform");
  const result = await esbuild.build({
    absWorkingDir: webRoot,
    entryPoints: [join(here, "proof-local-harness.ts")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    outfile: join(distDir, "proof-local.js"),
    sourcemap: false,
    metafile: true,
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "node:crypto": join(platform, "node-crypto.ts"),
      "node:assert/strict": join(platform, "node-assert.ts"),
      "node:assert": join(platform, "node-assert.ts"),
      "node:zlib": join(platform, "node-zlib.ts"),
    },
    plugins: [{
      name: "agmt-proof-local-guards",
      setup(buildApi) {
        const envelope = join(platform, "envelope-forbidden.ts");
        buildApi.onResolve({ filter: /crypto\.ts$/ }, (args) => {
          const importer = (args.importer || "").split(/[/\\]/).join("/");
          if (importer.includes("/src/lib/agmt/")) return { path: envelope };
        });
        buildApi.onResolve({ filter: /runtime-env\.server/ }, () => ({
          errors: [{ text: "runtime-env.server must not enter the browser Proof bundle" }],
        }));
      },
    }],
  });
  const inputs = Object.keys(result.metafile.inputs).map((file) => file.split(/[/\\]/).join("/"));
  const leaked = inputs.filter((file) =>
    /proof-antivirus|proof-service|runtime-env\.server|agmt\/crypto\.ts|ProofValidator/.test(file),
  );
  if (leaked.length) fail(`production harness leaked forbidden files: ${leaked.join(", ")}`);
  const js = readFileSync(join(distDir, "proof-local.js"), "utf8");
  if (/ClamAV|createCipheriv|hstgr\.cloud/.test(js)) fail("production harness contains forbidden tokens");
  return { bundleBytes: readFileSync(join(distDir, "proof-local.js")).byteLength, leaked, inputs: inputs.length };
}

function html() {
  return `<!doctype html><meta charset="utf-8"><title>Agmt Proof local release harness</title>
<p>Production engine harness. Not a product route.</p>
<script src="/proof-local.js"></script>`;
}

async function withServer(handler) {
  const js = readFileSync(join(distDir, "proof-local.js"));
  const page = html();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/" || url.pathname === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(page);
      return;
    }
    if (url.pathname === "/proof-local.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      response.end(js);
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : fail("no_port");
  try {
    return await handler(`http://127.0.0.1:${port}/`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function loadPlaywright() {
  try { return await import("playwright"); } catch { return null; }
}

function resolveDotnet() {
  const exe = process.platform === "win32" ? "dotnet.exe" : "dotnet";
  const candidates = [
    process.env.DOTNET_ROOT ? join(process.env.DOTNET_ROOT, exe) : null,
    join(homedir(), ".dotnet", exe),
    "C:\\Program Files\\dotnet\\dotnet.exe",
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  const probe = spawnSync(exe, ["--version"], { encoding: "utf8" });
  return probe.status === 0 ? exe : null;
}

function runSdk(sourceBytes, outputBytes, label) {
  const dotnet = resolveDotnet();
  const csproj = join(repoRoot, "infra/proof/validator/ProofValidator.csproj");
  if (!dotnet || !existsSync(csproj)) return { label, ok: false, error: "sdk_runtime_unavailable" };
  const dir = join(webRoot, "tmp-proof-local-sdk");
  mkdirSync(dir, { recursive: true });
  const sourcePath = join(dir, `${label}.docx`);
  const outputPath = join(dir, `${label}_Proofread.docx`);
  writeFileSync(sourcePath, sourceBytes);
  writeFileSync(outputPath, outputBytes);
  const env = { ...process.env };
  if (dotnet !== "dotnet" && dotnet !== "dotnet.exe") env.DOTNET_ROOT = dirname(dotnet);
  const result = spawnSync(
    dotnet,
    ["run", "--project", csproj, "--", "--source", sourcePath, "--output", outputPath, "--source-sha256", createHash("sha256").update(sourceBytes).digest("hex"), "--output-sha256", createHash("sha256").update(outputBytes).digest("hex"), "--target", "Office2016"],
    { encoding: "utf8", env, timeout: 60_000 },
  );
  const line = (result.stdout || "").trim().split(/\r?\n/).at(-1) || "";
  try {
    const parsed = JSON.parse(line);
    return { label, ok: parsed.ok !== false && parsed.code !== "invalid_package", ...parsed };
  } catch {
    return { label, ok: result.status === 0, stdout: line.slice(0, 500), stderr: (result.stderr || "").slice(0, 500) };
  }
}

function runWord(dir) {
  const script = join(here, "proof-word-verify.ps1");
  if (process.platform !== "win32") return { ok: false, error: "not_windows" };
  const result = spawnSync("powershell.exe", ["-NoProfile", "-File", script, "-Root", dir], {
    encoding: "utf8",
    timeout: 120_000,
  });
  return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function decode(base64) {
  return Buffer.from(base64, "base64");
}

async function runPage(browser, origin, viewport) {
  const page = await browser.newPage(viewport ? { viewport } : {});
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(origin, { waitUntil: "load" });
  const result = await page.evaluate(async () => {
    const api = globalThis.__agmtProofLocal;
    return api.runAll();
  });
  const storage = await page.evaluate(() => ({
    localStorage: Object.keys(localStorage),
    sessionStorage: Object.keys(sessionStorage),
  }));
  await page.close();
  return { result, requests, storage };
}

const build = await buildHarness();
const playwright = await loadPlaywright();
if (!playwright) fail("playwright_unavailable");
const browser = await playwright.chromium.launch();
const desktop = await withServer((origin) => runPage(browser, origin));
const mobile = await withServer((origin) => runPage(browser, origin, { width: 390, height: 844, isMobile: true }));
await browser.close();

const wordDir = join(webRoot, "tmp-proof-local-word");
rmSync(wordDir, { recursive: true, force: true });
mkdirSync(wordDir, { recursive: true });
const sdk = [];
for (const [kind, fixture] of Object.entries(desktop.result.fixtures)) {
  if (!fixture.ok || !fixture.outputBase64) continue;
  const output = decode(fixture.outputBase64);
  const source = decode(fixture.sourceBase64);
  writeFileSync(join(wordDir, `${kind}.docx`), source);
  writeFileSync(join(wordDir, `${kind}_Proofread.docx`), output);
  sdk.push(runSdk(source, output, kind));
}
const word = runWord(wordDir);

const evidence = {
  launchReady: false,
  architecture: "browser_only",
  hostingerUsed: false,
  cloudflareContainersProvisioned: false,
  supportedLimit: { maxSourceBytes: 1_048_576, label: "1 MiB", maxExpandedBytes: 16_777_216 },
  browsers: {
    chromium: "tested",
    firefox: "not_run_this_session",
    safari: "not_run",
    iosSafari: "not_run_physical_device",
    mobileViewport: "Chromium iPhone-width emulation only",
  },
  build,
  desktop: {
    ok: Object.values(desktop.result.fixtures).every((item) => item.ok)
      && Object.values(desktop.result.refusals).every((item) => item.ok)
      && desktop.storage.localStorage.length === 0
      && desktop.storage.sessionStorage.length === 0,
    fixtures: desktop.result.fixtures,
    refusals: desktop.result.refusals,
    requests: desktop.requests,
    storage: desktop.storage,
  },
  mobile: { ok: Object.values(mobile.result.fixtures).every((item) => item.ok), viewport: "390x844 Chromium emulation" },
  sdk,
  word,
  sha256Harness: createHash("sha256").update(readFileSync(join(distDir, "proof-local.js"))).digest("hex"),
};

writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({
  desktopOk: evidence.desktop.ok,
  mobileOk: evidence.mobile.ok,
  sdk: sdk.map((item) => ({ label: item.label, ok: item.ok })),
  wordOk: word.ok,
  wordOut: word.stdout,
  bundleBytes: build.bundleBytes,
}, null, 2));
if (!evidence.desktop.ok) process.exit(1);
