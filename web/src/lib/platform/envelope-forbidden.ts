import { sha256Bytes as hashBytes, sha256Hex as hashHex } from "./sha256.ts";

/** Hashing is required by the engine. Envelope encryption must not run in the browser. */
export function sha256Hex(buffer: Uint8Array | string): string {
  return hashHex(buffer);
}

export function sha256Bytes(buffer: Uint8Array): Uint8Array {
  return hashBytes(buffer);
}

export function hashToken(raw: string): string {
  return hashHex(raw);
}

export function wrappingKey(): never {
  throw new Error("envelope_encryption_unavailable_in_browser");
}

export function encryptBytes(): never {
  throw new Error("envelope_encryption_unavailable_in_browser");
}

export function decryptBytes(): never {
  throw new Error("envelope_encryption_unavailable_in_browser");
}

export function encryptText(): never {
  throw new Error("envelope_encryption_unavailable_in_browser");
}

export function decryptText(): never {
  throw new Error("envelope_encryption_unavailable_in_browser");
}
