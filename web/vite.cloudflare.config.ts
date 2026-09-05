import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";

/**
 * Production build used by the Cloudflare Container deployment.
 *
 * The normal vite.config.ts keeps the Vercel preset for the existing Vercel
 * surface. The Cloudflare Worker proxies requests to a Node container, so this
 * build uses Nitro's node-server preset rather than the legacy Python/add-in
 * container or a Vercel serverless output.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    grokPwaPlugin(),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: "node-server",
      serverDir: "./server",
    }),
    viteReact(),
  ],
});
