import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBrowserProofPrototype } from "./build.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "..");
const evidencePath = join(here, "evidence.json");
const distJs = join(here, "dist/browser-proof.js");
const htmlPath = join(here, "index.html");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(message) {
  throw new Error(message);
}

async function withServer(handler) {
  const js = readFileSync(distJs);
  const html = readFileSync(htmlPath);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/" || url.pathname === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(html);
      return;
    }
    if (url.pathname === "/dist/browser-proof.js") {
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
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

function chromiumReady(chromium) {
  try {
    chromium.executablePath();
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

function installChromium() {
  const result = spawnSync("npx", ["playwright", "install", "chromium"], {
    cwd: webRoot,
    encoding: "utf8",
    shell: true,
  });
  return result.status === 0;
}

function resolveDotnet() {
  const exe = process.platform === "win32" ? "dotnet.exe" : "dotnet";
  const candidates = [
    process.env.DOTNET_ROOT ? join(process.env.DOTNET_ROOT, exe) : null,
    join(homedir(), ".dotnet", exe),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  const probe = spawnSync("dotnet", ["--version"], { encoding: "utf8", shell: true });
  return probe.status === 0 ? "dotnet" : null;
}

function runSdk(sourcePath, outputPath, sourceSha, outputSha) {
  const dotnet = resolveDotnet();
  if (!dotnet) return { ran: false, code: "runtime_unavailable" };
  const csproj = join(repoRoot, "infra/proof/validator/ProofValidator.csproj");
  const env = { ...process.env };
  if (dotnet !== "dotnet") env.DOTNET_ROOT = dirname(dotnet);
  const result = spawnSync(
    dotnet,
    ["run", "--project", csproj, "--", "--source", sourcePath, "--output", outputPath, "--source-sha256", sourceSha, "--output-sha256", outputSha, "--target", "Office2016"],
    { encoding: "utf8", env, timeout: 60_000, shell: false },
  );
  const line = (result.stdout || "").trim().split(/\r?\n/).at(-1) || "";
  try {
    return { ran: true, ...JSON.parse(line) };
  } catch {
    return { ran: true, code: "invalid_package", stdout: line, stderr: result.stderr };
  }
}

function runWord(outputDir) {
  const script = join(webRoot, "scripts/proof-word-verify.ps1");
  if (process.platform !== "win32") return { ran: false, code: "not_windows" };
  const result = spawnSync("powershell.exe", ["-NoProfile", "-File", script, "-Root", outputDir], {
    encoding: "utf8",
    timeout: 120_000,
  });
  return {
    ran: result.status !== 2,
    status: result.status,
    stdout: (result.stdout || "").trim(),
    missing: result.status === 2,
  };
}

async function nodeReference(kind) {
  const { launchFixture } = await import("../../src/lib/agmt/corpus/launch-fixtures.ts");
  const { exportProofDocx } = await import("../../src/lib/agmt/export/docx.ts");
  const JSZip = (await import("jszip")).default;
  const source = await launchFixture(kind);
  const exported = await exportProofDocx(source, new Date("2026-09-05T00:00:00Z"));
  const xml = await (await JSZip.loadAsync(exported.bytes)).file("word/document.xml").async("string");
  return {
    sourceSha256: sha256(source),
    outputSha256: sha256(exported.bytes),
    documentXmlSha256: sha256(Buffer.from(xml, "utf8")),
    corrections: exported.receipt.plan.findings.filter((finding) => finding.kind === "correction").length,
    comments: exported.receipt.commentIds.length,
    revisionIds: exported.receipt.revisionIds,
  };
}

async function runPage(page, origin, kinds) {
  await page.goto(origin, { waitUntil: "load" });
  const ready = await page.evaluate(() => Boolean(window.__agmtProofPrototype));
  if (!ready) fail("prototype_engine_missing");
  const fixtures = {};
  for (const kind of kinds) {
    fixtures[kind] = await page.evaluate(async (name) => {
      try {
        return await window.__agmtProofPrototype.runFixture(name);
      } catch (error) {
        return { label: name, ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }, kind);
  }
  const refusals = await page.evaluate(async () => window.__agmtProofPrototype.runRefusals());
  const storage = await page.evaluate(async () => {
    const dbs = indexedDB.databases ? await indexedDB.databases() : [];
    return { ...window.__agmtProofPrototype.storageSnapshot(), indexedDB: dbs };
  });
  return { fixtures, refusals, storage };
}

function stripPayload(result) {
  const { outputBase64, sourceBase64, downloadUrl, ...rest } = result;
  void outputBase64;
  void sourceBase64;
  void downloadUrl;
  return rest;
}

async function main() {
  const abc = sha256(Buffer.from("abc"));
  const { sha256Hex } = await import("./shims/sha256.ts");
  const shimAbc = sha256Hex("abc");
  if (shimAbc !== abc) fail(`sha256_shim_mismatch ${shimAbc} ${abc}`);

  const build = await buildBrowserProofPrototype();
  const playwright = await loadPlaywright();
  if (!playwright) fail("playwright_missing");
  if (!chromiumReady(playwright.chromium)) {
    if (!installChromium() || !chromiumReady(playwright.chromium)) fail("chromium_missing");
  }

  const kinds = ["body", "split_runs", "table", "prior_review", "party_name"];
  const requests = { desktop: [], mobile: [] };
  const blocked = { desktop: [], mobile: [] };

  const browser = await playwright.chromium.launch({
    args: ["--enable-precise-memory-info"],
  });
  let desktop;
  let mobile;
  try {
    await withServer(async (origin) => {
      const desktopContext = await browser.newContext();
      desktopContext.on("request", (request) => requests.desktop.push(request.url()));
      await desktopContext.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith(origin) && (url === origin || url === `${origin}index.html` || url.endsWith("/dist/browser-proof.js"))) {
          return route.continue();
        }
        blocked.desktop.push(url);
        return route.abort();
      });
      const desktopPage = await desktopContext.newPage();
      desktop = await runPage(desktopPage, origin, [...kinds, "medium_repeat", "large_repeat"]);
      await desktopContext.close();

      const mobileContext = await browser.newContext({
        ...playwright.devices["iPhone 13"],
      });
      mobileContext.on("request", (request) => requests.mobile.push(request.url()));
      await mobileContext.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith(origin) && (url === origin || url === `${origin}index.html` || url.endsWith("/dist/browser-proof.js"))) {
          return route.continue();
        }
        blocked.mobile.push(url);
        return route.abort();
      });
      const mobilePage = await mobileContext.newPage();
      mobile = await runPage(mobilePage, origin, kinds);
      await mobileContext.close();
    });
  } finally {
    await browser.close();
  }

  const outputDir = join(tmpdir(), "agmt-browser-proof-prototype");
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  const sdk = {};
  const node = {};
  for (const kind of kinds) {
    const result = desktop.fixtures[kind];
    if (!result?.ok) continue;
    const sourcePath = join(outputDir, `${kind}.docx`);
    const outputPath = join(outputDir, `${kind}_Proofread.docx`);
    writeFileSync(sourcePath, Buffer.from(result.sourceBase64, "base64"));
    writeFileSync(outputPath, Buffer.from(result.outputBase64, "base64"));
    sdk[kind] = runSdk(sourcePath, outputPath, result.sourceSha256, result.outputSha256);
    node[kind] = await nodeReference(kind);
    const JSZip = (await import("jszip")).default;
    const xml = await (await JSZip.loadAsync(Buffer.from(result.outputBase64, "base64"))).file("word/document.xml").async("string");
    node[kind].browserDocumentXmlSha256 = sha256(Buffer.from(xml, "utf8"));
    node[kind].xmlMatchesNode = node[kind].documentXmlSha256 === node[kind].browserDocumentXmlSha256;
    node[kind].findingsMatchNode = node[kind].corrections === result.corrections && node[kind].comments === result.comments;
  }
  const word = runWord(outputDir);

  const desktopOk = kinds.every((kind) => desktop.fixtures[kind]?.ok);
  const mobileOk = kinds.every((kind) => mobile.fixtures[kind]?.ok);
  const markupOk = ["body", "table", "prior_review"].every((kind) => desktop.fixtures[kind]?.hasIns && desktop.fixtures[kind]?.hasDel && desktop.fixtures[kind]?.hasCommentRange);
  const splitOk = desktop.fixtures.split_runs?.hasDel && desktop.fixtures.split_runs?.hasCommentRange;
  const partyOk = desktop.fixtures.party_name?.corrections === 0 && desktop.fixtures.party_name?.comments === 0;
  const refusalsOk = desktop.refusals.eicar.ok && desktop.refusals.macro.ok && desktop.refusals.entity.ok;
  const noDocumentNetwork = blocked.desktop.length === 0 && blocked.mobile.length === 0
    && desktop.storage.networkAttempts.length === 0 && mobile.storage.networkAttempts.length === 0;
  const noPersistentStorage = desktop.storage.localStorageKeys.length === 0
    && desktop.storage.sessionStorageKeys.length === 0
    && (desktop.storage.indexedDB?.length ?? 0) === 0
    && desktop.storage.storageWrites.length === 0;
  const xmlParity = kinds.every((kind) => node[kind]?.xmlMatchesNode && node[kind]?.findingsMatchNode);
  const sdkRan = Object.values(sdk).some((item) => item.ran);
  const sdkOk = sdkRan && kinds.every((kind) => !sdk[kind] || sdk[kind].code === "ok" || sdk[kind].code === "runtime_unavailable");

  const engineFeasible = desktopOk && mobileOk && markupOk && splitOk && partyOk && refusalsOk && noDocumentNetwork && noPersistentStorage && xmlParity;
  const recommendation = engineFeasible ? "conditional_go_local_processing" : "no_go";

  const evidence = {
    prototype: "proof-browser-local-v1",
    launchReady: false,
    productionArchitectureRewritten: false,
    hostingerUsed: false,
    cloudflareContainersProvisioned: false,
    uploadsEnabled: false,
    recommendation,
    sha256ShimMatchesNode: true,
    build,
    desktop: {
      ok: desktopOk,
      fixtures: Object.fromEntries(Object.entries(desktop.fixtures).map(([name, result]) => [name, stripPayload(result)])),
      refusals: desktop.refusals,
      storage: desktop.storage,
      requests: requests.desktop,
      blocked: blocked.desktop,
    },
    mobile: {
      ok: mobileOk,
      viewport: "iPhone 13 emulation in Chromium; not a physical iPhone",
      fixtures: Object.fromEntries(Object.entries(mobile.fixtures).map(([name, result]) => [name, stripPayload(result)])),
      refusals: mobile.refusals,
      storage: mobile.storage,
      requests: requests.mobile,
      blocked: blocked.mobile,
    },
    nodeParity: node,
    sdkHostSide: sdk,
    wordHostSide: word,
    checks: {
      parseAndMap: desktopOk,
      runExistingRules: desktopOk && partyOk,
      trackedChangesAndComments: markupOk && splitOk,
      preserveStructures: desktop.fixtures.prior_review?.ok === true,
      jsIndependentValidation: desktopOk,
      downloadableDocx: desktopOk && mobileOk,
      sdkInBrowser: false,
      wordComInBrowser: false,
      clamavInBrowser: false,
      documentBytesOnAgmtServers: false,
      documentBytesInAnalytics: false,
      documentBytesInPersistentBrowserStorage: !noPersistentStorage,
      xmlParityWithNodeEngine: xmlParity,
      localMalwareRefusals: refusalsOk,
      sdkHostValidation: sdkOk,
      twentyFiveMibNotMeasured: true,
    },
    resources: {
      bundleBytes: build.bundleBytes,
      mediumRepeat: {
        sourceBytes: desktop.fixtures.medium_repeat?.sourceBytes,
        durationMs: desktop.fixtures.medium_repeat?.durationMs,
        heapBefore: desktop.fixtures.medium_repeat?.heapBefore,
        heapAfter: desktop.fixtures.medium_repeat?.heapAfter,
      },
      largeRepeat: {
        sourceBytes: desktop.fixtures.large_repeat?.sourceBytes,
        durationMs: desktop.fixtures.large_repeat?.durationMs,
        heapBefore: desktop.fixtures.large_repeat?.heapBefore,
        heapAfter: desktop.fixtures.large_repeat?.heapAfter,
      },
      twentyFiveMib: "not_run",
      note: "A 1.02 MiB synthetic used about 102 MiB extra JS heap. 25 MiB is not demonstrated and would likely exceed typical mobile memory if the same XML-tree pattern holds.",
    },
    cannotRunInBrowser: [
      {
        name: "DocumentFormat.OpenXml 3.5.1 / ProofValidator.exe",
        kind: "native_.net",
        requiredCheck: "PWC-12 schema validation before publication",
        browserStatus: "cannot_run",
        hostSideOnPrototypeOutput: sdk,
      },
      {
        name: "ClamAV",
        kind: "native_scanner",
        requiredCheck: "PWC-22 authoritative malware scan",
        browserStatus: "cannot_run",
        substitute: "local ZIP/XML/active-content/EICAR only; not a clean ClamAV receipt",
      },
      {
        name: "Microsoft Word COM",
        kind: "native_windows",
        requiredCheck: "PWC-13 Word fidelity",
        browserStatus: "cannot_run",
        hostSideOnPrototypeOutput: word,
      },
      {
        name: "node:zlib inflateRawSync",
        kind: "node_builtin",
        requiredCheck: "bounded ZIP inflation",
        browserStatus: "shimmed_with_pako_plus_maxOutputLength",
      },
      {
        name: "node:crypto createHash",
        kind: "node_builtin",
        requiredCheck: "source/output SHA-256",
        browserStatus: "shimmed_with_pure_js_sha256",
      },
      {
        name: "node:assert/strict",
        kind: "node_builtin",
        requiredCheck: "independent JS package/reconstruction validator",
        browserStatus: "shimmed",
      },
      {
        name: "Node Buffer",
        kind: "node_global",
        requiredCheck: "byte handling throughout the engine",
        browserStatus: "shimmed_uint8array_subclass",
      },
      {
        name: "web/src/lib/agmt/crypto.ts envelope encryption",
        kind: "server_secret",
        requiredCheck: "must not enter the browser bundle",
        browserStatus: "excluded_from_bundle",
      },
    ],
  };
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify({
    recommendation,
    desktopOk,
    mobileOk,
    markupOk,
    refusalsOk,
    noDocumentNetwork,
    noPersistentStorage,
    xmlParity,
    sdk: Object.fromEntries(Object.entries(sdk).map(([name, item]) => [name, item.code || item])),
    word: word.stdout || word,
    mediumMs: desktop.fixtures.medium_repeat?.durationMs,
    mediumHeapAfter: desktop.fixtures.medium_repeat?.heapAfter,
    largeBytes: desktop.fixtures.large_repeat?.sourceBytes,
    largeMs: desktop.fixtures.large_repeat?.durationMs,
    largeHeapAfter: desktop.fixtures.large_repeat?.heapAfter,
    bundleBytes: build.bundleBytes,
  }, null, 2));
  if (recommendation === "no_go") process.exitCode = 1;
}

await main();
