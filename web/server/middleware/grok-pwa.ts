/**
 * Deployed-app (Nitro) half of the head chrome. Auto-registered as global h3
 * middleware because vite.config.ts sets `serverDir: "./server"` — without
 * that option Nitro v3 never scans this directory.
 *
 * - `/__grok/*` → 404. The app template served an installable "Grok App"
 *   manifest and a Home Screen tutorial here, so phones offered to "Install
 *   Grok App" on app.agmt.legal. Nothing of Grok's is served any more.
 * - HTML documents → stream-inject the share card (OG tags) at `</head>`,
 *   removing any template platform tags a page still carries.
 *   OG identity is baked via `virtual:grok-og-identity` at `vite build`
 *   (this function cannot read `src/lib/og/site.json` or `public/og.jpg`).
 *   This must be a middleware transforming `next()`: h3 discards the `response`
 *   runtime hook's return value, and `render:html` does not exist in Nitro v3.
 */
import { grokOgIdentity } from "virtual:grok-og-identity";
import { createHeadInjector, isDocumentPath } from "../../scripts/grok-pwa-shared.mjs";

interface GrokPwaEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function requestHost(event: GrokPwaEvent): string {
  return (
    event.req.headers.get("x-forwarded-host") ?? event.req.headers.get("host") ?? event.url.host
  );
}

function injectHeadStreaming(response: Response, host: string): Response {
  const injector = createHeadInjector({
    host,
    site: grokOgIdentity.site,
  });
  const transformed = response.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        for (const out of injector.push(chunk)) controller.enqueue(out);
      },
      flush(controller) {
        for (const out of injector.flush()) controller.enqueue(out);
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default async function grokPwaMiddleware(
  event: GrokPwaEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET") return next();

  const path = event.url.pathname;

  // The former Cloudflare deployment exposed the legacy Office task pane at
  // this path. Keep old bookmarks useful after the platform cutover, but do
  // not serve the legacy pane from the current web Worker.
  if (path === "/taskpane.html") {
    return Response.redirect(new URL("/", event.url), 302);
  }

  if (path.startsWith("/__grok/")) {
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } });
  }

  if (!isDocumentPath(path)) return next();

  const result = await next();
  if (
    result instanceof Response &&
    result.body &&
    String(result.headers.get("content-type") ?? "").includes("text/html") &&
    !result.headers.get("content-encoding")
  ) {
    return injectHeadStreaming(result, requestHost(event));
  }
  return result;
}
