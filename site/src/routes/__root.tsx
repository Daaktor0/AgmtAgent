import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const NAME = "Agmt";
const DESCRIPTION =
  "Free agreement proofing for Indian transaction teams. Catch broken references, drifting defined terms, numbering gaps and leftover blanks before the next review.";

const THEME_SCRIPT = `
  (() => {
    try {
      const saved = localStorage.getItem("agmt-color-theme");
      const systemNight = matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = saved === "day" || saved === "night" ? saved : systemNight ? "night" : "day";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light";
    } catch {
      document.documentElement.dataset.theme = "day";
    }
  })();
`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: NAME },
      { name: "description", content: DESCRIPTION },
      { name: "theme-color", content: "#101419" },
      { name: "color-scheme", content: "light dark" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: NAME },
      { property: "og:title", content: "Agmt — Proofing should not take another evening." },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: "/og.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/og.jpg" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
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
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
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
