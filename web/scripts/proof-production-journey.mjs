#!/usr/bin/env node
/**
 * Signed-in production Proof journey against https://app.agmt.legal/proof.
 * Waits for rendered controls and processing states. Never uses networkidle.
 * Never prints passwords, tokens, cookies or document bytes.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import JSZip from "jszip";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const workDir = join(webRoot, "tmp-proof-production");
const fixtureDir = join(workDir, "fixtures");
const downloadDir = join(workDir, "downloads");
const reportPath = join(workDir, "report.json");
const ORIGIN = (process.env.AGMT_PROOF_ORIGIN || "https://app.agmt.legal").replace(/\/+$/, "");
const PROOF_URL = `${ORIGIN}/proof`;
const LOGIN_URL = `${ORIGIN}/login?returnTo=%2Fproof`;
const NEEDLES = [
  "recieve",
  "Clause 99.2",
  "Recieve Private Limited",
  "body.docx",
  "party_name.docx",
  "split_runs.docx",
  "prior_review.docx",
  "hostile_vba.docx",
  "cancel_load.docx",
  "oversized.docx",
];
const ANALYTICS_HOSTS = /fullstory|session.?replay|hotjar|logrocket|posthog|sentry\.io|datadog|google-analytics|googletagmanager|segment\.com|mixpanel|amplitude/i;
const FIRST_PARTY = new Set([new URL(ORIGIN).host, "agmt.dexterinlab.workers.dev"]);
const require = createRequire(join(repoRoot, "package.json"));

function fail(message) {
  throw new Error(message);
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return "invalid-url";
  }
}

function classifyHost(url) {
  try {
    const host = new URL(url).host;
    if (FIRST_PARTY.has(host)) return "first_party";
    if (host.endsWith(".agmt.legal")) return "first_party";
    if (host.includes("cloudflare") || url.includes("/cdn-cgi/")) return "cloudflare_platform";
    if (host === "grok.com" || host.endsWith(".grok.com")) return "grok_platform_chrome";
    return "third_party";
  } catch {
    return "unknown";
  }
}

function containsNeedle(value) {
  if (!value) return [];
  const text = String(value);
  return NEEDLES.filter((needle) => text.includes(needle));
}

async function writeFixtures() {
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(fixtureDir, { recursive: true });
  mkdirSync(downloadDir, { recursive: true });
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", join(here, "write-proof-production-fixtures.ts"), fixtureDir],
    { cwd: webRoot, encoding: "utf8" },
  );
  if (result.status !== 0) fail(`fixture write failed: ${result.stderr || result.stdout}`);
}

function loadCredentials() {
  const envPath = join(webRoot, ".proof-production.env");
  const extra = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) extra[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  const email = (process.env.AGMT_PROOF_TEST_EMAIL || extra.AGMT_PROOF_TEST_EMAIL || "").trim().replace(/^["']|["']$/g, "");
  const password = (process.env.AGMT_PROOF_TEST_PASSWORD || extra.AGMT_PROOF_TEST_PASSWORD || "").trim().replace(/^["']|["']$/g, "");
  const storageState = process.env.AGMT_PROOF_STORAGE_STATE || join(workDir, "storage-state.json");
  return {
    email,
    password,
    hasPassword: Boolean(email && password),
    storageState: existsSync(storageState) ? storageState : "",
    interactive: process.env.AGMT_PROOF_INTERACTIVE === "1",
  };
}

function liveWorkerVersion() {
  if (process.env.AGMT_PROOF_WORKER_VERSION) {
    return { version: process.env.AGMT_PROOF_WORKER_VERSION, source: "env" };
  }
  const result = spawnSync(
    "npx",
    ["wrangler", "deployments", "list", "--name", "agmt"],
    { cwd: webRoot, encoding: "utf8", timeout: 45_000 },
  );
  const matches = [...(result.stdout || "").matchAll(/\(100%\)\s+([0-9a-f-]{36})/gi)];
  const version = matches.at(-1)?.[1];
  return {
    version: version || "bf26652f-b240-4c2b-b96d-bdfd3df89d91",
    source: version ? "wrangler_deployments_100" : "last_known_100",
  };
}

function summarizeTraffic(traffic, processingObserved) {
  return {
    ok: traffic.documentLeaks.length === 0 && traffic.analytics.length === 0,
    processingObserved,
    note: processingObserved
      ? "captured_during_signed_in_processing"
      : "signed_out_page_only_processing_not_observed",
    documentLeaks: traffic.documentLeaks,
    analytics: traffic.analytics,
    application: traffic.requests
      .filter((item) => item.hostClass === "first_party")
      .slice(0, 30)
      .map((item) => item.url),
    testingPlatformInjections: traffic.requests
      .filter((item) => item.hostClass === "grok_platform_chrome")
      .map((item) => item.url),
    cloudflarePlatform: traffic.requests
      .filter((item) => item.hostClass === "cloudflare_platform")
      .map((item) => item.url),
    thirdParty: traffic.thirdParty.slice(0, 20),
    grokPlatform: traffic.requests.filter((item) => item.hostClass === "grok_platform_chrome").map((item) => item.url),
    requestCount: traffic.requests.length,
    uploadAttempts: traffic.requests.filter((item) => /\/api\/proof\/upload/.test(item.url)),
    worker: traffic.requests.filter((item) => /proof\.worker/.test(item.url)).map((item) => item.url),
  };
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
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

function runSdk(sourcePath, outputPath, label) {
  const dotnet = resolveDotnet();
  const csproj = join(repoRoot, "infra/proof/validator/ProofValidator.csproj");
  if (!dotnet || !existsSync(csproj)) return { label, ok: false, error: "sdk_runtime_unavailable" };
  const sourceBytes = readFileSync(sourcePath);
  const outputBytes = readFileSync(outputPath);
  const env = { ...process.env };
  if (dotnet !== "dotnet" && dotnet !== "dotnet.exe") env.DOTNET_ROOT = dirname(dotnet);
  const result = spawnSync(
    dotnet,
    [
      "run", "--project", csproj, "--",
      "--source", sourcePath,
      "--output", outputPath,
      "--source-sha256", createHash("sha256").update(sourceBytes).digest("hex"),
      "--output-sha256", createHash("sha256").update(outputBytes).digest("hex"),
      "--target", "Office2016",
    ],
    { encoding: "utf8", env, timeout: 60_000 },
  );
  const line = (result.stdout || "").trim().split(/\r?\n/).at(-1) || "";
  try {
    const parsed = JSON.parse(line);
    return { label, ok: parsed.ok !== false && parsed.code !== "invalid_package", ...parsed };
  } catch {
    return { label, ok: result.status === 0, stdout: line.slice(0, 400), stderr: (result.stderr || "").slice(0, 400) };
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

async function inspectDocx(path) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const xml = await zip.file("word/document.xml")?.async("string") ?? "";
  const comments = await zip.file("word/comments.xml")?.async("string") ?? "";
  return {
    hasIns: /<w:ins\b/.test(xml),
    hasDel: /<w:del\b/.test(xml),
    hasCommentRange: /<w:commentRangeStart\b/.test(xml),
    agmtAuthor: /w:author="Agmt Proof"/.test(xml) || /w:author="Agmt Proof"/.test(comments),
    priorAuthor: /Prior Reviewer/.test(xml) || /Prior Reviewer/.test(comments),
    priorCommentId0: /w:id="0"/.test(xml),
    hasTable: /<w:tbl\b/.test(xml),
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    bytes: readFileSync(path).byteLength,
  };
}

function attachTraffic(page, traffic) {
  page.on("request", (request) => {
    const post = request.postData() || "";
    const url = request.url();
    const needles = [...containsNeedle(url), ...containsNeedle(post)];
    const record = {
      method: request.method(),
      url: redactUrl(url),
      resourceType: request.resourceType(),
      hostClass: classifyHost(url),
      postBytes: post ? Buffer.byteLength(post) : 0,
      needles,
    };
    traffic.requests.push(record);
    if (needles.length && !url.includes("/api/auth/")) traffic.documentLeaks.push(record);
    if (ANALYTICS_HOSTS.test(url)) traffic.analytics.push(record);
    if (record.hostClass === "third_party") traffic.thirdParty.push(record);
    if (/\/api\/proof\/(upload|source|runs)/i.test(url) && request.method() !== "GET") {
      traffic.documentLeaks.push({ ...record, reason: "proof_upload_endpoint" });
    }
  });
  page.on("requestfailed", (request) => {
    traffic.failed.push({ url: redactUrl(request.url()), error: request.failure()?.errorText || "failed" });
  });
}

async function storageSnapshot(page) {
  return page.evaluate(async () => {
    const databases = indexedDB.databases ? await indexedDB.databases() : [];
    return {
      localStorage: Object.keys(localStorage),
      sessionStorage: Object.keys(sessionStorage),
      indexedDB: databases.map((item) => item.name || ""),
      cookieNames: document.cookie ? document.cookie.split(";").map((part) => part.split("=")[0].trim()).filter(Boolean) : [],
    };
  });
}

function storageHoldsDocument(snapshot) {
  const keys = [...snapshot.localStorage, ...snapshot.sessionStorage, ...snapshot.indexedDB];
  return keys.filter((key) => /proof|docx|document|filename|finding/i.test(key) && key !== "agmt.proof.run-pointer");
}

async function waitForProofControls(page) {
  await page.goto(PROOF_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByRole("heading", { name: "Proofread your Word document." }).waitFor({ timeout: 30_000 });
  await page.getByLabel("Choose a Word document").waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "Proofread document" }).waitFor({ timeout: 15_000 });
  await page.getByText("Processing happens on this device.").first().waitFor({ timeout: 15_000 });
}

async function waitAuthSettled(page) {
  const loading = page.getByText("Checking your sign-in…", { exact: true });
  try {
    await loading.waitFor({ state: "hidden", timeout: 20_000 });
  } catch {
    /* still loading is reported by the caller */
  }
}

async function waitLoginFormInteractive(page) {
  await page.getByLabel("Email").waitFor({ timeout: 15_000 });
  const create = page.getByRole("button", { name: "Need an account? Create one" });
  await create.waitFor({ timeout: 15_000 });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await create.click();
    if (await page.getByLabel("Name").isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
      await page.getByLabel("Name").waitFor({ state: "hidden", timeout: 5_000 });
      return;
    }
    await page.waitForTimeout(250);
  }
  fail("login_form_not_interactive");
}

async function ensureVerified(page, creds, loginTimeoutMs) {
  await waitAuthSettled(page);
  const signIn = page.getByRole("link", { name: "Sign in to Agmt" });
  const unverified = page.getByText("Verify your email to use Proof.");
  if (await unverified.isVisible().catch(() => false)) fail("unverified_email");
  if (!(await signIn.isVisible().catch(() => false))) return { method: "existing_session" };

  if (creds.hasPassword) {
    await signIn.click();
    await waitLoginFormInteractive(page);
    await page.getByLabel("Email").fill(creds.email);
    await page.getByLabel("Password").fill(creds.password);
    const signInResponse = page.waitForResponse((response) => /\/api\/auth\/sign-in\/email/i.test(response.url()), { timeout: 20_000 });
    await page.getByRole("button", { name: "Sign in with email" }).click();
    const authResponse = await signInResponse.catch(() => null);
    if (!authResponse) fail("sign_in_request_not_sent");
    const proofHeading = page.getByRole("heading", { name: "Proofread your Word document." });
    const loginError = page.locator("p.text-sm.text-danger, p.text-danger");
    await proofHeading.or(loginError).waitFor({ timeout: 30_000 });
    const errorText = (await loginError.textContent().catch(() => ""))?.trim() || "";
    if (errorText) fail(`sign_in_rejected:${errorText}`);
    await proofHeading.waitFor({ timeout: 15_000 });
    await waitAuthSettled(page);
    if (await page.getByRole("link", { name: "Sign in to Agmt" }).isVisible().catch(() => false)) {
      fail("sign_in_did_not_establish_verified_session");
    }
    if (await page.getByText("Verify your email to use Proof.").isVisible().catch(() => false)) {
      fail("unverified_email");
    }
    return { method: "email_password" };
  }

  if (!creds.interactive) fail("signed_out_no_credentials");
  console.error("ACTION_REQUIRED: Sign in with a verified Agmt account in the Chromium window at /login. Do not paste the password in chat.");
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByLabel("Email").waitFor({ timeout: 15_000 });
  await page.getByRole("heading", { name: "Proofread your Word document." }).waitFor({ timeout: loginTimeoutMs });
  await waitAuthSettled(page);
  if (await page.getByRole("link", { name: "Sign in to Agmt" }).isVisible().catch(() => false)) {
    fail("interactive_sign_in_not_completed");
  }
  if (await page.getByText("Verify your email to use Proof.").isVisible().catch(() => false)) {
    fail("unverified_email");
  }
  return { method: "interactive_browser_window" };
}

async function chooseFile(page, name) {
  await page.getByLabel("Choose a Word document").setInputFiles(join(fixtureDir, name));
  await page.getByText(new RegExp(`${name.replace(".", "\\.")} ·`)).waitFor({ timeout: 10_000 });
}

async function proofread(page) {
  const button = page.getByRole("button", { name: "Proofread document" });
  if (await button.isDisabled()) fail("proofread_disabled");
  await button.click();
}

function terminalLocator(page) {
  return page.getByRole("heading", { name: "Your proofread document is ready." })
    .or(page.getByRole("heading", { name: "No issues found by the completed checks." }))
    .or(page.getByRole("heading", { name: "Your document is ready with limited coverage." }))
    .or(page.getByText("Checking was cancelled."))
    .or(page.getByText("This file could not pass our safety checks."))
    .or(page.getByText("This file exceeds the 1 MiB limit."))
    .or(page.getByText("We couldn’t finish checking this document."))
    .or(page.getByText("Proof can’t safely process this document yet."));
}

async function waitTerminal(page, timeout = 35_000) {
  await page.getByRole("button", { name: "Cancel" }).or(terminalLocator(page)).waitFor({ timeout: 10_000 });
  await terminalLocator(page).waitFor({ timeout });
  const text = await page.locator("#proof-main").innerText();
  if (text.includes("Your document is ready with limited coverage.")) return "limited";
  if (text.includes("Your proofread document is ready.")) return "ready";
  if (text.includes("No issues found by the completed checks.")) return "zero";
  if (text.includes("Checking was cancelled.")) return "cancelled";
  if (text.includes("This file could not pass our safety checks.")) return "unsafe";
  if (text.includes("This file exceeds the 1 MiB limit.")) return "too_large";
  if (text.includes("Proof can’t safely process this document yet.")) return "unsupported";
  return "failed";
}

async function downloadNamed(page, name) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    page.getByRole("button", { name: "Download Word document" }).click(),
  ]);
  const dest = join(downloadDir, name);
  await download.saveAs(dest);
  await page.getByText("Your download has started. Check your browser’s downloads.").waitFor({ timeout: 10_000 });
  return dest;
}

async function startAnother(page) {
  await page.getByRole("button", { name: "Check another document" }).or(page.getByRole("button", { name: "Choose a Word document" })).click();
  await page.getByLabel("Choose a Word document").waitFor({ timeout: 15_000 });
}

function obsoleteCopy(text) {
  const hits = [];
  if (/Uploading your document/.test(text)) hits.push("uploading_copy");
  if (/within two hours/i.test(text)) hits.push("two_hour_deletion_copy");
  if (/virus-scanned|virus scan your file|we'll scan|we will scan/i.test(text)) hits.push("virus_scan_claim");
  if (/Proof is temporarily unavailable for new uploads/.test(text)) hits.push("uploads_paused_copy");
  return hits;
}

async function runChromiumJourney(playwright, creds) {
  const traffic = { requests: [], documentLeaks: [], analytics: [], thirdParty: [], failed: [] };
  const headed = creds.interactive || process.env.AGMT_PROOF_HEADED === "1";
  const browser = await playwright.chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    acceptDownloads: true,
    ...(creds.storageState ? { storageState: creds.storageState } : {}),
  });
  const page = await context.newPage();
  attachTraffic(page, traffic);
  const cases = {};
  let signedIn = false;
  try {
    await waitForProofControls(page);
    await waitAuthSettled(page);
    const homeText = await page.locator("#proof-main").innerText();
    const signedOut = await page.getByRole("link", { name: "Sign in to Agmt" }).isVisible().catch(() => false);
    cases.home = {
      ok: homeText.includes("Choose a Word document")
        && homeText.includes("processed on this device")
        && homeText.includes("Processing happens on this device.")
        && homeText.includes("Proofread your Word document.")
        && obsoleteCopy(homeText).length === 0,
      obsolete: obsoleteCopy(homeText),
      signedOut,
    };

    await page.getByLabel("Choose a Word document").setInputFiles(join(fixtureDir, "oversized.docx"));
    await page.getByText("This file exceeds the 1 MiB limit.").waitFor({ timeout: 10_000 });
    cases.oversized = { ok: true };

    await chooseFile(page, "body.docx");
    const proofreadButton = page.getByRole("button", { name: "Proofread document" });
    if (signedOut) {
      cases.signedOutGate = { ok: await proofreadButton.isDisabled(), login: "signed_out" };
    }

    const canSignIn = creds.hasPassword || Boolean(creds.storageState) || creds.interactive;
    if (signedOut && (process.env.AGMT_PROOF_SKIP_LOGIN === "1" || !canSignIn)) {
      const storage = await storageSnapshot(page);
      cases.storage = {
        ok: storageHoldsDocument(storage).length === 0,
        snapshot: storage,
        leakedKeys: storageHoldsDocument(storage),
      };
      cases.network = summarizeTraffic(traffic, false);
      cases.login = {
        ok: true,
        outstanding: true,
        actionRequired: LOGIN_URL,
      };
      return { cases, traffic, storage, signedIn: false, e2eOutstanding: true };
    }

    const login = await ensureVerified(page, creds, Number(process.env.AGMT_PROOF_LOGIN_TIMEOUT_MS || 300_000));
    signedIn = true;
    await waitForProofControls(page);
    cases.home.login = login.method;
    await chooseFile(page, "body.docx");
    if (await proofreadButton.isDisabled()) fail("proofread_disabled_after_verified_sign_in");

    await page.getByRole("button", { name: "Choose a different file" }).click();
    await page.getByLabel("Choose a Word document").waitFor({ timeout: 10_000 });

    await chooseFile(page, "hostile_vba.docx");
    await proofread(page);
    cases.hostile = { ok: (await waitTerminal(page)) === "unsafe" };
    await page.getByRole("button", { name: "Choose a Word document" }).click();
    await page.getByLabel("Choose a Word document").waitFor({ timeout: 10_000 });

    await chooseFile(page, "cancel_load.docx");
    await proofread(page);
    const cancelButton = page.getByRole("button", { name: "Cancel" });
    await cancelButton.or(terminalLocator(page)).waitFor({ timeout: 10_000 });
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click();
      cases.cancellation = { ok: (await waitTerminal(page)) === "cancelled" };
    } else {
      cases.cancellation = { ok: false, error: "processing_finished_before_cancel" };
    }
    await page.getByRole("button", { name: "Choose a Word document" }).click();
    await page.getByLabel("Choose a Word document").waitFor({ timeout: 10_000 });

    await chooseFile(page, "body.docx");
    await proofread(page);
    const bodyState = await waitTerminal(page);
    const bodyDownload = bodyState === "ready" || bodyState === "limited"
      ? await downloadNamed(page, "body_Proofread.docx")
      : null;
    cases.body = {
      ok: bodyState === "ready" && Boolean(bodyDownload),
      state: bodyState,
      markup: bodyDownload ? await inspectDocx(bodyDownload) : null,
    };
    if (bodyDownload) writeFileSync(join(downloadDir, "body.docx"), readFileSync(join(fixtureDir, "body.docx")));
    await startAnother(page);

    await chooseFile(page, "party_name.docx");
    await proofread(page);
    const zeroState = await waitTerminal(page);
    const zeroDownload = zeroState === "zero" ? await downloadNamed(page, "party_name_Proofread.docx") : null;
    cases.zero = { ok: zeroState === "zero" && Boolean(zeroDownload), state: zeroState };
    if (zeroDownload) writeFileSync(join(downloadDir, "party_name.docx"), readFileSync(join(fixtureDir, "party_name.docx")));
    await startAnother(page);

    await chooseFile(page, "split_runs.docx");
    await proofread(page);
    const mixedState = await waitTerminal(page);
    const mixedDownload = mixedState === "ready" || mixedState === "limited"
      ? await downloadNamed(page, "split_runs_Proofread.docx")
      : null;
    cases.mixedFormat = {
      ok: (mixedState === "ready" || mixedState === "limited") && Boolean(mixedDownload),
      state: mixedState,
      markup: mixedDownload ? await inspectDocx(mixedDownload) : null,
    };
    await startAnother(page);

    await chooseFile(page, "prior_review.docx");
    await proofread(page);
    const priorState = await waitTerminal(page);
    const priorDownload = priorState === "limited" || priorState === "ready"
      ? await downloadNamed(page, "prior_review_Proofread.docx")
      : null;
    const priorMarkup = priorDownload ? await inspectDocx(priorDownload) : null;
    cases.limited = { ok: priorState === "limited" && Boolean(priorDownload), state: priorState };
    cases.existingMarkup = {
      ok: Boolean(priorDownload) && Boolean(priorMarkup?.priorAuthor) && Boolean(priorMarkup?.priorCommentId0) && Boolean(priorMarkup?.agmtAuthor),
      state: priorState,
      markup: priorMarkup,
    };
    if (priorDownload) writeFileSync(join(downloadDir, "prior_review.docx"), readFileSync(join(fixtureDir, "prior_review.docx")));
    await startAnother(page);

    await chooseFile(page, "table.docx");
    await proofread(page);
    const tableState = await waitTerminal(page);
    const tableDownload = tableState === "ready" || tableState === "limited"
      ? await downloadNamed(page, "table_Proofread.docx")
      : null;
    cases.secondRun = {
      ok: (tableState === "ready" || tableState === "limited") && Boolean(tableDownload),
      state: tableState,
      markup: tableDownload ? await inspectDocx(tableDownload) : null,
    };
    if (tableDownload) writeFileSync(join(downloadDir, "table.docx"), readFileSync(join(fixtureDir, "table.docx")));

    const storage = await storageSnapshot(page);
    cases.storage = {
      ok: storageHoldsDocument(storage).length === 0,
      snapshot: storage,
      leakedKeys: storageHoldsDocument(storage),
    };
    cases.network = summarizeTraffic(traffic, true);

    if (creds.interactive || creds.hasPassword) {
      await context.storageState({ path: join(workDir, "storage-state.json") });
    }
    return { cases, traffic, storage, signedIn, e2eOutstanding: !signedIn };
  } finally {
    await browser.close();
  }
}

const commit = spawnSync("git", ["rev-parse", "origin/main"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
const commitSubject = spawnSync("git", ["log", "-1", "--format=%s", "origin/main"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
const localCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
await writeFixtures();
const playwright = await loadPlaywright();
if (!playwright) fail("playwright_unavailable");
const creds = loadCredentials();
const chromium = await runChromiumJourney(playwright, creds);

let firefox = { tested: false, reason: "not_run" };
try {
  const browser = await playwright.firefox.launch();
  await browser.close();
  firefox = { tested: false, reason: "browser_available_not_run_signed_in" };
} catch {
  firefox = { tested: false, reason: "firefox_not_installed" };
}

const sdk = [];
for (const label of ["body", "party_name", "prior_review", "table"]) {
  const source = join(downloadDir, `${label}.docx`);
  const output = join(downloadDir, `${label}_Proofread.docx`);
  if (existsSync(source) && existsSync(output)) sdk.push(runSdk(source, output, label));
}
const word = existsSync(join(downloadDir, "body_Proofread.docx"))
  ? runWord(downloadDir)
  : { ok: false, skipped: true, error: "no_browser_download" };

const cases = chromium.cases;
const signedIn = Boolean(chromium.signedIn);
const e2eOutstanding = Boolean(chromium.e2eOutstanding) || !signedIn;
const anonymousOk = Boolean(cases.home?.ok && cases.oversized?.ok && cases.network?.ok && cases.storage?.ok);
const signedInOk = signedIn
  && Boolean(cases.body?.ok && cases.zero?.ok && cases.limited?.ok && cases.existingMarkup?.ok && cases.cancellation?.ok && cases.secondRun?.ok && cases.hostile?.ok)
  && sdk.every((item) => item.ok)
  && word.ok;
const ok = signedInOk;
const workerIdentity = liveWorkerVersion();

const report = {
  ok,
  signedIn,
  e2eOutstanding,
  anonymousOk,
  architecture: "browser_only",
  origin: ORIGIN,
  sourceCommit: commit,
  sourceSubject: commitSubject,
  lockfileCommit: commit,
  localCommit,
  workerVersion: workerIdentity.version,
  workerVersionSource: workerIdentity.source,
  workerVersionNote: "100% production deployment after GitHub Actions wrangler deploy of ca5e934; later version uploads are not 100% traffic unless wrangler deployments list says so",
  limits: { maxSourceBytes: 1_048_576, maxExpandedBytes: 16_777_216, timeoutMs: 30_000, label: "1 MiB" },
  browsers: {
    chromium: "tested",
    firefox: firefox.reason,
    safari: "not_run",
    iosSafari: "not_run_physical_device",
  },
  cases,
  sdk,
  word,
  firefox,
};

writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ok: report.ok,
  signedIn: report.signedIn,
  e2eOutstanding: report.e2eOutstanding,
  anonymousOk: report.anonymousOk,
  sourceCommit: report.sourceCommit,
  localCommit: report.localCommit,
  workerVersion: report.workerVersion,
  cases: Object.fromEntries(Object.entries(cases).map(([name, value]) => [name, { ok: value.ok, state: value.state, error: value.error }])),
  sdk: sdk.map((item) => ({ label: item.label, ok: item.ok })),
  wordOk: word.ok,
  wordOut: (word.stdout || "").trim(),
  browsers: report.browsers,
  login: cases.home?.login,
  reportPath,
}, null, 2));
if (ok) process.exit(0);
if (anonymousOk && e2eOutstanding) process.exit(2);
process.exit(1);
