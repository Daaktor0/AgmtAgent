import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { Post } from "./parse.js";

export type { Post };
export { slugify } from "./parse.js";

/** What a list of posts needs: everything but the body. */
export type PostSummary = Omit<Post, "html">;

const summarize = ({ html: _html, ...rest }: Post): PostSummary => rest;

export const fetchPosts = createServerFn({ method: "GET" }).handler(async () => {
  const { allPosts, allTags } = await import("./posts.server");
  return { posts: allPosts().map(summarize), tags: allTags() };
});

export const fetchPost = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const { allPosts, findPost } = await import("./posts.server");
    const post = findPost(slug);
    if (!post) throw notFound();
    const more = allPosts()
      .filter((p) => p.slug !== slug)
      .slice(0, 3)
      .map(summarize);
    return { post, more };
  });

export const fetchTag = createServerFn({ method: "GET" })
  .validator((tag: string) => tag)
  .handler(async ({ data: tag }) => {
    const { postsTagged } = await import("./posts.server");
    const found = postsTagged(tag);
    if (!found) throw notFound();
    return { tag: found.tag, posts: found.posts.map(summarize) };
  });

/** The social card for a post: its cover, or the card drawn by scripts/og.mjs. */
export function postImage(post: Pick<Post, "slug" | "cover">): string {
  return post.cover ?? `/og/blog/${post.slug}.png`;
}
