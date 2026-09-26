import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "@/components/icons";
import { PageIntro } from "@/components/layout";
import { PostGrid } from "@/components/posts";
import { fetchTag } from "@/lib/blog";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/blog/tag/$tag")({
  loader: ({ params }) => fetchTag({ data: params.tag }),
  head: ({ loaderData, params }) =>
    seo({
      title: `${loaderData?.tag ?? params.tag} · Blog`,
      description: `Posts from the Agmt blog about ${loaderData?.tag ?? params.tag}.`,
      path: `/blog/tag/${params.tag}`,
      image: "/og/blog.png",
    }),
  component: TagPage,
});

function TagPage() {
  const { tag, posts } = Route.useLoaderData();
  return (
    <>
      <PageIntro label="Blog · Topic" title={tag}>
        <p>
          {posts.length} {posts.length === 1 ? "post" : "posts"}.{" "}
          <Link to="/blog" className="link-arrow inline-flex">
            All posts <ArrowRight className="arrow" />
          </Link>
        </p>
      </PageIntro>
      <section className="container-site pb-24 md:pb-32">
        <PostGrid posts={posts} />
      </section>
    </>
  );
}
