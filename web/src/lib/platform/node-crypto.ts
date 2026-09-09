import { BrowserBuffer as Buffer, ensureBrowserBuffer } from "./buffer.ts";
import { sha256Bytes } from "./sha256.ts";

ensureBrowserBuffer();

class Sha256Hash {
  private parts: Uint8Array[] = [];

  update(data: unknown): this {
    if (typeof data === "string") this.parts.push(new TextEncoder().encode(data));
    else this.parts.push(Buffer.from(data));
    return this;
  }

  digest(encoding?: string): string | Buffer {
    const total = Buffer.concat(this.parts);
    const digest = sha256Bytes(total);
    if (encoding === "hex") return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return Buffer.from(digest);
  }
}

export function createHash(algorithm: string): Sha256Hash {
  if (algorithm !== "sha256") throw new Error(`unsupported_hash ${algorithm}`);
  return new Sha256Hash();
}

export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

export function randomBytes(): never {
  throw new Error("node_crypto_randomBytes_unavailable_in_browser");
}

export function createCipheriv(): never {
  throw new Error("envelope_encryption_unavailable_in_browser");
}

export function createDecipheriv(): never {
  throw new Error("envelope_encryption_unavailable_in_browser");
}

export default { createHash, randomUUID, randomBytes, createCipheriv, createDecipheriv };
