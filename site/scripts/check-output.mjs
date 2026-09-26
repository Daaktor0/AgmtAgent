#!/usr/bin/env node
/**
 * Checks the built site (.vercel/output) before it ships. Run after
 * `npm run build`:  npm run check:output
 *
 * - every page has a title, description, canonical link and a social card
 *   that exists;
 * - no page, feed or source file names the retired products, Grok, or a web
 *   app manifest (the "install this app" prompt);
 * - the feed and sitemap list what they should;
 * - old addresses redirect permanently, and security headers apply to every
 *   response without stopping Vercel's routing.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePost, publishable, showDrafts } from "../src/lib/blog/parse.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, ".vercel", "output");
const staticDir = join(output, "static");
const problems = [];
const fail = (msg) => problems.push(msg);

if (!existsSync(staticDir)) {
  console.error("No build found. Run `npm run build` first.");
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/* --------------------------------------------------- forbidden mentions --- */

const FORBIDDEN = [
  [/\bProof\b/, "the retired product Proof"],
  [/\bReview by Agmt\b/, "the retired product Review"],
  [/\/products\/(proof|review)\b/i, "a retired product's address"],
  [/grok/i, "Grok"],
  [/rel=["']?manifest|webmanifest/i, "a web app manifest"],
];

const scanned = [
  ...walk(staticDir).filter((f) => /\.(html|xml|txt|yml|css|js)$/.test(f)),
  ...walk(join(root, "src")),
  ...walk(join(root, "content")),
];
for (const file of scanned) {
  const text = readFileSync(file, "utf8");
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(text)) fail(`${relative(root, file)} mentions ${what}`);
  }
}

/* ------------------------------------------------------------ pages --- */

const pages = walk(staticDir).filter((f) => f.endsWith(".html") && !f.includes(`${join("static", "write")}`));
if (pages.length < 8) fail(`only ${pages.length} pages were prerendered`);

const attr = (html, re) => re.exec(html)?.[1];
for (const file of pages) {
  const html = readFileSync(file, "utf8");
  const name = relative(staticDir, file);
  if (!/<title>[^<]{3,}<\/title>/.test(html)) fail(`${name}: no <title>`);
  if (!/<meta name="description" content="[^"]{20,}"/.test(html)) fail(`${name}: no description`);
  if (!/<link rel="canonical" href="https:\/\/agmt\.legal\//.test(html)) fail(`${name}: no canonical link`);
  if (!/<meta name="twitter:card" content="summary_large_image"/.test(html)) fail(`${name}: no twitter card`);
  const image = attr(html, /<meta property="og:image" content="https:\/\/agmt\.legal(\/[^"]+)"/);
  if (!image) fail(`${name}: no og:image`);
  else if (!existsSync(join(staticDir, image))) fail(`${name}: og:image ${image} doesn't exist`);
}

/* ------------------------------------------------------ feed, sitemap --- */

const postsDir = join(root, "content", "blog");
const posts = publishable(
  readdirSync(postsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parsePost(f, readFileSync(join(postsDir, f), "utf8"))),
  showDrafts({ ...process.env, NODE_ENV: "production" }),
);

const feedPath = join(staticDir, "blog", "rss.xml");
if (!existsSync(feedPath)) fail("no blog/rss.xml");
else {
  const feed = readFileSync(feedPath, "utf8");
  if (!feed.startsWith('<?xml version="1.0"') || !feed.includes("<channel>")) fail("rss.xml isn't an RSS feed");
  const items = (feed.match(/<item>/g) ?? []).length;
  if (items !== posts.length) fail(`rss.xml has ${items} posts; expected ${posts.length}`);
  for (const post of posts) {
    if (!feed.includes(`https://agmt.legal/blog/${post.slug}`)) fail(`rss.xml is missing ${post.slug}`);
    if (!existsSync(join(staticDir, "blog", post.slug, "index.html"))) fail(`post ${post.slug} wasn't prerendered`);
    if (!post.cover && !existsSync(join(staticDir, "og", "blog", `${post.slug}.png`))) fail(`post ${post.slug} has no social card`);
  }
}

const sitemapPath = join(staticDir, "sitemap.xml");
if (!existsSync(sitemapPath)) fail("no sitemap.xml");
else {
  const sitemap = readFileSync(sitemapPath, "utf8");
  for (const path of ["/", "/products/execute", "/blog", "/about", "/contact", "/privacy", "/terms"]) {
    if (!sitemap.includes(`<loc>https://agmt.legal${path === "/" ? "/" : path}</loc>`)) fail(`sitemap.xml is missing ${path}`);
  }
}

for (const file of ["favicon.svg", "favicon.ico", "apple-touch-icon.png", "robots.txt", "write/index.html", "write/config.yml"]) {
  if (!existsSync(join(staticDir, file))) fail(`missing ${file}`);
}

/* ---------------------------------------------------- routing config --- */

const EXPECTED_REDIRECTS = {
  "/what": "/about",
  "/how": "/products",
  "/products/proof": "/products",
  "/beta": "/products/execute",
  "/builders": "/contact",
  "/trust": "/products/execute#documents",
  "/legal": "/terms",
  "/write": "/write/",
};
const config = JSON.parse(readFileSync(join(output, "config.json"), "utf8"));
const routes = config.routes ?? [];
for (const [from, to] of Object.entries(EXPECTED_REDIRECTS)) {
  const route = routes.find((r) => r.src === from);
  if (!route) fail(`no redirect for ${from}`);
  else if (route.status !== 301 || route.headers?.Location !== to) {
    fail(`${from} should be a 301 to ${to}; it's ${route.status} to ${route.headers?.Location}`);
  }
}
const headerRoute = routes[0];
if (!(headerRoute?.src === "/(.*)" && headerRoute.continue === true && headerRoute.headers?.["x-content-type-options"])) {
  fail("the first route should set security headers on every response and continue");
}
if (!routes.some((r) => r.handle === "filesystem")) fail("routing never reaches the filesystem");

/* ------------------------------------------------------------ result --- */

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s) in the build:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `✓ build checked: ${pages.length} pages, ${posts.length} published posts, ${Object.keys(EXPECTED_REDIRECTS).length} redirects`,
);
