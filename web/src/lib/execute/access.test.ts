import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecisionToken, normaliseEmail, parseAccessMode, parseEmails, verifyDecisionToken } from "./access.ts";

const SECRET = "x".repeat(40);

test("a decision link names one email and verifies only with the right key", async () => {
  const token = await createDecisionToken(SECRET, " Priya@Khaitan.Example ");
  assert.deepEqual(await verifyDecisionToken(SECRET, token), { ok: true, email: "priya@khaitan.example" });
  assert.equal((await verifyDecisionToken("y".repeat(40), token)).ok, false);
});

test("a tampered or malformed decision link is refused", async () => {
  const token = await createDecisionToken(SECRET, "a@b.example");
  const [body, sig] = token.split(".");
  const other = (await createDecisionToken(SECRET, "eve@b.example")).split(".")[0];
  assert.equal((await verifyDecisionToken(SECRET, `${other}.${sig}`)).ok, false, "another email can't borrow a signature");
  assert.equal((await verifyDecisionToken(SECRET, `${body.slice(0, -2)}AA.${sig}`)).ok, false);
  assert.deepEqual(await verifyDecisionToken(SECRET, "nonsense"), { ok: false, reason: "malformed" });
  await assert.rejects(createDecisionToken("short", "a@b.example"));
});

test("access mode defaults to public; emails are compared in one spelling", () => {
  assert.equal(parseAccessMode(undefined), "public");
  assert.equal(parseAccessMode(" Invite "), "invite");
  assert.equal(parseAccessMode("anything"), "public");
  assert.equal(normaliseEmail("  A@B.Example "), "a@b.example");
  assert.deepEqual(parseEmails("Founder@Agmt.legal, second@x.example  bad"), ["founder@agmt.legal", "second@x.example"]);
});
