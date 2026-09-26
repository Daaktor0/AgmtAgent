import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryAccessStore, setAccessStoreForTests, type AccessStore } from "./access-store.ts";
import { handleExecuteApi } from "./server.ts";
import { accessNotice, accessThanks, greetingName, youreIn } from "./mail.ts";

type Sent = { to: string[]; subject: string; text: string; html?: string; reply_to?: string; from: string };

async function withMail(env: Record<string, string | undefined>, respond: number, fn: (sent: Sent[], store: AccessStore) => Promise<void>) {
  const store = memoryAccessStore();
  setAccessStoreForTests(store);
  const oldEnv = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  const oldFetch = globalThis.fetch;
  const sent: Sent[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Sent);
    return new Response("{}", { status: respond });
  }) as typeof fetch;
  try {
    await fn(sent, store);
  } finally {
    setAccessStoreForTests(null);
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

const priya = { name: "Priya Nair", email: "priya@khaitan.example", note: "SHAs & SSAs with 10+ investors" };
const configured = {
  RESEND_API_KEY: "re_test",
  AUTH_EMAIL_FROM: "Agmt <hello@agmt.legal>",
  AGMT_FEEDBACK_TO: "founder@agmt.legal",
  AGMT_INVITE_SECRET: "s".repeat(40),
  AGMT_PUBLIC_URL: "https://app.agmt.legal",
};

const decide = (token: string, action: string, origin = "https://app.agmt.legal") =>
  new Request("https://app.agmt.legal/api/execute/decide", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ token, action }),
  });

/** The decision link the founder's email carries. */
function tokenFrom(notice: Sent): string {
  const match = notice.text.match(/Approve \(sends the set-up link\): https:\/\/app\.agmt\.legal\/access\/([^?\s]+)\?do=approve/);
  assert.ok(match, "the founder's email has an Approve link");
  return match[1];
}

test("an access request thanks the person, is kept on the list, and gives the founder three buttons", async () => {
  await withMail(configured, 200, async (sent, store) => {
    const res = await handleExecuteApi(request("access-request", { ...priya, email: " Priya@Khaitan.example " }));
    assert.deepEqual(await res.json(), { ok: true, acknowledged: true, notified: true, status: "requested" });
    const [thanks, notice] = sent;
    assert.deepEqual(thanks.to, ["priya@khaitan.example"]);
    assert.equal(thanks.reply_to, "founder@agmt.legal", "replies to the thank-you reach the founder");
    assert.equal(thanks.from, "Agmt <hello@agmt.legal>");
    assert.equal(thanks.subject, "Your request for Execute by Agmt");
    assert.match(thanks.text, /^Dear Priya,/);
    assert.match(thanks.text, /Access is by invitation for now/);
    assert.match(thanks.text, /email you a link to set up your account/);
    assert.match(thanks.html ?? "", /alt="Execute by Agmt"/);
    assert.doesNotMatch(thanks.text, /firm|company/i, "no organisation is asked for or mentioned");
    for (const mail of [thanks.text, thanks.html ?? ""]) assert.doesNotMatch(mail, /beta|small group|coming soon|after the/i);
    assert.deepEqual(notice.to, ["founder@agmt.legal"]);
    assert.equal(notice.reply_to, "priya@khaitan.example");
    assert.equal(notice.subject, "Access request: Priya Nair");
    assert.match(notice.html ?? "", /SHAs &amp; SSAs/, "user text is escaped in HTML");
    assert.doesNotMatch(notice.text, /Firm:/);
    assert.match(notice.text, /SHAs & SSAs with 10\+ investors/);
    assert.doesNotMatch(notice.text, /npm run/, "no command line for the founder");
    const token = tokenFrom(notice);
    for (const action of ["approve", "not_yet", "decline"]) assert.match(notice.html ?? "", new RegExp(`/access/${token}\\?do=${action}`));
    assert.equal((await store.get("priya@khaitan.example"))?.status, "requested");
  });
});

test("Approve sends 'You're in' with a link to set up the account; pressing twice does nothing new", async () => {
  await withMail(configured, 200, async (sent, store) => {
    await handleExecuteApi(request("access-request", priya));
    const token = tokenFrom(sent[1]);
    const res = await handleExecuteApi(decide(token, "approve"));
    const body = await res.json();
    assert.equal(body.changed, true);
    assert.equal(body.status, "approved");
    assert.equal(body.emailed, true);
    const welcome = sent[2];
    assert.deepEqual(welcome.to, ["priya@khaitan.example"]);
    assert.equal(welcome.subject, "Set up your Execute account");
    assert.match(welcome.text, /https:\/\/app\.agmt\.legal\/join\?email=priya%40khaitan\.example&name=Priya\+Nair/);
    assert.match(welcome.text, /forwarding this email won't let anyone else in/);
    assert.equal((await store.get("priya@khaitan.example"))?.status, "approved");
    const again = await (await handleExecuteApi(decide(token, "approve"))).json();
    assert.equal(again.changed, false);
    assert.equal(sent.length, 3, "no second email");
  });
});

test("Not yet keeps the request and can be approved later; Decline is polite and can follow approval", async () => {
  await withMail(configured, 200, async (sent, store) => {
    await handleExecuteApi(request("access-request", priya));
    const token = tokenFrom(sent[1]);
    await handleExecuteApi(decide(token, "not_yet"));
    assert.equal(sent[2].subject, "Your request for Execute");
    assert.match(sent[2].text, /no need to ask again/);
    assert.equal((await store.get("priya@khaitan.example"))?.status, "not_yet");
    await handleExecuteApi(decide(token, "approve"));
    assert.equal(sent[3].subject, "Set up your Execute account");
    await handleExecuteApi(decide(token, "decline"));
    assert.equal(sent[4].subject, "Your request for Execute");
    assert.match(sent[4].text, /not able to offer you access to Execute/);
    assert.doesNotMatch(sent[4].text, /beta|after the|will open/i);
    assert.equal((await store.get("priya@khaitan.example"))?.status, "declined");
  });
});

test("asking again: approved people get their email again; declined people go back to the founder", async () => {
  await withMail(configured, 200, async (sent, store) => {
    await handleExecuteApi(request("access-request", priya));
    const token = tokenFrom(sent[1]);
    await handleExecuteApi(decide(token, "approve"));
    sent.length = 0;
    const res = await (await handleExecuteApi(request("access-request", priya))).json();
    assert.deepEqual(res, { ok: true, acknowledged: true, notified: false, status: "approved" });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].subject, "Set up your Execute account");
    await handleExecuteApi(decide(token, "decline"));
    sent.length = 0;
    await handleExecuteApi(request("access-request", priya));
    assert.equal(sent[1].subject, "Access request: Priya Nair");
    assert.match(sent[1].text, /asked again/);
    assert.equal((await store.get("priya@khaitan.example"))?.status, "requested");
  });
});

test("a decision needs a genuine link, from the app, for a request that exists", async () => {
  await withMail(configured, 200, async (sent) => {
    await handleExecuteApi(request("access-request", priya));
    const token = tokenFrom(sent[1]);
    assert.equal((await handleExecuteApi(decide(token, "approve", "https://evil.example"))).status, 403);
    assert.equal((await handleExecuteApi(decide(`${token.slice(0, -3)}AAA`, "approve"))).status, 403);
    assert.equal((await handleExecuteApi(decide(token, "promote"))).status, 400);
    const { createDecisionToken } = await import("./access.ts");
    const stranger = await createDecisionToken("s".repeat(40), "nobody@x.example");
    assert.equal((await handleExecuteApi(decide(stranger, "approve"))).status, 404);
    assert.equal(sent.length, 2, "nothing sent by refused decisions");
  });
});

test("without a verified sender only the founder is emailed, and the page is told so", async () => {
  await withMail({ ...configured, AUTH_EMAIL_FROM: undefined }, 200, async (sent) => {
    const res = await handleExecuteApi(request("access-request", priya));
    assert.deepEqual(await res.json(), { ok: true, acknowledged: false, notified: true, status: "requested" });
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, ["founder@agmt.legal"]);
    assert.match(sent[0].text, /No thank-you email could be sent/);
  });
});

test("with no email set up nothing is sent, the request is still accepted and logged", async () => {
  await withMail({ RESEND_API_KEY: undefined, AUTH_EMAIL_FROM: undefined, AGMT_FEEDBACK_TO: undefined }, 200, async (sent) => {
    const res = await handleExecuteApi(request("access-request", priya));
    assert.deepEqual(await res.json(), { ok: true, acknowledged: false, notified: false, status: "requested" });
    assert.equal(sent.length, 0);
  });
});

test("a provider refusal is reported, not hidden", async () => {
  await withMail(configured, 422, async () => {
    const res = await handleExecuteApi(request("access-request", priya));
    assert.deepEqual(await res.json(), { ok: true, acknowledged: false, notified: false, status: "requested" });
  });
});

test("the status check answers yes or no and never reveals a value", async () => {
  await withMail({ ...configured, AGMT_EXECUTE_ACCESS: "invite" }, 200, async () => {
    const res = await handleExecuteApi(new Request("https://app.agmt.legal/api/execute/status"));
    const body = await res.json();
    assert.deepEqual(body, {
      accessMode: "invite",
      inviteSecretSet: true,
      approvedListSet: false,
      emailProviderSet: true,
      verifiedSenderSet: true,
      founderAddressSet: true,
    });
    assert.doesNotMatch(JSON.stringify(body), /re_test|agmt\.legal|ssss/);
  });
});

test("names are greeted naturally and never injected into the email's HTML", () => {
  assert.equal(greetingName("Priya Nair"), "Priya");
  assert.equal(greetingName("Adv. R. K. Sharma"), "Adv. R. K. Sharma");
  const eve = { name: "<b>Eve</b> X", email: "e@x.example", firm: "<script>", note: "<img src=x>" };
  for (const html of [
    accessThanks(eve).html,
    accessNotice(eve, { decide: "https://app.agmt.legal/access/t" }, { acknowledged: true, again: false }).html,
    youreIn(eve, { join: 'https://app.agmt.legal/join?x="><script>', signIn: "https://app.agmt.legal/" }).html,
  ]) {
    assert.doesNotMatch(html, /<script>|<b>Eve|<img src=x>/);
  }
});
