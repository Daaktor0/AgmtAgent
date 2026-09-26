import { test } from "node:test";
import assert from "node:assert/strict";
import { handleExecuteApi } from "./server.ts";
import { accessThanks, greetingName } from "./mail.ts";

type Sent = { to: string[]; subject: string; text: string; html?: string; reply_to?: string; from: string };

async function withMail(env: Record<string, string | undefined>, respond: number, fn: (sent: Sent[]) => Promise<void>) {
  const oldEnv = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  const oldFetch = globalThis.fetch;
  const sent: Sent[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Sent);
    return new Response("{}", { status: respond });
  }) as typeof fetch;
  try {
    await fn(sent);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [k, v] of Object.entries(oldEnv)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

let ip = 1;
const request = (path: string, body: unknown) =>
  new Request(`https://app.agmt.legal/api/execute/${path}`, {
    method: "POST",
    headers: { origin: "https://app.agmt.legal", "content-type": "application/json", "cf-connecting-ip": `198.51.100.${ip++}` },
    body: JSON.stringify(body),
  });

const priya = { name: "Priya Nair", email: "priya@khaitan.example", firm: "Khaitan & Co", note: "SHAs with 10+ investors" };
const configured = { RESEND_API_KEY: "re_test", AUTH_EMAIL_FROM: "Agmt <hello@agmt.legal>", AGMT_FEEDBACK_TO: "founder@agmt.legal" };

test("an access request thanks the person and tells the founder how to invite them", async () => {
  await withMail(configured, 200, async (sent) => {
    const res = await handleExecuteApi(request("access-request", priya));
    assert.deepEqual(await res.json(), { ok: true, acknowledged: true, notified: true });
    const [thanks, notice] = sent;
    assert.deepEqual(thanks.to, ["priya@khaitan.example"]);
    assert.equal(thanks.reply_to, "founder@agmt.legal", "replies to the thank-you reach the founder");
    assert.equal(thanks.from, "Agmt <hello@agmt.legal>");
    assert.equal(thanks.subject, "Your request for Execute by Agmt");
    assert.match(thanks.text, /^Dear Priya,/);
    assert.match(thanks.text, /Access is by invitation for now/);
    assert.match(thanks.text, /your documents are not uploaded/);
    assert.doesNotMatch(thanks.text, /beta|small group|first|coming soon/i);
    assert.match(thanks.html ?? "", /alt="Execute by Agmt"/);
    assert.match(thanks.html ?? "", /Khaitan &amp; Co/, "user text is escaped in HTML");
    assert.deepEqual(notice.to, ["founder@agmt.legal"]);
    assert.equal(notice.reply_to, "priya@khaitan.example");
    assert.equal(notice.subject, "Access request: Priya Nair, Khaitan & Co");
    assert.match(notice.text, /npm run execute:invite -- --label "Priya Nair, Khaitan & Co" --days 90/);
    assert.match(notice.text, /SHAs with 10\+ investors/);
  });
});

test("without a verified sender only the founder is emailed, and the page is told so", async () => {
  await withMail({ ...configured, AUTH_EMAIL_FROM: undefined }, 200, async (sent) => {
    const res = await handleExecuteApi(request("access-request", priya));
    assert.deepEqual(await res.json(), { ok: true, acknowledged: false, notified: true });
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, ["founder@agmt.legal"]);
    assert.match(sent[0].text, /No thank-you email could be sent/);
  });
});

test("with no email set up nothing is sent, the request is still accepted and logged", async () => {
  await withMail({ RESEND_API_KEY: undefined, AUTH_EMAIL_FROM: undefined, AGMT_FEEDBACK_TO: undefined }, 200, async (sent) => {
    const res = await handleExecuteApi(request("access-request", priya));
    assert.deepEqual(await res.json(), { ok: true, acknowledged: false, notified: false });
    assert.equal(sent.length, 0);
  });
});

test("a provider refusal is reported, not hidden", async () => {
  await withMail(configured, 422, async () => {
    const res = await handleExecuteApi(request("access-request", priya));
    assert.deepEqual(await res.json(), { ok: true, acknowledged: false, notified: false });
  });
});

test("the status check answers yes or no and never reveals a value", async () => {
  await withMail({ ...configured, AGMT_EXECUTE_ACCESS: "invite", AGMT_INVITE_SECRET: "s".repeat(40) }, 200, async () => {
    const res = await handleExecuteApi(new Request("https://app.agmt.legal/api/execute/status"));
    const body = await res.json();
    assert.deepEqual(body, { accessMode: "invite", inviteSecretSet: true, emailProviderSet: true, verifiedSenderSet: true, founderAddressSet: true });
    assert.doesNotMatch(JSON.stringify(body), /re_test|agmt\.legal|ssss/);
  });
});

test("names are greeted naturally and never injected into the email's HTML", () => {
  assert.equal(greetingName("Priya Nair"), "Priya");
  assert.equal(greetingName("Adv. R. K. Sharma"), "Adv. R. K. Sharma");
  const html = accessThanks({ name: "<b>Eve</b> X", email: "e@x.example", firm: "<script>" }).html;
  assert.doesNotMatch(html, /<script>|<b>Eve/);
});
