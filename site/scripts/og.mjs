#!/usr/bin/env node
/**
 * Social cards, drawn at every build into public/og/ (not committed):
 *
 *   og/default.png   the site
 *   og/execute.png   Execute's page
 *   og/blog.png      the blog index and tag pages
 *   og/blog/<post>.png  each post without a cover image
 *
 * Drafts get a card only where drafts are shown (not on the live site).
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blogCard, executeCard, postCard, siteCard, toPng } from "./og/render.mjs";
import { parsePost, publishable, showDrafts } from "../src/lib/blog/parse.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "og");
const postsDir = join(root, "content", "blog");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "blog"), { recursive: true });

const write = async (name, node) => writeFileSync(join(out, name), await toPng(node, 1200, 630));

await write("default.png", siteCard());
await write("execute.png", executeCard());
await write("blog.png", blogCard());

let files = [];
try {
  files = readdirSync(postsDir).filter((f) => f.endsWith(".md"));
} catch {
  // No posts yet.
}
// `npm run dev` passes --dev; anything else is a production build unless
// Vercel says it's a preview (see showDrafts).
const env = { ...process.env, NODE_ENV: process.argv.includes("--dev") ? "development" : "production" };
const posts = publishable(
  files.map((f) => parsePost(f, readFileSync(join(postsDir, f), "utf8"))),
  showDrafts(env),
);
for (const post of posts.filter((p) => !p.cover)) {
  await write(join("blog", `${post.slug}.png`), postCard(post));
}

console.log(`[og] ${3 + posts.filter((p) => !p.cover).length} social cards in public/og`);
