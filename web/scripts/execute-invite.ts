/**
 * Mint a beta invite link for executed copies.
 *
 *   AGMT_INVITE_SECRET=... npm run execute:invite -- --label "Priya Nair, Khaitan" [--days 90] [--base https://app.agmt.legal]
 *
 * Use the same AGMT_INVITE_SECRET as the production Worker. Prints the link
 * and the invite id (put the id in AGMT_INVITE_REVOKED to withdraw it).
 */
import { createInvite, verifyInvite } from "../src/lib/execute/access.ts";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const secret = process.env.AGMT_INVITE_SECRET?.trim();
if (!secret) {
  console.error("Set AGMT_INVITE_SECRET to the value configured on the Worker.");
  process.exit(1);
}
const label = arg("label");
if (!label) {
  console.error('Pass --label "Name, Firm" so you can tell invites apart.');
  process.exit(1);
}
const days = Number(arg("days", "90"));
const base = (arg("base", "https://app.agmt.legal") ?? "").replace(/\/+$/, "");
const token = await createInvite(secret, { label, days });
const check = await verifyInvite(secret, token);
if (!check.ok) throw new Error("minted invite did not verify");
console.log(`${base}/invite/${token}`);
console.log(`id ${check.claims.id} · ${label} · expires ${new Date(check.claims.exp).toISOString().slice(0, 10)}`);
