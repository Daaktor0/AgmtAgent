import { Buffer } from "./buffer.ts";
import { sha256Bytes, sha256Hex } from "./sha256.ts";

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
    if (encoding === "hex") return sha256Hex(digest);
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
  throw new Error("node_crypto_randomBytes_unavailable_in_browser_prototype");
}

export function createCipheriv(): never {
  throw new Error("envelope_encryption_not_available_in_browser_prototype");
}

export function createDecipheriv(): never {
  throw new Error("envelope_encryption_not_available_in_browser_prototype");
}

export default { createHash, randomUUID, randomBytes, createCipheriv, createDecipheriv };
