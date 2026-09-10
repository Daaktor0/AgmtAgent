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

// @ts-expect-error Node-compatible Buffer.from on a Uint8Array subclass
export class BrowserBuffer extends Uint8Array {
  static from(input: unknown, encodingOrOffset?: string | number, length?: number): BrowserBuffer {
    if (input instanceof ArrayBuffer && typeof encodingOrOffset === "number") {
      const view = new Uint8Array(input, encodingOrOffset, length);
      const buf = new BrowserBuffer(view.byteLength);
      buf.set(view);
      return buf;
    }
    const raw = toBytes(input, typeof encodingOrOffset === "string" ? encodingOrOffset : undefined);
    const buf = new BrowserBuffer(raw.byteLength);
    buf.set(raw);
    return buf;
  }

  static alloc(size: number): BrowserBuffer {
    return new BrowserBuffer(size);
  }

  static concat(list: Array<Uint8Array>): BrowserBuffer {
    const total = list.reduce((sum, part) => sum + part.length, 0);
    const out = new BrowserBuffer(total);
    let offset = 0;
    for (const part of list) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  static isBuffer(value: unknown): value is BrowserBuffer {
    return value instanceof BrowserBuffer;
  }

  static byteLength(input: string | ArrayBufferView, _encoding?: string): number {
    if (typeof input === "string") return encoder.encode(input).byteLength;
    return input.byteLength;
  }

  copy(target: Uint8Array, targetStart = 0, sourceStart = 0, sourceEnd = this.length): number {
    const sliced = this.subarray(sourceStart, sourceEnd);
    target.set(sliced, targetStart);
    return sliced.length;
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

function isNodeRuntime(): boolean {
  return typeof process !== "undefined" && Boolean(process.versions?.node);
}

export function ensureBrowserBuffer(): typeof BrowserBuffer {
  if (isNodeRuntime()) return BrowserBuffer;
  (globalThis as unknown as { Buffer: typeof BrowserBuffer }).Buffer = BrowserBuffer;
  return BrowserBuffer;
}

export { BrowserBuffer as Buffer };

ensureBrowserBuffer();
