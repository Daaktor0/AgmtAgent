import { parsePost, publishable, showDrafts, slugify, type Post } from "./parse.js";

/**
 * Every post in site/content/blog, read at build time. Server-only: post
 * bodies never ship in the browser bundle; pages receive them through loaders.
 */
const files = import.meta.glob("/content/blog/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const ALL: Post[] = Object.entries(files).map(([file, raw]) => parsePost(file, raw));

export function allPosts(): Post[] {
  return publishable(ALL, showDrafts());
}

export function findPost(slug: string): Post | undefined {
  return allPosts().find((post) => post.slug === slug);
}

export function postsTagged(tagSlug: string): { tag: string; posts: Post[] } | undefined {
  const posts = allPosts().filter((post) => post.tags.some((tag) => slugify(tag) === tagSlug));
  if (!posts.length) return undefined;
  const tag = posts[0].tags.find((t) => slugify(t) === tagSlug) ?? tagSlug;
  return { tag, posts };
}

export function allTags(): { tag: string; slug: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const post of allPosts()) {
    for (const tag of post.tags) {
      const slug = slugify(tag);
      const entry = counts.get(slug) ?? { tag, count: 0 };
      entry.count += 1;
      counts.set(slug, entry);
    }
  }
  return [...counts.entries()]
    .map(([slug, { tag, count }]) => ({ tag, slug, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
