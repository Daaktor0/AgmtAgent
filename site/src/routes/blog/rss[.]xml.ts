import { createFileRoute } from "@tanstack/react-router";
import { allPosts } from "@/lib/blog/posts.server";
import { SITE, absoluteUrl } from "@/lib/site";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Relative links and images in a post, made absolute so they work in feed readers. */
const absolutize = (html: string) =>
  html.replace(/(href|src)="\/(?!\/)/g, `$1="${SITE.url}/`);

const rfc822 = (isoDate: string) => new Date(`${isoDate}T09:00:00+05:30`).toUTCString();

export function renderFeed(): string {
  const posts = allPosts();
  const items = posts
    .map((post) => {
      const url = absoluteUrl(`/blog/${post.slug}`);
      return `    <item>
      <title>${escape(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822(post.date)}</pubDate>
      <dc:creator>${escape(post.author)}</dc:creator>
${post.tags.map((tag) => `      <category>${escape(tag)}</category>`).join("\n")}
      <description>${escape(post.summary)}</description>
      <content:encoded><![CDATA[${absolutize(post.html).replaceAll("]]>", "]]]]><![CDATA[>")}]]></content:encoded>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Agmt blog</title>
    <link>${SITE.url}/blog</link>
    <atom:link href="${SITE.url}/blog/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Writing from Agmt on the procedure of legal practice and the products we're building for it.</description>
    <language>en-IN</language>
${posts[0] ? `    <lastBuildDate>${rfc822(posts[0].date)}</lastBuildDate>\n` : ""}${items}
  </channel>
</rss>
`;
}

export const Route = createFileRoute("/blog/rss.xml")({
  server: {
    handlers: {
      GET: () =>
        new Response(renderFeed(), {
          headers: {
            "content-type": "application/rss+xml; charset=utf-8",
            "cache-control": "public, max-age=0, s-maxage=3600",
          },
        }),
    },
  },
});
