import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Layout } from "@/components/layout";
import { SITE } from "@/lib/site";
import appCss from "../styles.css?url";

const ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE.name,
  url: SITE.url,
  email: SITE.email,
  logo: `${SITE.url}/apple-touch-icon.png`,
  description: SITE.description,
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#ffffff", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#0b0d12", media: "(prefers-color-scheme: dark)" },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: "Agmt blog",
        href: `${SITE.url}/blog/rss.xml`,
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/newsreader-opsz.woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/instrument-sans.woff2",
        crossOrigin: "anonymous",
      },
      { rel: "stylesheet", href: appCss },
    ],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(ORGANIZATION) }],
  }),
  component: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: PageError,
});

function RootDocument() {
  return (
    <html lang="en-IN">
      <head>
        <HeadContent />
      </head>
      <body>
        <Layout>
          <Outlet />
        </Layout>
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <section className="container-site flex min-h-[60vh] flex-col items-start justify-center py-24">
      <p className="label">Not found</p>
      <h1 className="display-1 mt-5 max-w-[14ch]">This page isn't in the bundle.</h1>
      <p className="lead mt-6 max-w-[48ch]">
        The address may be mistyped, or the page may have moved. Everything Agmt publishes is a
        click away from the home page.
      </p>
      <div className="mt-9 flex flex-wrap gap-3">
        <Link to="/" className="btn btn-primary">
          Back to Agmt
        </Link>
        <Link to="/blog" className="btn btn-ghost">
          Read the blog
        </Link>
      </div>
    </section>
  );
}

function PageError(_props: ErrorComponentProps) {
  return (
    <section className="container-site flex min-h-[60vh] flex-col items-start justify-center py-24">
      <p className="label">Something went wrong</p>
      <h1 className="display-2 mt-5 max-w-[18ch]">This page couldn't load.</h1>
      <p className="lead mt-6 max-w-[48ch]">Try again in a moment. If it keeps happening, tell us at {SITE.email}.</p>
      <div className="mt-9 flex flex-wrap gap-3">
        <button type="button" onClick={() => window.location.reload()} className="btn btn-primary">
          Try again
        </button>
        <Link to="/" className="btn btn-ghost">
          Back to Agmt
        </Link>
      </div>
    </section>
  );
}
