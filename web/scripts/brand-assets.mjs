#!/usr/bin/env node
/**
 * Draws the Agmt and Execute marks from the actual letterforms (Source Serif 4
 * and Archivo, SIL OFL, in public/fonts) into public/brand and public/, so
 * the marks never depend on a web font loading. Re-run after changing a mark:
 *
 *   node scripts/brand-assets.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { createCanvas, Path2D } from "@napi-rs/canvas";

const INK = "#1c1917";
const PAPER = "#f4efe6";
const VELLUM = "#fbf8f1";
const OXBLOOD = "#6b2b2b";
const OXBLOOD_LIFT = "#b8645a";
const STONE = "#565b5f";
const RULE = "#857d70";

const font = (name) => fontkit.create(readFileSync(new URL(`../public/fonts/${name}`, import.meta.url)));
const serif600 = font("source-serif-4-600.ttf");
const serif400 = font("source-serif-4-400.ttf");
const sans600 = font("archivo-600.ttf");

/** Outline of `text` with its baseline at (x, y); returns the path data and its advance width. */
function outline(f, text, size, x, y, tracking = 0) {
  const s = size / f.unitsPerEm;
  const run = f.layout(text);
  let pen = x;
  const parts = [];
  run.glyphs.forEach((g, i) => {
    parts.push(g.path.scale(s, -s).translate(pen + run.positions[i].xOffset * s, y).toSVG());
    pen += run.positions[i].xAdvance * s + tracking * size;
  });
  return { d: parts.join(""), width: pen - x - tracking * size };
}

/** The Execute mark on a 32 grid: a spine and three leaves, the signed one in oxblood. */
const EXECUTE_LEAVES = [
  { x: 6, y: 5, w: 4, h: 22, signed: false },
  { x: 11.5, y: 5, w: 15, h: 4, signed: false },
  { x: 11.5, y: 14, w: 11, h: 4, signed: false },
  { x: 11.5, y: 23, w: 15, h: 4, signed: true },
];
function executeMark(x, y, size, { ink = INK, signed = OXBLOOD } = {}) {
  const k = size / 32;
  return EXECUTE_LEAVES.map(
    (r) => `<rect x="${(x + r.x * k).toFixed(2)}" y="${(y + r.y * k).toFixed(2)}" width="${(r.w * k).toFixed(2)}" height="${(r.h * k).toFixed(2)}" fill="${r.signed ? signed : ink}"/>`,
  ).join("");
}

const svg = (w, h, body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}">${body}</svg>\n`;

function agmtWordmark() {
  const size = 40;
  const t = outline(serif600, "Agmt", size, 0, 36, -0.045);
  const sq = size * 0.16;
  const capTop = 36 - (serif600.capHeight / serif600.unitsPerEm) * size;
  const w = t.width + 3 + sq;
  return { w: Math.ceil(w), h: 48, body: `<path d="${t.d}" fill="${INK}"/><rect x="${(t.width + 3).toFixed(2)}" y="${capTop.toFixed(2)}" width="${sq}" height="${sq}" fill="${OXBLOOD}"/>` };
}

function agmtSymbol(withSquare = true) {
  const a = outline(serif600, "A", 22, 0, 0);
  const x = (32 - a.width) / 2 - 1;
  const glyph = outline(serif600, "A", 22, x, 23.5);
  return `<rect width="32" height="32" fill="${INK}"/><path d="${glyph.d}" fill="${PAPER}"/>${withSquare ? `<rect x="24" y="5.5" width="3.5" height="3.5" fill="${OXBLOOD_LIFT}"/>` : ""}`;
}

function executeLockup({ reversed = false } = {}) {
  const ink = reversed ? PAPER : INK;
  const signed = reversed ? OXBLOOD_LIFT : OXBLOOD;
  const word = outline(serif600, "Execute", 28, 42, 30, -0.02);
  const by = outline(sans600, "BY AGMT", 10, 0, 0, 0.14);
  const ruleX = 42 + word.width + 12;
  const byX = ruleX + 11;
  const byT = outline(sans600, "BY AGMT", 10, byX, 26.5, 0.14);
  const w = Math.ceil(byX + by.width + 7);
  const body =
    executeMark(0, 2, 32, { ink, signed }) +
    `<path d="${word.d}" fill="${ink}"/><rect x="${ruleX.toFixed(2)}" y="12" width="1" height="18" fill="${reversed ? "#6e6860" : RULE}"/>` +
    `<path d="${byT.d}" fill="${reversed ? "#c9c2b6" : STONE}"/><rect x="${(byX + by.width + 2.5).toFixed(2)}" y="16.5" width="3" height="3" fill="${signed}"/>`;
  return { w, h: 36, body };
}

function executeStacked() {
  const word = outline(serif600, "Execute", 34, 0, 0, -0.02);
  const by = outline(sans600, "BY AGMT", 10, 0, 0, 0.16);
  const w = Math.ceil(Math.max(word.width, by.width) + 8);
  const body =
    executeMark((w - 48) / 2, 0, 48) +
    `<path d="${outline(serif600, "Execute", 34, (w - word.width) / 2, 86, -0.02).d}" fill="${INK}"/>` +
    `<path d="${outline(sans600, "BY AGMT", 10, (w - by.width) / 2, 106, 0.16).d}" fill="${STONE}"/>`;
  return { w, h: 112, body };
}

function png(w, h, scale, draw, out) {
  const c = createCanvas(Math.round(w * scale), Math.round(h * scale));
  const ctx = c.getContext("2d");
  ctx.scale(scale, scale);
  draw(ctx);
  writeFileSync(out, c.toBuffer("image/png"));
}

/** Paint an SVG body made only of <rect> and <path d> elements onto a canvas. */
function paint(ctx, body, dx = 0, dy = 0, k = 1) {
  ctx.save();
  ctx.translate(dx, dy);
  ctx.scale(k, k);
  for (const m of body.matchAll(/<(rect|path) ([^>]*?)\/>/g)) {
    const a = Object.fromEntries([...m[2].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    ctx.fillStyle = a.fill;
    if (m[1] === "rect") ctx.fillRect(+a.x || 0, +a.y || 0, +a.width, +a.height);
    else ctx.fill(new Path2D(a.d));
  }
  ctx.restore();
}

const pub = new URL("../public/", import.meta.url);
const brand = new URL("brand/", pub);
mkdirSync(brand, { recursive: true });

const wm = agmtWordmark();
writeFileSync(new URL("agmt-wordmark.svg", brand), svg(wm.w, wm.h, wm.body, "Agmt"));
writeFileSync(new URL("agmt-symbol.svg", brand), svg(32, 32, agmtSymbol(), "Agmt"));
writeFileSync(new URL("favicon.svg", pub), svg(32, 32, agmtSymbol(false), "Agmt"));
writeFileSync(new URL("execute-mark.svg", brand), svg(32, 32, executeMark(0, 0, 32), "Execute"));
writeFileSync(new URL("favicon-execute.svg", pub), svg(32, 32, `<rect width="32" height="32" rx="3" fill="${PAPER}"/>${executeMark(0, 0, 32)}`, "Execute"));
const lock = executeLockup();
writeFileSync(new URL("execute-lockup.svg", brand), svg(lock.w, lock.h, lock.body, "Execute by Agmt"));
const rev = executeLockup({ reversed: true });
writeFileSync(new URL("execute-lockup-reversed.svg", brand), svg(rev.w, rev.h, `<rect width="${rev.w}" height="${rev.h}" fill="${INK}"/>${rev.body}`, "Execute by Agmt"));
const st = executeStacked();
writeFileSync(new URL("execute-lockup-stacked.svg", brand), svg(st.w, st.h, st.body, "Execute by Agmt"));

// Email header (Outlook doesn't render SVG): the lock-up at 2x on vellum.
png(lock.w, lock.h, 2, (ctx) => {
  ctx.fillStyle = VELLUM;
  ctx.fillRect(0, 0, lock.w, lock.h);
  paint(ctx, lock.body);
}, new URL("execute-lockup-email.png", brand));

// Home-screen icon.
png(180, 180, 1, (ctx) => {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, 180, 180);
  paint(ctx, executeMark(0, 0, 32), 26, 26, 4);
}, new URL("execute-180.png", brand));

// Social preview, 1200 x 630: the lock-up and the promise on paper; the mark, cropped large, on ink.
png(1200, 630, 1, (ctx) => {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, 1200, 630);
  paint(ctx, lock.body, 72, 72, 1.6);
  const lines = ["An executed copy for", "every party, assembled", "on your computer."];
  lines.forEach((line, i) => paint(ctx, `<path d="${outline(serif400, line, 54, 0, 0, -0.015).d}" fill="${INK}"/>`, 72, 300 + i * 66));
  paint(ctx, `<path d="${outline(sans600, "APP.AGMT.LEGAL", 15, 0, 0, 0.16).d}" fill="${STONE}"/>`, 72, 560);
  ctx.fillStyle = INK;
  ctx.fillRect(720, 0, 480, 630);
  const k = 19;
  for (const r of EXECUTE_LEAVES) {
    ctx.fillStyle = r.signed ? OXBLOOD_LIFT : PAPER;
    ctx.fillRect(720 + 40 + (r.x - 6) * k, 315 - 16 * k + r.y * k, r.w * k, r.h * k);
  }
}, new URL("og-execute.png", pub));

console.log("brand assets written to public/ and public/brand/");
