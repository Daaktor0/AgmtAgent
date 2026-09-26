import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { crc32 as nodeCrc32, deflateRawSync, inflateRawSync as nodeInflate } from "node:zlib";
import { BrowserBuffer } from "./buffer.ts";
import { createHash as browserCreateHash } from "./node-crypto.ts";
import { crc32, deflateRawSync as browserDeflate, inflateRawSync } from "./node-zlib.ts";
import { sha256Hex } from "./sha256.ts";

test("browser SHA-256 matches Node for empty, abc, and binary", () => {
  const samples = ["", "abc", "The Company shall recieve the the notice.", "a".repeat(4096)];
  for (const sample of samples) {
    const node = createHash("sha256").update(sample).digest("hex");
    assert.equal(sha256Hex(sample), node);
    assert.equal(browserCreateHash("sha256").update(sample).digest("hex"), node);
  }
  const binary = Uint8Array.from({ length: 257 }, (_, i) => i % 256);
  assert.equal(sha256Hex(binary), createHash("sha256").update(binary).digest("hex"));
});

test("browser crc32 and bounded inflateRaw match Node zlib", () => {
  const payload = Buffer.from("PK\u0003\u0004 bounded zip payload for Proof");
  assert.equal(crc32(payload) >>> 0, nodeCrc32(payload) >>> 0);
  const compressed = deflateRawSync(payload);
  assert.deepEqual(Buffer.from(browserDeflate(payload)), compressed);
  const inflated = inflateRawSync(compressed, { maxOutputLength: 1024 });
  assert.deepEqual(Buffer.from(inflated), nodeInflate(compressed));
  assert.throws(() => inflateRawSync(compressed, { maxOutputLength: 4 }), /zip_inflate_failed/);
});

test("browser Buffer from/copy/concat/byteLength", () => {
  const a = BrowserBuffer.from("agmt");
  const b = BrowserBuffer.alloc(4);
  a.copy(b);
  assert.equal(b.toString(), "agmt");
  assert.equal(BrowserBuffer.byteLength("agmt"), 4);
  assert.equal(BrowserBuffer.concat([a, BrowserBuffer.from("!")]).toString(), "agmt!");
  assert.equal(a.equals(BrowserBuffer.from("agmt")), true);
  const bigger = new Uint8Array([0, 1, 2, 3, 4, 5]);
  const sliced = BrowserBuffer.from(bigger.buffer, 2, 3);
  assert.deepEqual([...sliced], [2, 3, 4]);
});
