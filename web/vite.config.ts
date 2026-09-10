import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
import { isMigrationFile } from "./scripts/migration-plan.mjs";
import {
  isForbiddenProofWorkerImport,
  isProofWorkerImporter,
  rememberProofWorkerModule,
} from "./src/lib/proof-local/worker-graph.ts";

const webRoot = dirname(fileURLToPath(import.meta.url));

/** Client/worker Node stand-ins. SSR keeps real `node:*` modules. */
function proofLocalBrowserShims(): Plugin {
  const platform = join(webRoot, "src/lib/platform");
  const aliases: Record<string, string> = {
    "node:crypto": join(platform, "node-crypto.ts"),
    "node:assert/strict": join(platform, "node-assert.ts"),
    "node:assert": join(platform, "node-assert.ts"),
    "node:zlib": join(platform, "node-zlib.ts"),
  };
  const envelope = join(platform, "envelope-forbidden.ts");
  const workerGraph = new Set<string>();
  return {
    name: "agmt-proof-local-shims",
    enforce: "pre",
    async resolveId(id, importer, options) {
      if (options.ssr) return null;
      const fromWorker = isProofWorkerImporter(importer, workerGraph);
      if (fromWorker && isForbiddenProofWorkerImport(id)) {
        throw new Error(`forbidden in browser Proof worker: ${id}`);
      }
      if (aliases[id]) {
        if (fromWorker) rememberProofWorkerModule(aliases[id], workerGraph);
        return aliases[id];
      }
      const importerNorm = (importer ?? "").split(/[/\\]/).join("/");
      const idNorm = id.split(/[/\\]/).join("/");
      if (
        importerNorm.includes("/src/lib/agmt/")
        && (idNorm.endsWith("crypto.ts") || idNorm.endsWith("/agmt/crypto"))
      ) {
        if (fromWorker) rememberProofWorkerModule(envelope, workerGraph);
        return envelope;
      }
      if (fromWorker && importer) {
        const resolved = await this.resolve(id, importer, { ...options, skipSelf: true });
        if (resolved?.id) {
          rememberProofWorkerModule(resolved.id, workerGraph);
          if (isForbiddenProofWorkerImport(resolved.id)) {
            throw new Error(`forbidden in browser Proof worker: ${id}`);
          }
        }
      }
      return null;
    },
  };
}

/** The files `src/lib/db.ts` globs — same directory, same non-recursive scope. */
function hasGlobbedMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

/**
 * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
 * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
 * on import.
 *
 * Vite awaiting the hook puts this on time-to-first-render, so an app with no
 * migrations — no schema to apply — skips it entirely rather than paying for a
 * PGLite instance it never queries.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasGlobbedMigrations(server.config.root)) return;
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        if (typeof mod.ensureDbReady === "function") {
          await mod.ensureDbReady();
        }
      } catch (err) {
        console.error("[app-builder] DB bootstrap failed:", err);
        throw err;
      }
    },
  };
}

// Keep the legacy preview path explicit while OAuth is disabled. This avoids
// falling through to the SPA for old bookmarks without exposing a provider.
function disabledAuthPopupPlugin(): Plugin {
  return {
    name: "app-builder:disabled-auth-popup",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? "").split("?", 1)[0] !== "/auth/popup") {
          next();
          return;
        }
        res.statusCode = 410;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end("OAuth sign-in is disabled; use email and password.");
      });
    },
  };
}

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
// The dev server starts once `src/router.tsx` and `src/routes/` exist — see
// AGENTS.md § "First scaffold".
export default defineConfig(({ command, isPreview, mode }) => ({
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
  worker: {
    format: "es",
    plugins: () => [proofLocalBrowserShims()],
  },
  plugins: [
    proofLocalBrowserShims(),
    pgliteBootstrapPlugin(),
    disabledAuthPopupPlugin(),
    // Dev-only /__app-env, read by scripts/check-auth-invariant.mjs.
    appEnvPlugin(),
    // PWA head + ?install=1 tutorial page; runs before Start/Nitro.
    grokPwaPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: mode === "cloudflare" ? "cloudflare_module" : "vercel",
            rollupConfig: { output: { inlineDynamicImports: true } },
            // Auto-registers server/middleware/* (the PWA install page +
            // manifest + head-tag middleware). Nitro v3 defaults serverDir to
            // false, so removing this silently unwires /?install=1 on deploys.
            serverDir: "./server",
            ...(mode === "cloudflare"
              ? { cloudflare: { deployConfig: true, nodeCompat: true } }
              : {}),
          }),
        ]
      : []),
    viteReact(),
  ],
}));
