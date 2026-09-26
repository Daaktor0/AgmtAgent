import { test } from "node:test";
import assert from "node:assert/strict";
import { createInvite, inviteCookie, parseAccessMode, parseRevoked, verifyInvite } from "./access.ts";

const SECRET = "x".repeat(40);

test("an invite verifies until it expires, and not after revocation", async () => {
  const now = Date.UTC(2026, 8, 26);
  const token = await createInvite(SECRET, { label: "Priya, Khaitan", days: 30, now, id: "abc" });
  const ok = await verifyInvite(SECRET, token, now + 1000);
  assert.equal(ok.ok, true);
  assert.equal((await verifyInvite(SECRET, token, now + 31 * 86_400_000)).ok, false);
  assert.deepEqual(await verifyInvite(SECRET, token, now, parseRevoked("zzz, abc")), { ok: false, reason: "revoked" });
  if (ok.ok) assert.match(inviteCookie(token, ok.claims, now), /^agmt_invite=.+; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/);
});

test("a tampered or foreign invite is refused", async () => {
  const token = await createInvite(SECRET, { label: "A", days: 1 });
  const [body, sig] = token.split(".");
  const forged = `${body.slice(0, -2)}AA.${sig}`;
  assert.equal((await verifyInvite(SECRET, forged)).ok, false);
  assert.equal((await verifyInvite("y".repeat(40), token)).ok, false);
  assert.deepEqual(await verifyInvite(SECRET, "nonsense"), { ok: false, reason: "malformed" });
  await assert.rejects(createInvite("short", { label: "A", days: 1 }));
});

test("access mode defaults to public", () => {
  assert.equal(parseAccessMode(undefined), "public");
  assert.equal(parseAccessMode(" Invite "), "invite");
  assert.equal(parseAccessMode("anything"), "public");
});
