import { SITE, absoluteUrl } from "./site";

type Seo = {
  /** Page title without the site name; omit on the home page. */
  title?: string;
  description: string;
  /** Path of the page, for the canonical link. */
  path: string;
  /** Social card, relative to the site root. */
  image?: string;
  imageAlt?: string;
  type?: "website" | "article";
  article?: { publishedTime: string; author: string; tags: string[] };
  noindex?: boolean;
};

/**
 * Title, description, canonical link and social-card tags for a route's
 * `head()`. Every page gets a full set, so a shared link always unfurls with
 * the right title and picture.
 */
export function seo(page: Seo) {
  const title = page.title ? `${page.title} · ${SITE.name}` : `${SITE.name} · ${SITE.tagline}`;
  const image = absoluteUrl(page.image ?? "/og/default.png");
  const url = absoluteUrl(page.path);

  const meta: Record<string, string>[] = [
    { title },
    { name: "description", content: page.description },
    { property: "og:site_name", content: SITE.name },
    { property: "og:type", content: page.type ?? "website" },
    { property: "og:title", content: page.title ?? title },
    { property: "og:description", content: page.description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: page.imageAlt ?? page.title ?? SITE.tagline },
    { property: "og:locale", content: "en_IN" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: page.title ?? title },
    { name: "twitter:description", content: page.description },
    { name: "twitter:image", content: image },
  ];
  if (page.article) {
    meta.push(
      { property: "article:published_time", content: page.article.publishedTime },
      { property: "article:author", content: page.article.author },
      ...page.article.tags.map((tag) => ({ property: "article:tag", content: tag })),
    );
  }
  if (page.noindex) meta.push({ name: "robots", content: "noindex, nofollow" });

  return { meta, links: [{ rel: "canonical", href: url }] };
}
