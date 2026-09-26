/**
 * Invite links for a closed beta. An invite is a signed, expiring token:
 * base64url(JSON {v, id, label, exp}) + "." + base64url(HMAC-SHA256). No
 * database: the signature proves Agmt issued it, the expiry ends it, and an
 * id on the revocation list withdraws it early. Web Crypto only, so the same
 * code runs in the Cloudflare Worker, in Node scripts and in tests.
 *
 * This gates who can open the tool during the beta. It is not document
 * security: documents never reach the server whatever the access mode.
 */

export type AccessMode = "public" | "invite";
export type InviteClaims = { v: 1; id: string; label: string; exp: number };
export type InviteCheck = { ok: true; claims: InviteClaims } | { ok: false; reason: "malformed" | "signature" | "expired" | "revoked" };

export const INVITE_COOKIE = "agmt_invite";

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

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export function parseAccessMode(value: string | undefined): AccessMode {
  return value?.trim().toLowerCase() === "invite" ? "invite" : "public";
}

export function parseRevoked(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(/[\s,]+/).map((v) => v.trim()).filter(Boolean));
}

export async function createInvite(secret: string, input: { label: string; days: number; now?: number; id?: string }): Promise<string> {
  if (secret.length < 32) throw new Error("AGMT_INVITE_SECRET must be at least 32 characters");
  const now = input.now ?? Date.now();
  const claims: InviteClaims = {
    v: 1,
    id: input.id ?? toBase64Url(crypto.getRandomValues(new Uint8Array(9))),
    label: input.label.slice(0, 120),
    exp: now + Math.round(input.days * 86_400_000),
  };
  const body = toBase64Url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${toBase64Url(sig)}`;
}

export async function verifyInvite(secret: string, token: string, now = Date.now(), revoked: Set<string> = new Set()): Promise<InviteCheck> {
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
  let claims: InviteClaims;
  try {
    claims = JSON.parse(dec.decode(fromBase64Url(parts[0]))) as InviteClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (claims.v !== 1 || typeof claims.id !== "string" || typeof claims.exp !== "number") return { ok: false, reason: "malformed" };
  if (claims.exp <= now) return { ok: false, reason: "expired" };
  if (revoked.has(claims.id)) return { ok: false, reason: "revoked" };
  return { ok: true, claims };
}

export function inviteCookie(token: string, claims: InviteClaims, now = Date.now()): string {
  const maxAge = Math.max(0, Math.floor((claims.exp - now) / 1000));
  return `${INVITE_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
