import { test } from "node:test";
import assert from "node:assert/strict";
import { createInvite } from "./access.ts";
import { acceptInvite, executeAccess, handleExecuteApi } from "./server.ts";

const SECRET = "s".repeat(40);

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const old = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  return fn().finally(() => {
    for (const [k, v] of Object.entries(old)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  });
}

test("public mode lets everyone in; invite mode needs a valid invite and fails closed without a secret", async () => {
  await withEnv({ AGMT_EXECUTE_ACCESS: undefined }, async () => {
    assert.equal((await executeAccess(null)).allowed, true);
  });
  await withEnv({ AGMT_EXECUTE_ACCESS: "invite", AGMT_INVITE_SECRET: undefined }, async () => {
    assert.equal((await executeAccess("anything")).allowed, false);
  });
  await withEnv({ AGMT_EXECUTE_ACCESS: "invite", AGMT_INVITE_SECRET: SECRET, AGMT_INVITE_REVOKED: undefined }, async () => {
    const token = await createInvite(SECRET, { label: "Beta tester", days: 7 });
    assert.deepEqual(await executeAccess(token), { mode: "invite", allowed: true, label: "Beta tester" });
    assert.equal((await executeAccess(null)).allowed, false);
    const res = await acceptInvite(new Request("https://app.agmt.legal/invite/x"), token);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/");
    assert.match(res.headers.get("set-cookie") ?? "", /^agmt_invite=/);
    const bad = await acceptInvite(new Request("https://app.agmt.legal/invite/x"), "bad.token");
    assert.equal(bad.headers.get("location"), "/?invite=invalid");
    assert.equal(bad.headers.get("set-cookie"), null);
  });
});

const post = (path: string, body: unknown, origin = "https://app.agmt.legal") =>
  new Request(`https://app.agmt.legal/api/execute/${path}`, { method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" }, body: JSON.stringify(body) });

test("feedback is accepted from the app, refused from elsewhere, validated and rate-limited", async () => {
  await withEnv({ RESEND_API_KEY: undefined, AGMT_FEEDBACK_TO: undefined }, async () => {
    const good = { kind: "broke", message: "The SSA stamp paper went to the SHA.", email: "", technical: null };
    const ok = await handleExecuteApi(post("feedback", good));
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, delivered: false });
    assert.equal((await handleExecuteApi(post("feedback", good, "https://evil.example"))).status, 403);
    assert.equal((await handleExecuteApi(post("feedback", { ...good, message: "" }))).status, 400);
    assert.equal((await handleExecuteApi(post("feedback", { ...good, document: "..." }))).status, 400);
    let last = 200;
    for (let i = 0; i < 25; i += 1) last = (await handleExecuteApi(post("feedback", good))).status;
    assert.equal(last, 429);
  });
});

test("an access request needs a name and a valid email", async () => {
  assert.equal((await handleExecuteApi(post("access-request", { name: "Priya", email: "priya@firm.example", firm: "", note: "" }))).status, 200);
  assert.equal((await handleExecuteApi(post("access-request", { name: "Priya", email: "not-an-email" }))).status, 400);
});
