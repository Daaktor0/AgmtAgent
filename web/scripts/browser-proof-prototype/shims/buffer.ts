/**
 * Browser Buffer stand-in for the prototype bundle only.
 * Production engine files keep using Node Buffer.
 */
const encoder = new TextEncoder();

function toBytes(input: unknown, encoding?: string): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (typeof input === "string") {
    if (encoding === "hex") {
      const out = new Uint8Array(input.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(input.slice(i * 2, i * 2 + 2), 16);
      return out;
    }
    if (encoding === "base64") {
      const binary = atob(input);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
      return out;
    }
    return encoder.encode(input);
  }
  if (Array.isArray(input)) return Uint8Array.from(input as number[]);
  throw new TypeError("unsupported Buffer.from input");
}

export class Buffer extends Uint8Array {
  static from(input: unknown, encoding?: string): Buffer {
    const raw = toBytes(input, encoding);
    const buf = new Buffer(raw.byteLength);
    buf.set(raw);
    return buf;
  }
  static alloc(size: number): Buffer {
    return new Buffer(size);
  }
  static concat(list: Array<Uint8Array>): Buffer {
    const total = list.reduce((sum, part) => sum + part.length, 0);
    const out = new Buffer(total);
    let offset = 0;
    for (const part of list) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
  static isBuffer(value: unknown): value is Buffer {
    return value instanceof Buffer;
  }
  toString(encoding = "utf8"): string {
    if (encoding === "hex") {
      return [...this].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    if (encoding === "base64") {
      let binary = "";
      for (let i = 0; i < this.length; i++) binary += String.fromCharCode(this[i]!);
      return btoa(binary);
    }
    return new TextDecoder("utf-8").decode(this);
  }
  includes(search: unknown): boolean {
    if (typeof search === "string") {
      const needle = encoder.encode(search);
      if (needle.length === 0) return true;
      if (needle.length > this.length) return false;
      outer: for (let i = 0; i <= this.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
          if (this[i + j] !== needle[j]) continue outer;
        }
        return true;
      }
      return false;
    }
    return super.includes(search as number);
  }
  equals(other: Uint8Array): boolean {
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i++) if (this[i] !== other[i]) return false;
    return true;
  }
}

const globalObject = globalThis as typeof globalThis & { Buffer: typeof Buffer };
globalObject.Buffer = Buffer;
