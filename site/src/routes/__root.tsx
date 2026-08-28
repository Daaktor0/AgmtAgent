import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const NAME = "Agmt";
const DESCRIPTION =
  "Proof the artefact. Review the deal. A web product for Indian transactional counsel, reading SHA, SSA, SPA and disclosure-letter packs. Launching soon.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: NAME },
      { name: "description", content: DESCRIPTION },
      { name: "theme-color", content: "#faf8f4" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: NAME },
      { property: "og:title", content: "Agmt — Proof the artefact. Review the deal." },
      { property: "og:description", content: DESCRIPTION },
      // Site-relative until there is a domain to make it absolute against.
      { property: "og:image", content: "/og.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/og.png" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      // Type is self-hosted: no request leaves for a font CDN, and the page
      // sets the same on a firm network that blocks one.
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/spectral-latin-n400-5.woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/plexsans-latin-n400-3.woff2",
        crossOrigin: "anonymous",
      },
      { rel: "stylesheet", href: "/fonts/fonts.css" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: () => (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-paper font-sans text-ink">
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
