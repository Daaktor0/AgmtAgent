import { Buffer } from "./buffer.ts";
import { sha256Bytes as digest, sha256Hex as hex } from "./sha256.ts";

export function sha256Hex(buffer: Uint8Array | string): string {
  return hex(typeof buffer === "string" ? buffer : buffer);
}

export function sha256Bytes(buffer: Uint8Array): Buffer {
  return Buffer.from(digest(buffer instanceof Uint8Array ? buffer : Buffer.from(buffer)));
}

export function hashToken(raw: string): string {
  return sha256Hex(raw);
}

export function encryptBytes(): never {
  throw new Error("envelope_encryption_not_available_in_browser_prototype");
}

export function decryptBytes(): never {
  throw new Error("envelope_encryption_not_available_in_browser_prototype");
}

export function encryptText(): never {
  throw new Error("envelope_encryption_not_available_in_browser_prototype");
}

export function decryptText(): never {
  throw new Error("envelope_encryption_not_available_in_browser_prototype");
}
