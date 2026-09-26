// @ts-check
/**
 * Blog posts are Markdown files with a YAML header, written through the editor
 * at /write (Sveltia CMS) or by hand. This module turns one file into a post.
 * Plain JavaScript so both the site and scripts/og.mjs (plain Node) use it.
 */
import { Marked } from "marked";
import { parse as parseYaml } from "yaml";

/**
 * @typedef {object} Post
 * @property {string} slug        From the file name: counterparts.md -> "counterparts"
 * @property {string} title
 * @property {string} summary
 * @property {string} date        YYYY-MM-DD
 * @property {string} author
 * @property {string[]} tags      As written, e.g. "E-stamping"
 * @property {string | null} cover     Image path, e.g. /blog/media/pages.jpg
 * @property {string} coverAlt
 * @property {boolean} draft
 * @property {string} html
 * @property {number} minutes     Reading time, at 230 words a minute
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** "E-stamp papers" -> "e-stamp-papers". Used for tag addresses and heading anchors. */
export function slugify(/** @type {string} */ text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeAttr(/** @type {string} */ value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Typographer's quotes: "a" -> “a”, it's -> it’s. Code is left alone. */
export function smarten(/** @type {string} */ text) {
  return text
    .replace(/(^|[\s([{\u2014\u2013-])"/g, "$1\u201c")
    .replace(/"/g, "\u201d")
    .replace(/(^|[\s([{\u2014\u2013-])'/g, "$1\u2018")
    .replace(/'/g, "\u2019");
}

function renderer() {
  const marked = new Marked({ gfm: true });
  marked.use({
    walkTokens(token) {
      if (token.type === "text" && !("tokens" in token && token.tokens?.length)) {
        token.text = smarten(token.text);
      }
    },
  });
  marked.use({
    renderer: {
      // Posts sit under the page's own <h1>, so a "# Heading" becomes a section heading.
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const level = Math.min(Math.max(depth, 2), 4);
        return `<h${level} id="${slugify(text)}">${text}</h${level}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const external = /^https?:\/\//i.test(href) && !href.startsWith("https://agmt.legal");
        const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
        const rel = external ? ` rel="noopener"` : "";
        return `<a href="${escapeAttr(href)}"${titleAttr}${rel}>${text}</a>`;
      },
      // An image with a title ("![alt](src "caption")") becomes a figure with a caption.
      image({ href, title, text }) {
        const img = `<img src="${escapeAttr(href)}" alt="${escapeAttr(text)}" loading="lazy" decoding="async">`;
        return title ? `<figure>${img}<figcaption>${title}</figcaption></figure>` : img;
      },
    },
  });
  return marked;
}

const markdown = renderer();

/** A date written as 2026-10-02, 2026-10-02T09:00, or parsed by YAML into a Date. */
function toIsoDate(/** @type {unknown} */ value, /** @type {string} */ file) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text.trim());
  if (!match) throw new Error(`${file}: "date" must look like 2026-10-02 (got "${text}")`);
  return match[1];
}

function toTags(/** @type {unknown} */ value) {
  const list = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(list.map((tag) => String(tag).trim()).filter(Boolean))];
}

/**
 * @param {string} file  Path or name ending in .md
 * @param {string} raw   The file's contents
 * @returns {Post}
 */
export function parsePost(file, raw) {
  const name = file.split("/").pop() ?? file;
  const slug = name.replace(/\.md$/, "");
  const match = FRONTMATTER.exec(raw);
  const data = match ? (parseYaml(match[1]) ?? {}) : {};
  const body = match ? raw.slice(match[0].length) : raw;

  const title = String(data.title ?? "").trim();
  if (!title) throw new Error(`${name}: every post needs a "title"`);

  const words = body.replace(/[#>*_`[\]()!-]/g, " ").split(/\s+/).filter(Boolean).length;

  return {
    slug,
    title: smarten(title),
    summary: smarten(String(data.summary ?? "").trim()),
    date: toIsoDate(data.date, name),
    author: String(data.author ?? "").trim() || "Agmt",
    tags: toTags(data.tags),
    cover: data.cover ? String(data.cover) : null,
    coverAlt: String(data.coverAlt ?? "").trim(),
    draft: data.draft === true,
    html: /** @type {string} */ (markdown.parse(body)),
    minutes: Math.max(1, Math.round(words / 230)),
  };
}

/**
 * Drafts show everywhere except the live site: local development and Vercel
 * preview deployments render them (marked as drafts); production never does.
 * AGMT_SHOW_DRAFTS=1 or 0 overrides.
 */
export function showDrafts(env = process.env) {
  if (env.AGMT_SHOW_DRAFTS === "1") return true;
  if (env.AGMT_SHOW_DRAFTS === "0") return false;
  if (env.VERCEL_ENV) return env.VERCEL_ENV !== "production";
  return env.NODE_ENV !== "production";
}

/**
 * Newest first. Drafts are left out unless `withDrafts`.
 * @param {Post[]} posts
 * @param {boolean} withDrafts
 */
export function publishable(posts, withDrafts) {
  return posts
    .filter((post) => withDrafts || !post.draft)
    .sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date < b.date ? 1 : -1));
}
