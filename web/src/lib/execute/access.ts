/**
 * Beta access for executed copies.
 *
 * Access belongs to an account, not a link: a person is in when they are
 * signed in with a verified email that the founder has approved (see
 * `access-store.ts`). Nothing a person is sent can be forwarded to let someone
 * else in.
 *
 * The founder decides from their email. Each access-request email carries a
 * signed decision link: base64url(JSON {v, p: "decide", e}) + "." +
 * base64url(HMAC-SHA256). The signature proves Agmt issued it for that one
 * email address; it grants nothing by itself (the page it opens asks the
 * founder to press a button). Web Crypto only, so the same code runs in the
 * Cloudflare Worker and in tests.
 *
 * This gates who can open the tool during the beta. It is not document
 * security: documents never reach the server whatever the access mode.
 */

export type AccessMode = "public" | "invite";
export type DecisionClaims = { v: 2; p: "decide"; e: string };
export type DecisionCheck = { ok: true; email: string } | { ok: false; reason: "malformed" | "signature" };

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// The secret is only ever used through a key bound to this one purpose, so a
// decision link can't be mistaken for any other signed value.
const PURPOSE = "agmt-access-decision-v2";

async function key(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("AGMT_INVITE_SECRET must be at least 32 characters");
  const root = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const derived = new Uint8Array(await crypto.subtle.sign("HMAC", root, enc.encode(PURPOSE)));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export function parseAccessMode(value: string | undefined): AccessMode {
  return value?.trim().toLowerCase() === "invite" ? "invite" : "public";
}

/** One spelling per mailbox: "  Priya@Firm.COM " -> "priya@firm.com". */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Comma-separated owner addresses (AGMT_FEEDBACK_TO): always let in. */
export function parseEmails(value: string | undefined): string[] {
  return (value ?? "").split(/[\s,]+/).map(normaliseEmail).filter((v) => v.includes("@"));
}

export async function createDecisionToken(secret: string, email: string): Promise<string> {
  const claims: DecisionClaims = { v: 2, p: "decide", e: normaliseEmail(email) };
  const body = toBase64Url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${toBase64Url(sig)}`;
}

export async function verifyDecisionToken(secret: string, token: string): Promise<DecisionCheck> {
  const parts = token.split(".");
  if (parts.length !== 2 || token.length > 1024 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  let sig: Uint8Array;
  try {
    sig = fromBase64Url(parts[1]);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const valid = await crypto.subtle.verify("HMAC", await key(secret), sig as BufferSource, enc.encode(parts[0]));
  if (!valid) return { ok: false, reason: "signature" };
  let claims: DecisionClaims;
  try {
    claims = JSON.parse(dec.decode(fromBase64Url(parts[0]))) as DecisionClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (claims.v !== 2 || claims.p !== "decide" || typeof claims.e !== "string" || !claims.e.includes("@")) {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, email: claims.e };
}
