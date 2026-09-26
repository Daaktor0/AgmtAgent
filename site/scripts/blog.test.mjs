import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePost, publishable, showDrafts, slugify } from "../src/lib/blog/parse.js";

const post = (front, body = "Hello.") => `---\n${front}\n---\n\n${body}\n`;

test("a post's header becomes its fields", () => {
  const p = parsePost(
    "content/blog/counterparts.md",
    post(`title: Counterparts\ndate: 2026-10-02\nsummary: Why.\nauthor: Agmt\ntags: [Execution, "E-stamping"]\ncover: /blog/media/a.webp\ncoverAlt: Pages\ndraft: true`),
  );
  assert.equal(p.slug, "counterparts");
  assert.equal(p.title, "Counterparts");
  assert.equal(p.date, "2026-10-02");
  assert.deepEqual(p.tags, ["Execution", "E-stamping"]);
  assert.equal(p.cover, "/blog/media/a.webp");
  assert.equal(p.draft, true);
  assert.equal(p.minutes, 1);
});

test("dates written with a time, or parsed by YAML, come out as a day", () => {
  assert.equal(parsePost("a.md", post("title: A\ndate: 2026-10-02T09:30:00.000Z")).date, "2026-10-02");
  assert.equal(parsePost("a.md", post("title: A\ndate: '2026-10-02'")).date, "2026-10-02");
});

test("a post without a title or a date fails the build, not the page", () => {
  assert.throws(() => parsePost("a.md", post("date: 2026-10-02")), /title/);
  assert.throws(() => parsePost("a.md", post("title: A")), /date/);
});

test("defaults: author Agmt, published, no tags", () => {
  const p = parsePost("a.md", post("title: A\ndate: 2026-10-02"));
  assert.equal(p.author, "Agmt");
  assert.equal(p.draft, false);
  assert.deepEqual(p.tags, []);
  assert.equal(p.cover, null);
});

test("headings sit under the page title and get anchors", () => {
  const { html } = parsePost("a.md", post("title: A\ndate: 2026-10-02", "# Top\n\n## What “complete” means"));
  assert.match(html, /<h2 id="top">Top<\/h2>/);
  assert.match(html, /<h2 id="what-complete-means">/);
});

test("outside links are marked, images get a caption from their title", () => {
  const { html } = parsePost(
    "a.md",
    post("title: A\ndate: 2026-10-02", '[x](https://example.com) [y](/products/execute)\n\n![Pages](/blog/media/p.webp "Sorted pages")'),
  );
  assert.match(html, /href="https:\/\/example.com" rel="noopener"/);
  assert.doesNotMatch(html, /href="\/products\/execute" rel/);
  assert.match(html, /<figure><img src="\/blog\/media\/p.webp" alt="Pages" loading="lazy"/);
  assert.match(html, /<figcaption>Sorted pages<\/figcaption>/);
});

test("drafts show everywhere but the live site", () => {
  assert.equal(showDrafts({ VERCEL_ENV: "production", NODE_ENV: "production" }), false);
  assert.equal(showDrafts({ VERCEL_ENV: "preview", NODE_ENV: "production" }), true);
  assert.equal(showDrafts({ NODE_ENV: "development" }), true);
  assert.equal(showDrafts({ NODE_ENV: "production" }), false);
  assert.equal(showDrafts({ NODE_ENV: "production", AGMT_SHOW_DRAFTS: "1" }), true);
  assert.equal(showDrafts({ VERCEL_ENV: "preview", AGMT_SHOW_DRAFTS: "0" }), false);
});

test("newest first; drafts left out unless asked for", () => {
  const a = parsePost("a.md", post("title: A\ndate: 2026-10-01"));
  const b = parsePost("b.md", post("title: B\ndate: 2026-10-03"));
  const c = parsePost("c.md", post("title: C\ndate: 2026-10-02\ndraft: true"));
  assert.deepEqual(publishable([a, b, c], false).map((p) => p.slug), ["b", "a"]);
  assert.deepEqual(publishable([a, b, c], true).map((p) => p.slug), ["b", "c", "a"]);
});

test("slugify makes tidy addresses", () => {
  assert.equal(slugify("E-stamp papers"), "e-stamp-papers");
  assert.equal(slugify("  Café & Closings! "), "cafe-closings");
});

test("every post in content/blog parses", () => {
  const dir = join(fileURLToPath(new URL("..", import.meta.url)), "content", "blog");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const p = parsePost(file, readFileSync(join(dir, file), "utf8"));
    assert.ok(p.summary, `${file} needs a summary: it's what shows when the post is shared`);
    assert.match(p.slug, /^[a-z0-9-]+$/, `${file}: file names are the post's address`);
  }
});

test("straight quotes become typographer's quotes, but not in code", () => {
  const { html } = parsePost("a.md", post("title: A\ndate: 2026-10-02", `What "complete" means, and it's \`"raw"\`.`));
  assert.match(html, /What “complete” means, and it’s <code>&quot;raw&quot;<\/code>/);
});
