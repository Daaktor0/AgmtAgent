/**
 * Sends the executed-copies security policy as a real HTTP header with the
 * page at "/". Registered by Nitro (serverDir) and, by name, wraps the
 * platform head middleware, so the policy also covers what that one injects:
 * its third-party script is refused by the browser on this page.
 */
import { EXECUTE_CSP_HEADER } from "../../src/lib/execute/csp.ts";

interface CspEvent {
  url: URL;
  req: { method: string };
}

export default async function executeCspMiddleware(event: CspEvent, next: () => unknown | Promise<unknown>): Promise<unknown> {
  const result = await next();
  if (event.url.pathname !== "/" || !(result instanceof Response)) return result;
  if (!String(result.headers.get("content-type") ?? "").includes("text/html")) return result;
  const headers = new Headers(result.headers);
  headers.set("content-security-policy", EXECUTE_CSP_HEADER);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "same-origin");
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
}
