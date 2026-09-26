/**
 * Draws Agmt's social cards and icons with Satori (layout to SVG, text as
 * outlines) and resvg (SVG to PNG), from the fonts in ./fonts. Shared by
 * scripts/og.mjs (cards, every build) and scripts/brand-assets.mjs (icons).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const font = (file) => readFileSync(join(here, "fonts", file));

const FONTS = [
  { name: "Newsreader", data: font("newsreader-latin-500-normal.woff"), weight: 500, style: "normal" },
  { name: "Instrument Sans", data: font("instrument-sans-latin-500-normal.woff"), weight: 500, style: "normal" },
  { name: "Instrument Sans", data: font("instrument-sans-latin-600-normal.woff"), weight: 600, style: "normal" },
  { name: "Geist Mono", data: font("geist-mono-latin-500-normal.woff"), weight: 500, style: "normal" },
];

export const COLOR = {
  white: "#ffffff",
  bg2: "#f5f6f8",
  ink: "#0e1015",
  ink2: "#3e4450",
  ink3: "#697080",
  line: "#e3e6eb",
  blue: "#2343d6",
  night: "#0b0d12",
  nightInk: "#eef0f4",
  nightInk2: "#a4abb8",
  nightBlue: "#93a6ff",
  execute: "#6b2b2b",
};

/** A tiny element builder, so cards read like markup without a JSX step. */
export function h(type, style = {}, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return {
    type,
    props: {
      style: { display: "flex", ...style },
      children: kids.length === 1 ? kids[0] : kids,
    },
  };
}

export async function toSvg(node, width, height) {
  return satori(node, { width, height, fonts: FONTS });
}

export async function toPng(node, width, height) {
  const svg = await toSvg(node, width, height);
  return new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
}

/* ------------------------------------------------------------- pieces --- */

export function wordmark(size, color = COLOR.ink, dot = COLOR.blue) {
  return h(
    "div",
    { alignItems: "flex-end", fontFamily: "Newsreader", fontSize: size, letterSpacing: -size * 0.035, color, lineHeight: 1 },
    "Agmt",
    h("div", { width: size * 0.19, height: size * 0.19, background: dot, marginLeft: size * 0.06, marginBottom: size * 0.16 }),
  );
}

export function executeMark(size, ink = COLOR.ink) {
  const u = size / 32;
  const bar = (x, y, w, hgt, bg) =>
    h("div", { position: "absolute", left: x * u, top: y * u, width: w * u, height: hgt * u, background: bg });
  return h(
    "div",
    { position: "relative", width: size, height: size },
    bar(6, 5, 4, 22, ink),
    bar(11.5, 5, 15, 4, ink),
    bar(11.5, 14, 11, 4, ink),
    bar(11.5, 23, 15, 4, COLOR.execute),
  );
}

function label(text, color) {
  return h(
    "div",
    { fontFamily: "Geist Mono", fontSize: 22, letterSpacing: 2, textTransform: "uppercase", color },
    text,
  );
}

function titleSize(text) {
  if (text.length <= 34) return 92;
  if (text.length <= 60) return 76;
  if (text.length <= 90) return 62;
  return 52;
}

/* -------------------------------------------------------------- cards --- */

/** The site's card: night, with the tagline. */
export function siteCard() {
  return h(
    "div",
    { width: 1200, height: 630, background: COLOR.night, padding: 72, flexDirection: "column", justifyContent: "space-between" },
    h("div", { justifyContent: "space-between", alignItems: "center" }, wordmark(56, COLOR.nightInk, COLOR.nightBlue), label("Legal products", COLOR.nightInk2)),
    h(
      "div",
      { fontFamily: "Newsreader", fontSize: 104, lineHeight: 0.98, letterSpacing: -3.6, color: COLOR.nightInk, maxWidth: 900 },
      "Legal work, down to the last page.",
    ),
    h("div", { fontFamily: "Geist Mono", fontSize: 24, color: COLOR.nightInk2, letterSpacing: 1 }, "agmt.legal"),
  );
}

/** Execute's card: white, with its mark and promise. */
export function executeCard() {
  return h(
    "div",
    { width: 1200, height: 630, background: COLOR.white, padding: 72, flexDirection: "column", justifyContent: "space-between", borderTop: `14px solid ${COLOR.execute}` },
    h(
      "div",
      { justifyContent: "space-between", alignItems: "center" },
      h(
        "div",
        { alignItems: "center" },
        executeMark(54),
        h("div", { fontFamily: "Newsreader", fontSize: 52, letterSpacing: -1.6, color: COLOR.ink, marginLeft: 16 }, "Execute"),
        h("div", { fontFamily: "Instrument Sans", fontWeight: 600, fontSize: 18, letterSpacing: 2.5, color: COLOR.ink3, marginLeft: 18, paddingLeft: 18, borderLeft: `2px solid ${COLOR.line}` }, "BY AGMT"),
      ),
      label("Closed beta", COLOR.execute),
    ),
    h(
      "div",
      { fontFamily: "Newsreader", fontSize: 88, lineHeight: 1, letterSpacing: -3, color: COLOR.ink, maxWidth: 1000 },
      "Every page. Every party. One executed copy each.",
    ),
    h(
      "div",
      { justifyContent: "space-between", fontFamily: "Instrument Sans", fontSize: 26, color: COLOR.ink2 },
      "Signature pages out. Signed pages and stamp papers in. Nothing uploaded.",
    ),
  );
}

/** The blog's card. */
export function blogCard() {
  return h(
    "div",
    { width: 1200, height: 630, background: COLOR.bg2, padding: 72, flexDirection: "column", justifyContent: "space-between" },
    h("div", { justifyContent: "space-between", alignItems: "center" }, wordmark(52), label("Blog", COLOR.ink3)),
    h(
      "div",
      { fontFamily: "Newsreader", fontSize: 96, lineHeight: 1, letterSpacing: -3.2, color: COLOR.ink, maxWidth: 980 },
      "Notes on legal work and the tools for it.",
    ),
    h("div", { fontFamily: "Geist Mono", fontSize: 24, color: COLOR.ink3, letterSpacing: 1 }, "agmt.legal/blog"),
  );
}

/** A post's card, used when the post has no cover image. */
export function postCard({ title, date, author, tags }) {
  const size = titleSize(title);
  const when = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return h(
    "div",
    { width: 1200, height: 630, background: COLOR.white, flexDirection: "column" },
    h("div", { height: 12, background: COLOR.blue }),
    h(
      "div",
      { flex: 1, padding: "60px 72px 64px", flexDirection: "column", justifyContent: "space-between" },
      h("div", { justifyContent: "space-between", alignItems: "center" }, wordmark(48), label(tags[0] ? `Blog · ${tags[0]}` : "Blog", COLOR.ink3)),
      h("div", { fontFamily: "Newsreader", fontSize: size, lineHeight: 1.02, letterSpacing: -size * 0.032, color: COLOR.ink, maxWidth: 1040 }, title),
      h(
        "div",
        { justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${COLOR.line}`, paddingTop: 24, fontFamily: "Instrument Sans", fontSize: 26, color: COLOR.ink2 },
        h("div", {}, `By ${author}`),
        h("div", { fontFamily: "Geist Mono", fontSize: 22, color: COLOR.ink3 }, when),
      ),
    ),
  );
}

/* -------------------------------------------------------------- icons --- */

/** The app icon: "A" and the blue full stop, on ink. */
export function iconArt(size, { rounded = true } = {}) {
  const s = size / 64;
  return h(
    "div",
    { width: size, height: size, background: COLOR.ink, borderRadius: rounded ? 14 * s : 0, alignItems: "center", justifyContent: "center" },
    h(
      "div",
      { alignItems: "flex-end", fontFamily: "Newsreader", fontSize: 50 * s, lineHeight: 1, color: COLOR.white, marginTop: 4 * s, marginLeft: 4 * s },
      "A",
      h("div", { width: 7.5 * s, height: 7.5 * s, background: "#5b75ff", marginLeft: 2 * s, marginBottom: 9 * s }),
    ),
  );
}
