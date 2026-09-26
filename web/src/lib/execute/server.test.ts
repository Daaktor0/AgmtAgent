import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryAccessStore, setAccessStoreForTests } from "./access-store.ts";
import { executeAccess, handleExecuteApi } from "./server.ts";

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const old = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  return fn().finally(() => {
    for (const [k, v] of Object.entries(old)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  });
}

const at = "2026-09-26T10:00:00.000Z";
const person = (email: string, emailVerified = true) => ({ email, emailVerified, name: "Someone" });

test("public mode lets everyone in; invite mode needs a verified, approved account", async () => {
  const store = memoryAccessStore();
  setAccessStoreForTests(store);
  try {
    await withEnv({ AGMT_EXECUTE_ACCESS: undefined }, async () => {
      assert.equal((await executeAccess(null)).state, "allowed");
    });
    await withEnv({ AGMT_EXECUTE_ACCESS: "invite", AGMT_FEEDBACK_TO: "Founder@agmt.legal" }, async () => {
      assert.equal((await executeAccess(null)).state, "signed_out");
      assert.equal((await executeAccess(person("founder@agmt.legal", false))).state, "signed_out", "an unverified email is not trusted");
      assert.equal((await executeAccess(person("FOUNDER@agmt.legal"))).state, "allowed", "the owner is always in");
      assert.equal((await executeAccess(person("new@firm.example"))).state, "not_requested");
      for (const [status, state] of [["requested", "pending"], ["not_yet", "pending"], ["declined", "declined"], ["approved", "allowed"]] as const) {
        await store.put({ email: "priya@firm.example", name: "Priya", status, requestedAt: at, updatedAt: at });
        assert.equal((await executeAccess(person("Priya@Firm.example"))).state, state, status);
      }
    });
    setAccessStoreForTests({ get: () => Promise.reject(new Error("down")), put: () => Promise.reject(new Error("down")) });
    await withEnv({ AGMT_EXECUTE_ACCESS: "invite", AGMT_FEEDBACK_TO: "founder@agmt.legal" }, async () => {
      assert.equal((await executeAccess(person("priya@firm.example"))).state, "unavailable", "an unreachable list keeps the tool closed");
      assert.equal((await executeAccess(person("founder@agmt.legal"))).state, "allowed");
    });
  } finally {
    setAccessStoreForTests(null);
  }
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

test("colleagues sharing an office connection can all ask on the same day, within reason", async () => {
  const ask = (i: number) =>
    handleExecuteApi(
      new Request("https://app.agmt.legal/api/execute/access-request", {
        method: "POST",
        headers: { origin: "https://app.agmt.legal", "content-type": "application/json", "cf-connecting-ip": "192.0.2.77" },
        body: JSON.stringify({ name: `Lawyer ${i}`, email: `lawyer${i}@firm.example` }),
      }),
    );
  setAccessStoreForTests(memoryAccessStore());
  try {
    for (let i = 0; i < 20; i += 1) assert.equal((await ask(i)).status, 200, `request ${i + 1}`);
    assert.equal((await ask(21)).status, 429);
  } finally {
    setAccessStoreForTests(null);
  }
});

test("an access request needs a name and a valid email", async () => {
  assert.equal((await handleExecuteApi(post("access-request", { name: "Priya", email: "priya@firm.example", firm: "", note: "" }))).status, 200);
  assert.equal((await handleExecuteApi(post("access-request", { name: "Priya", email: "not-an-email" }))).status, 400);
});
