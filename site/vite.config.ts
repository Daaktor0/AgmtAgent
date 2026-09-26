import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { isMigrationFile } from "./scripts/migration-plan.mjs";

/**
 * Addresses from earlier versions of the site. Each one moves permanently, so
 * bookmarks and search results follow. Handled at the edge by Nitro's route
 * rules (written into Vercel's routing config), before any page renders.
 */
const REDIRECTS: Record<string, string> = {
  "/what": "/about",
  "/how": "/products",
  "/products/proof": "/products",
  "/beta": "/products/execute",
  "/builders": "/contact",
  "/trust": "/products/execute#documents",
  "/legal": "/terms",
  // The blog editor is a static page in public/write/; its files load relative to /write/.
  "/write": "/write/",
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};

/** The files `src/lib/db.ts` globs — same directory, same non-recursive scope. */
function hasGlobbedMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

/**
 * Local development only: start the embedded PGLite database (with the real
 * migrations applied) before the first request, so /admin works with nothing
 * configured. Production uses DATABASE_URL and never loads PGLite.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "agmt:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasGlobbedMigrations(server.config.root)) return;
      const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
        ensureDbReady?: () => Promise<void>;
      };
      await mod.ensureDbReady?.();
    },
  };
}

export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    pgliteBootstrapPlugin(),
    tailwindcss(),
    tanstackStart({
      pages: [{ path: "/blog/rss.xml" }, { path: "/sitemap.xml" }],
      prerender: {
        enabled: true,
        crawlLinks: true,
        failOnError: true,
        // /admin reads the database on request; everything else is static.
        filter: (page) => !page.path.startsWith("/admin"),
      },
    }),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "vercel",
            routeRules: Object.fromEntries(
              Object.entries(REDIRECTS).map(([from, to]) => [from, { redirect: { to, status: 301 } }]),
            ),
            // Headers go in as a Vercel route of their own with `continue`, so
            // they apply to every response and routing carries on afterwards.
            // (Nitro's header route rules stop Vercel's routing where they match.)
            vercel: {
              config: {
                routes: [{ src: "/(.*)", headers: SECURITY_HEADERS, continue: true }],
              },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
