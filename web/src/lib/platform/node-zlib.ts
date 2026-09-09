import pako from "pako";
import { BrowserBuffer as Buffer, ensureBrowserBuffer } from "./buffer.ts";

ensureBrowserBuffer();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[i] = crc >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array, previous = 0): number {
  let crc = (previous ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function inflateRawSync(data: Uint8Array, options: { maxOutputLength?: number } = {}): Buffer {
  const maxOutputLength = options.maxOutputLength ?? 8 * 1024 * 1024;
  const inflate = new pako.Inflate({ raw: true, chunkSize: 16_384 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  inflate.onData = (chunk: Uint8Array) => {
    size += chunk.length;
    if (size > maxOutputLength) throw new Error("zip_inflate_failed");
    chunks.push(chunk);
  };
  inflate.push(data instanceof Uint8Array ? data : new Uint8Array(data), true);
  if (inflate.err) throw new Error("zip_inflate_failed");
  if (chunks.length === 1) return Buffer.from(chunks[0]!);
  return Buffer.concat(chunks);
}

export default { crc32, inflateRawSync };
