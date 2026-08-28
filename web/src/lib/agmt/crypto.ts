/**
 * Authenticated envelope encryption (SPEC §10.3).
 * AES-256-GCM, unique random data key per Document Version, wrapped with a
 * master key held outside the row. Preview uses a process wrapping key derived
 * from a built-in label — production replaces this with KMS.
 *
 * Ciphertext is stored as base64: iv || tag || ciphertext, plus wrapped data key.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const WRAP_LABEL = "agmt-wrap-v1-preview-not-for-production";

function wrappingKey(): Buffer {
  return createHash("sha256").update(WRAP_LABEL).digest();
}

export type Envelope = {
  wrappedDataKey: string;
  cipherMetadata: { alg: "AES-256-GCM"; iv: string; tag: string; v: 1 };
  ciphertext: string;
};

export function encryptBytes(plain: Buffer): Envelope {
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const wrapIv = randomBytes(12);
  const wrap = createCipheriv("aes-256-gcm", wrappingKey(), wrapIv);
  const wrapped = Buffer.concat([wrap.update(dataKey), wrap.final()]);
  const wrapTag = wrap.getAuthTag();
  return {
    wrappedDataKey: Buffer.concat([wrapIv, wrapTag, wrapped]).toString("base64"),
    cipherMetadata: {
      alg: "AES-256-GCM",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      v: 1,
    },
    ciphertext: body.toString("base64"),
  };
}

export function decryptBytes(env: Envelope): Buffer {
  const wrappedBuf = Buffer.from(env.wrappedDataKey, "base64");
  const wrapIv = wrappedBuf.subarray(0, 12);
  const wrapTag = wrappedBuf.subarray(12, 28);
  const wrapped = wrappedBuf.subarray(28);
  const unwrap = createDecipheriv("aes-256-gcm", wrappingKey(), wrapIv);
  unwrap.setAuthTag(wrapTag);
  const dataKey = Buffer.concat([unwrap.update(wrapped), unwrap.final()]);
  const iv = Buffer.from(env.cipherMetadata.iv, "base64");
  const tag = Buffer.from(env.cipherMetadata.tag, "base64");
  const decipher = createDecipheriv("aes-256-gcm", dataKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(env.ciphertext, "base64")),
    decipher.final(),
  ]);
}

export function encryptText(plain: string): Envelope {
  return encryptBytes(Buffer.from(plain, "utf8"));
}

export function decryptText(env: Envelope): string {
  return decryptBytes(env).toString("utf8");
}

export function sha256Hex(buf: Buffer | string): string {
  return createHash("sha256")
    .update(typeof buf === "string" ? Buffer.from(buf, "utf8") : buf)
    .digest("hex");
}

export function sha256Bytes(buf: Buffer): Buffer {
  return createHash("sha256").update(buf).digest();
}

export function hashToken(raw: string): string {
  return sha256Hex(raw);
}
