import { Link } from "@tanstack/react-router";
import { ArrowRight } from "./icons";
import { slugify, type PostSummary } from "@/lib/blog";
import { cn, formatDate } from "@/lib/utils";

export function PostMeta({ post, className }: { post: PostSummary; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.75rem] tracking-[0.04em] text-ink-3 uppercase", className)}>
      <time dateTime={post.date}>{formatDate(post.date)}</time>
      <span aria-hidden>·</span>
      <span>{post.minutes} min read</span>
      {post.draft ? (
        <span className="rounded-full bg-execute-wash px-2 py-0.5 text-execute">Draft, not on the live site</span>
      ) : null}
    </p>
  );
}

export function TagList({ tags, className }: { tags: string[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {tags.map((tag) => (
        <li key={tag}>
          <Link
            to="/blog/tag/$tag"
            params={{ tag: slugify(tag) }}
            className="inline-flex rounded-full border border-line-2 px-3 py-1 text-[0.82rem] text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            {tag}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** One post in a list: date, title, summary. The whole card is the link. */
export function PostCard({ post, featured = false }: { post: PostSummary; featured?: boolean }) {
  return (
    <article className="group relative flex h-full flex-col border-t border-ink pt-6">
      <PostMeta post={post} />
      <h3
        className={cn(
          "mt-4 font-serif tracking-[-0.02em] text-ink transition-colors group-hover:text-blue",
          featured ? "text-[clamp(1.9rem,3.4vw,2.9rem)] leading-[1.05]" : "text-[1.6rem] leading-[1.15]",
        )}
      >
        <Link to="/blog/$slug" params={{ slug: post.slug }} className="after:absolute after:inset-0">
          {post.title}
        </Link>
      </h3>
      {post.summary ? (
        <p className={cn("mt-3 text-ink-2", featured ? "max-w-[56ch] text-[1.15rem]" : "text-[1rem]")}>
          {post.summary}
        </p>
      ) : null}
      <span className="link-arrow mt-auto pt-6 text-[0.95rem] group-hover:text-blue">
        Read <ArrowRight className="arrow" />
      </span>
    </article>
  );
}

export function PostGrid({ posts }: { posts: PostSummary[] }) {
  return (
    <div className="grid gap-x-10 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <PostCard key={post.slug} post={post} />
      ))}
    </div>
  );
}
