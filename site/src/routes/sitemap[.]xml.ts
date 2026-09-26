import { createFileRoute } from "@tanstack/react-router";
import { allPosts, allTags } from "@/lib/blog/posts.server";
import { absoluteUrl } from "@/lib/site";

const PAGES = ["/", "/products", "/products/execute", "/blog", "/about", "/contact", "/privacy", "/terms"];

export function renderSitemap(): string {
  const posts = allPosts().filter((post) => !post.draft);
  const entries = [
    ...PAGES.map((path) => ({ loc: absoluteUrl(path), lastmod: undefined as string | undefined })),
    ...posts.map((post) => ({ loc: absoluteUrl(`/blog/${post.slug}`), lastmod: post.date })),
    ...allTags().map((t) => ({ loc: absoluteUrl(`/blog/tag/${t.slug}`), lastmod: undefined })),
  ];
  const urls = entries
    .map(
      ({ loc, lastmod }) =>
        `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        new Response(renderSitemap(), {
          headers: { "content-type": "application/xml; charset=utf-8" },
        }),
    },
  },
});
