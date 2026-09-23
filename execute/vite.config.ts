import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The privacy promise, enforced by the browser: the built page may load only
 * its own files and may not open any network connection (no fetch, XHR,
 * WebSocket or beacon). Documents therefore cannot leave the machine, even by
 * a bug. Dev mode is exempt because Vite's live reload needs a socket.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

function lockdown(): Plugin {
  return {
    name: "agmt-execute:csp",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace(`<meta charset="utf-8" />`, `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), lockdown()],
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  preview: { host: "127.0.0.1", port: 4174, strictPort: true },
});
