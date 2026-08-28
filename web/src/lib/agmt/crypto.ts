/**
 * Authenticated envelope encryption for document and workspace data.
 *
 * Every encrypted value gets a fresh AES-256-GCM data key. The data key is
 * itself wrapped with a deployment secret derived for the Agmt envelope domain.
 * Local development may use the historical preview key; deployed environments
 * fail closed if neither AGMT_ENCRYPTION_KEY nor BETTER_AUTH_SECRET is present.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const LOCAL_WRAP_LABEL = "agmt-wrap-v1-preview-not-for-production";
const WRAP_DOMAIN = "agmt-envelope-wrap-v2\0";

function env(key: string): string | undefined {
  const value = typeof process !== "undefined" ? process.env[key]?.trim() : undefined;
  return value ? value : undefined;
}

function isDeployed(): boolean {
  return Boolean(env("VERCEL") || env("VERCEL_ENV"));
}

function wrappingKey(): Buffer {
  const deploymentSecret = env("AGMT_ENCRYPTION_KEY") ?? env("BETTER_AUTH_SECRET");
  if (deploymentSecret) {
    return createHash("sha256").update(WRAP_DOMAIN).update(deploymentSecret).digest();
  }
  if (isDeployed()) {
    throw new Error(
      "Agmt encryption is not configured. Set AGMT_ENCRYPTION_KEY (preferred) or BETTER_AUTH_SECRET before deploying.",
    );
  }
  return createHash("sha256").update(LOCAL_WRAP_LABEL).digest();
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

export function decryptBytes(envelope: Envelope): Buffer {
  const wrappedBuffer = Buffer.from(envelope.wrappedDataKey, "base64");
  const wrapIv = wrappedBuffer.subarray(0, 12);
  const wrapTag = wrappedBuffer.subarray(12, 28);
  const wrapped = wrappedBuffer.subarray(28);
  const unwrap = createDecipheriv("aes-256-gcm", wrappingKey(), wrapIv);
  unwrap.setAuthTag(wrapTag);
  const dataKey = Buffer.concat([unwrap.update(wrapped), unwrap.final()]);

  const iv = Buffer.from(envelope.cipherMetadata.iv, "base64");
  const tag = Buffer.from(envelope.cipherMetadata.tag, "base64");
  const decipher = createDecipheriv("aes-256-gcm", dataKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
}

export function encryptText(plain: string): Envelope {
  return encryptBytes(Buffer.from(plain, "utf8"));
}

export function decryptText(envelope: Envelope): string {
  return decryptBytes(envelope).toString("utf8");
}

export function sha256Hex(buffer: Buffer | string): string {
  return createHash("sha256")
    .update(typeof buffer === "string" ? Buffer.from(buffer, "utf8") : buffer)
    .digest("hex");
}

export function sha256Bytes(buffer: Buffer): Buffer {
  return createHash("sha256").update(buffer).digest();
}

export function hashToken(raw: string): string {
  return sha256Hex(raw);
}
