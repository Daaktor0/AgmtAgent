/** Facts about Agmt used across the site. One place, so they never disagree. */
export const SITE = {
  name: "Agmt",
  url: "https://agmt.legal",
  email: "hello@agmt.legal",
  appUrl: "https://app.agmt.legal",
  tagline: "Legal work, down to the last page.",
  description:
    "Agmt builds software for the exacting side of legal practice. Its first product, Execute, assembles a complete executed copy of a multi-party agreement for every party, in your browser.",
} as const;

export const NAV = [
  { label: "Products", to: "/products" },
  { label: "Blog", to: "/blog" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
] as const;

export function absoluteUrl(path: string): string {
  return new URL(path, SITE.url).toString();
}
