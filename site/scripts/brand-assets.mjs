#!/usr/bin/env node
/**
 * Redraws the site's icons into public/ (committed; run by hand after a brand
 * change):  node scripts/brand-assets.mjs
 *
 *   favicon.svg           vector, text as outlines
 *   favicon.ico           16 and 32 px
 *   apple-touch-icon.png  180 px, square (iOS rounds it)
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { iconArt, toPng, toSvg } from "./og/render.mjs";

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

writeFileSync(join(pub, "favicon.svg"), await toSvg(iconArt(64), 64, 64));
writeFileSync(join(pub, "apple-touch-icon.png"), await toPng(iconArt(180, { rounded: false }), 180, 180));

/** An .ico holding PNG images, the format every browser accepts. */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const sizes = [16, 32];
const pngs = [];
for (const size of sizes) pngs.push({ size, data: await toPng(iconArt(size), size, size) });
writeFileSync(join(pub, "favicon.ico"), ico(pngs));

console.log("[brand] favicon.svg, favicon.ico, apple-touch-icon.png written to public/");
