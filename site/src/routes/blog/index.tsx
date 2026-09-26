import { createFileRoute, Link } from "@tanstack/react-router";
import { Rss } from "@/components/icons";
import { PageIntro } from "@/components/layout";
import { PostCard, PostGrid } from "@/components/posts";
import { fetchPosts } from "@/lib/blog";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/blog/")({
  loader: () => fetchPosts(),
  head: () =>
    seo({
      title: "Blog",
      description:
        "Writing from Agmt on the procedure of legal practice, the products we're building for it, and what we learn along the way.",
      path: "/blog",
      image: "/og/blog.png",
    }),
  component: BlogIndex,
});

function BlogIndex() {
  const { posts, tags } = Route.useLoaderData();
  const [first, ...rest] = posts;

  return (
    <>
      <PageIntro label="Blog" title="Notes on legal work and the tools for it.">
        <p>
          On the procedure of legal practice, the products we're building for it, and what we learn
          along the way.{" "}
          <a href="/blog/rss.xml" className="link inline-flex items-center gap-1.5 whitespace-nowrap">
            <Rss /> Follow by RSS
          </a>
        </p>
      </PageIntro>

      <section className="container-site pb-24 md:pb-32">
        {tags.length > 1 ? (
          <nav aria-label="Topics" className="mb-14 flex flex-wrap items-center gap-2">
            <span className="label mr-2">Topics</span>
            {tags.map((t) => (
              <Link
                key={t.slug}
                to="/blog/tag/$tag"
                params={{ tag: t.slug }}
                className="rounded-full border border-line-2 px-3 py-1 text-[0.85rem] text-ink-2 transition-colors hover:border-ink hover:text-ink"
              >
                {t.tag} <span className="text-ink-3">{t.count}</span>
              </Link>
            ))}
          </nav>
        ) : null}

        {first ? (
          <>
            <PostCard post={first} featured />
            {rest.length ? (
              <div className="mt-16">
                <PostGrid posts={rest} />
              </div>
            ) : null}
          </>
        ) : (
          <div className="border-t border-ink pt-8">
            <p className="font-serif text-[clamp(1.8rem,3vw,2.4rem)] leading-tight tracking-[-0.02em]">
              The first posts are on their way.
            </p>
            <p className="mt-4 max-w-[52ch] text-ink-2">
              Add the feed to your reader and they'll arrive as soon as they're published.
            </p>
            <a href="/blog/rss.xml" className="btn btn-ghost mt-8">
              <Rss /> RSS feed
            </a>
          </div>
        )}
      </section>
    </>
  );
}
