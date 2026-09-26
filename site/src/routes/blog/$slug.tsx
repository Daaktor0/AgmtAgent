import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Rss } from "@/components/icons";
import { PostGrid, PostMeta, TagList } from "@/components/posts";
import { fetchPost, postImage } from "@/lib/blog";
import { seo } from "@/lib/seo";
import { SITE, absoluteUrl } from "@/lib/site";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => fetchPost({ data: params.slug }),
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { post } = loaderData;
    const path = `/blog/${post.slug}`;
    const head = seo({
      title: post.title,
      description: post.summary || SITE.description,
      path,
      image: postImage(post),
      imageAlt: post.cover ? post.coverAlt || post.title : post.title,
      type: "article",
      article: { publishedTime: post.date, author: post.author, tags: post.tags },
      noindex: post.draft,
    });
    return {
      ...head,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.summary,
            datePublished: post.date,
            author: { "@type": post.author === SITE.name ? "Organization" : "Person", name: post.author },
            publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
            image: absoluteUrl(postImage(post)),
            mainEntityOfPage: absoluteUrl(path),
            keywords: post.tags.join(", "),
          }),
        },
      ],
    };
  },
  component: PostPage,
});

function PostPage() {
  const { post, more } = Route.useLoaderData();

  return (
    <>
      <article>
        <header className="container-site pt-12 md:pt-20">
          <div className="mx-auto max-w-[720px]">
            <Link to="/blog" className="label inline-flex items-center gap-2 hover:text-ink">
              <ArrowRight className="rotate-180" size={14} /> Blog
            </Link>
            <h1 className="mt-8 font-serif text-[clamp(2.4rem,5.2vw,4.4rem)] leading-[1.02] font-normal tracking-[-0.035em]">
              {post.title}
            </h1>
            {post.summary ? (
              <p className="italic-serif mt-6 text-[clamp(1.25rem,1.9vw,1.5rem)] leading-[1.45] text-ink-2">
                {post.summary}
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-line py-4">
              <p className="text-[0.95rem]">
                By <span className="font-semibold">{post.author}</span>
              </p>
              <PostMeta post={post} />
            </div>
          </div>
          {post.cover ? (
            <figure className="mx-auto mt-10 max-w-[1040px]">
              <img
                src={post.cover}
                alt={post.coverAlt}
                className="block aspect-[16/9] w-full rounded-[14px] border border-line object-cover"
              />
            </figure>
          ) : null}
        </header>

        <div className="container-site">
          <div
            className="prose mx-auto mt-12 max-w-[720px] md:mt-14"
            dangerouslySetInnerHTML={{ __html: post.html }}
          />
          <footer className="mx-auto mt-16 max-w-[720px] border-t border-line pt-8">
            <TagList tags={post.tags} />
            <p className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-ink-2">
              <span>Get new posts as they're published.</span>
              <a href="/blog/rss.xml" className="link inline-flex items-center gap-1.5">
                <Rss /> RSS feed
              </a>
            </p>
          </footer>
        </div>
      </article>

      {more.length ? (
        <section className="mt-24 border-t border-line bg-bg-2">
          <div className="container-site py-20">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <h2 className="display-2">More from the blog</h2>
              <Link to="/blog" className="link-arrow">
                All posts <ArrowRight className="arrow" />
              </Link>
            </div>
            <div className="mt-12">
              <PostGrid posts={more} />
            </div>
          </div>
        </section>
      ) : (
        <div className="h-24" />
      )}
    </>
  );
}
