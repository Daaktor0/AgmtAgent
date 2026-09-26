#!/usr/bin/env node
/**
 * The closed beta's account journey, end to end, in Chromium against a local
 * dev server in invite mode whose email goes to a file (AGMT_DEV_OUTBOX):
 *
 *   ask for access -> thank-you and founder emails -> founder approves from
 *   the decision page -> "You're in" -> set up the account -> confirm the email
 *   -> the tool opens -> sign out and back in -> forgot password -> new
 *   password works, old one doesn't -> Not yet and Decline for others -> a
 *   signed-in person who hasn't asked sees the request form -> a forwarded set-up
 *   link is useless -> the owner is always in.
 *
 * Fails on any console error, page error or Content-Security-Policy violation.
 *
 *   OUTBOX=$(mktemp) && AGMT_EXECUTE_ACCESS=invite AGMT_INVITE_SECRET=... AGMT_FEEDBACK_TO=founder@agmt.test \
 *     AUTH_EMAIL_FROM="Agmt <hello@agmt.legal>" AGMT_DEV_OUTBOX=$OUTBOX npm run dev
 *   AGMT_DEV_OUTBOX=$OUTBOX npm run execute:access-journey      SCREENSHOTS=dir to keep screenshots
 */
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { chromium } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:8080").replace(/\/+$/, "");
const OUTBOX = process.env.AGMT_DEV_OUTBOX;
if (!OUTBOX) throw new Error("Set AGMT_DEV_OUTBOX to the same file the dev server writes email to.");
const FOUNDER = process.env.FOUNDER ?? "founder@agmt.test";
const run = Date.now().toString(36);
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
let step = 0;
const shot = async (page, name) => {
  if (shots) await page.screenshot({ path: `${shots}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: true });
};
function check(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

const mail = () =>
  existsSync(OUTBOX)
    ? readFileSync(OUTBOX, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
/** How many emails the outbox holds now; pass it to mailTo to see only newer ones. */
const mark = () => mail().length;
/** The newest email to `to` whose subject matches, waiting briefly for it. */
async function mailTo(to, subject, since = 0) {
  for (let i = 0; i < 40; i += 1) {
    const found = mail()
      .slice(since)
      .filter((m) => m.to.includes(to) && subject.test(m.subject))
      .at(-1);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`FAIL: no email "${subject}" to ${to}`);
}
const link = (m, re) => {
  const found = m.text.match(re);
  if (!found) throw new Error(`FAIL: no link ${re} in "${m.subject}"`);
  return found[1] ?? found[0];
};

const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" }));
const problems = [];
const PLATFORM_SCRIPT = "https://grok.com/grok-app-builder/extensions.js";
const expected = (text) => text.includes(PLATFORM_SCRIPT) || /script-src eval from .*zod/.test(text);
const fontHost = (url) => /fonts\.(googleapis|gstatic)\.com/.test(url ?? "");

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("console", (m) => {
    const text = m.text();
    // Wrong-password and similar answers are expected 4xx responses.
    if (m.type() === "error" && !/^Failed to load resource/.test(text) && !expected(text)) problems.push(`console: ${text}`);
  });
  page.on("requestfailed", (r) => {
    if (r.url() !== PLATFORM_SCRIPT && !fontHost(r.url())) problems.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ""}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() =>
    document.addEventListener("securitypolicyviolation", (e) =>
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI} from ${e.sourceFile}:${e.lineNumber}`),
    ),
  );
  return { context, page };
}

const ready = (page, selector) => page.locator(`${selector}[data-ready='true']`).waitFor({ timeout: 60_000 });

async function askForAccess(page, person) {
  await page.goto(`${BASE}/`);
  await ready(page, "[data-testid='ask-for-access']");
  const form = page.getByTestId("ask-for-access");
  await form.getByLabel("Name").fill(person.name);
  await form.getByLabel("Work email").fill(person.email);
  await form.getByLabel("Firm or company").fill(person.firm);
  await form.getByLabel(/What do you sign/).fill("SHAs with a dozen investors");
  await form.getByRole("button", { name: "Ask for access" }).click();
  await page.getByTestId("access-sent").waitFor();
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/`);
  await ready(page, "[data-testid='sign-in']");
  const form = page.getByTestId("sign-in");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
}

async function setUpAccount(page, joinUrl, password) {
  await page.goto(joinUrl);
  await ready(page, "[data-testid='join'] form");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Password again").fill(password);
  await page.getByRole("button", { name: "Set up my account" }).click();
  await page.getByTestId("join-sent").waitFor();
}

async function decide(page, decisionUrl, action) {
  await page.goto(`${decisionUrl}?do=${action}`);
  await ready(page, "[data-testid='decision-submit']");
  await page.getByTestId("decision-submit").click();
  await page.getByTestId("decision-outcome").waitFor();
}

const toolOpen = (page) => page.locator("[data-testid='start'][data-ready='true']").waitFor({ timeout: 60_000 });

try {
  const priya = { name: "Priya Nair", email: `priya.${run}@firm.test`, firm: "Khaitan & Co" };
  const { page } = await newPage();

  await page.goto(`${BASE}/`);
  await ready(page, "[data-testid='sign-in']");
  check(await page.getByTestId("access-gate").isVisible(), "a stranger sees the gate: sign in, or ask for access");
  check((await page.getByTestId("start").count()) === 0, "the tool is not in the page before access");
  await shot(page, "gate");

  await askForAccess(page, priya);
  check((await page.getByTestId("access-sent").innerText()).includes("Your request is noted"), "the request is acknowledged on the page");
  await shot(page, "asked");
  const thanks = await mailTo(priya.email, /Thank you for your interest/);
  check(/set up your account/.test(thanks.text), "the requester gets the thank-you email");
  const notice = await mailTo(FOUNDER, new RegExp(`Access request: ${priya.name}`));
  const decisionUrl = link(notice, /Approve \(sends "You're in"\): (\S+)\?do=approve/);
  check(/\/access\//.test(decisionUrl), "the founder gets Approve / Not yet / Decline links");

  // A mail scanner opening the link changes nothing.
  const scanner = await newPage();
  await scanner.page.goto(`${decisionUrl}?do=approve`);
  await ready(scanner.page, "[data-testid='decision-submit']");
  check((await scanner.page.getByTestId("decision-status").innerText()).includes("Waiting for your decision"), "opening the decision link alone changes nothing");
  await shot(scanner.page, "decision");
  await scanner.context.close();

  await decide(page, decisionUrl, "approve");
  check((await page.getByTestId("decision-status").innerText()).includes("Approved"), "the founder approves with one button");
  check((await page.getByText("Their set-up link").count()) === 1, "the set-up link is shown to copy");
  await shot(page, "approved");
  const welcome = await mailTo(priya.email, /You're in/);
  const joinUrl = link(welcome, /Set up your account: (\S+)/);

  // Someone the email was forwarded to can't use it: the address is fixed
  // and the account only works once that inbox confirms it.
  const other = await newPage();
  await other.page.goto(joinUrl);
  await ready(other.page, "[data-testid='join'] form");
  check((await other.page.getByLabel("Email").getAttribute("readonly")) !== null, "the set-up page fixes the email to the invited address");
  await other.context.close();

  const { page: priyaPage, context: priyaContext } = await newPage();
  const beforeSetUp = mark();
  await setUpAccount(priyaPage, joinUrl, "correct horse battery staple");
  await shot(priyaPage, "check-inbox");
  await signIn(priyaPage, priya.email, "correct horse battery staple");
  await priyaPage.getByText("Confirm your email first").waitFor();
  check(true, "before confirming the email, signing in is refused and the link is resent");
  const verify = await mailTo(priya.email, /Verify your email/, beforeSetUp);
  await priyaPage.goto(link(verify, /(http\S+verify-email\S+)/));
  await toolOpen(priyaPage);
  check(true, "confirming the email signs Priya in and opens the tool");
  await shot(priyaPage, "tool-open");

  await priyaPage.getByRole("button", { name: "Sign out" }).click();
  await ready(priyaPage, "[data-testid='sign-in']");
  check(true, "sign out returns to the gate");
  await signIn(priyaPage, priya.email, "wrong password entirely");
  await priyaPage.getByText("don't match").waitFor();
  check(true, "a wrong password is refused");
  await signIn(priyaPage, priya.email, "correct horse battery staple");
  await toolOpen(priyaPage);
  check(true, "signing in with the password opens the tool");
  await priyaContext.close();

  // Forgot password.
  const { page: resetPage } = await newPage();
  await resetPage.goto(`${BASE}/`);
  await ready(resetPage, "[data-testid='sign-in']");
  await resetPage.getByTestId("sign-in").getByLabel("Email").fill(priya.email);
  await resetPage.getByRole("link", { name: "Forgot your password?" }).click();
  await ready(resetPage, "[data-testid='reset-password'] form");
  check((await resetPage.getByLabel("Email").inputValue()) === priya.email, "forgot password carries the email over");
  await resetPage.getByRole("button", { name: "Send me a link" }).click();
  await resetPage.getByTestId("reset-sent").waitFor();
  const reset = await mailTo(priya.email, /Reset your Agmt password/);
  await resetPage.goto(link(reset, /Choose a new password for Agmt: (\S+)/));
  await ready(resetPage, "[data-testid='reset-password'] form");
  await resetPage.getByLabel("New password", { exact: true }).fill("a brand new long passphrase");
  await resetPage.getByLabel("New password again").fill("a brand new long passphrase");
  await resetPage.getByRole("button", { name: "Save new password" }).click();
  await resetPage.getByTestId("reset-done").waitFor();
  await shot(resetPage, "reset-done");
  await signIn(resetPage, priya.email, "correct horse battery staple");
  await resetPage.getByText("don't match").waitFor();
  check(true, "after a reset the old password no longer works");
  await signIn(resetPage, priya.email, "a brand new long passphrase");
  await toolOpen(resetPage);
  check(true, "the new password opens the tool");

  // Asking again once approved re-sends the set-up email; the founder isn't asked again.
  const before = mail().filter((m) => m.to.includes(FOUNDER)).length;
  const { page: againPage } = await newPage();
  await askForAccess(againPage, priya);
  check((await againPage.getByTestId("access-sent").innerText()).includes("You already have a place"), "asking again once approved says so");
  check(mail().filter((m) => m.to.includes(FOUNDER)).length === before, "the founder isn't asked about an approved person again");

  // Not yet, then Decline, for others.
  const rahul = { name: "Rahul Mehta", email: `rahul.${run}@firm.test`, firm: "AZB" };
  await askForAccess(againPage, rahul);
  const rahulDecide = link(await mailTo(FOUNDER, /Access request: Rahul Mehta/), /Approve \(sends "You're in"\): (\S+)\?do=approve/);
  await decide(againPage, rahulDecide, "not_yet");
  check(/not just yet/.test((await mailTo(rahul.email, /not just yet/)).subject), "Not yet sends a warm note and keeps the request");
  await decide(againPage, rahulDecide, "decline");
  check(/About your Agmt request/.test((await mailTo(rahul.email, /About your Agmt request/)).subject), "Decline sends a polite note");

  // Someone with an account who never asked (or was declined) doesn't get in.
  const { page: rahulPage } = await newPage();
  await setUpAccount(rahulPage, `${BASE}/join?email=${encodeURIComponent(rahul.email)}&name=Rahul`, "rahul's long passphrase");
  await rahulPage.goto(link(await mailTo(rahul.email, /Verify your email/), /(http\S+verify-email\S+)/));
  await rahulPage.getByTestId("access-gate").waitFor();
  check((await rahulPage.locator("h1").innerText()).includes("Not in this beta"), "a declined person with an account still can't open the tool");
  check((await rahulPage.getByTestId("start").count()) === 0, "…and the tool isn't in their page");
  await shot(rahulPage, "declined");

  const sam = `sam.${run}@firm.test`;
  const { page: samPage } = await newPage();
  await setUpAccount(samPage, `${BASE}/join?email=${encodeURIComponent(sam)}&name=Sam`, "sam's long passphrase!");
  await samPage.goto(link(await mailTo(sam, /Verify your email/), /(http\S+verify-email\S+)/));
  await ready(samPage, "[data-testid='ask-for-access']");
  check((await samPage.getByLabel("Work email").getAttribute("readonly")) !== null, "a signed-in person who hasn't asked gets the request form with their email fixed");
  await samPage.getByLabel("Name").fill("Sam Iyer");
  await samPage.getByRole("button", { name: "Ask for access" }).click();
  await samPage.getByTestId("access-sent").waitFor();
  await samPage.reload();
  await samPage.getByTestId("access-gate").waitFor();
  check((await samPage.locator("h1").innerText()).includes("Your request is with us"), "after asking, they see that their request is with us");
  await shot(samPage, "pending");

  // An existing account signing up again is told by email, not left waiting.
  const { page: dupPage } = await newPage();
  const beforeDup = mark();
  await setUpAccount(dupPage, `${BASE}/join?email=${encodeURIComponent(priya.email)}&name=Priya`, "someone else's attempt!");
  check(/You already have an Agmt account/.test((await mailTo(priya.email, /You already have/, beforeDup)).subject), "signing up again sends 'you already have an account'");

  // The owner is always in.
  const { page: founderPage } = await newPage();
  const beforeFounder = mark();
  await setUpAccount(founderPage, `${BASE}/join?email=${encodeURIComponent(FOUNDER)}&name=Founder`, "the founder's passphrase");
  const founderMail = await mailTo(FOUNDER, /Verify your email|You already have/, beforeFounder);
  if (/Verify/.test(founderMail.subject)) await founderPage.goto(link(founderMail, /(http\S+verify-email\S+)/));
  else await signIn(founderPage, FOUNDER, "the founder's passphrase"); // set up on an earlier run
  await toolOpen(founderPage);
  check(true, "the owner's account opens the tool without a request");

  // A forged decision link is refused.
  await founderPage.goto(`${decisionUrl.slice(0, -4)}AAAA`);
  await founderPage.getByText("This link can't be used.").waitFor();
  check(true, "a tampered decision link is refused");

  // Phone width.
  const { page: phone } = await newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`${BASE}/`);
  await ready(phone, "[data-testid='sign-in']");
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `the gate fits a phone (overflow ${overflow}px)`);
  await shot(phone, "phone");

  check(problems.length === 0, `no console errors, page errors or policy violations${problems.length ? `:\n  ${problems.join("\n  ")}` : ""}`);
} finally {
  await browser.close();
}
