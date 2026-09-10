import { createFileRoute } from "@tanstack/react-router";
import { auth, SESSION_TOKEN_COOKIE } from "@/lib/auth/server";
import { AUTH_ERROR_CODES } from "@/lib/auth/error-codes";

/**
 * Backstop for the whole /api/auth/* request, on top of db-guard.server.ts's
 * per-query bound. A single sign-in can issue more than one AUTH_DB round
 * trip (find user, create session), so this is set above that combined
 * worst case — it exists to catch a hang from any OTHER cause (not just the
 * database) so the client never waits past this without a response.
 */
const AUTH_HANDLER_TIMEOUT_MS = 15_000;

function jsonError(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function timeoutResponse(): Response {
  return jsonError(
    AUTH_ERROR_CODES.AUTH_REQUEST_TIMEOUT,
    "The authentication request took too long to complete.",
    504,
  );
}

/**
 * Better Auth's router turns any thrown value that is not one of its own
 * `APIError`s into `new Response(null, { status: 500 })` — no body, so
 * nothing to read `.message`/`.code` from client-side (see
 * `db-guard.server.ts` for where this is fixed at the source for AUTH_DB
 * failures). This is a last-resort net for any OTHER unhandled failure that
 * still reaches us that way, so a bug never regresses to the client seeing a
 * blank, uncoded 500.
 */
async function withStableErrorBody(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const body = await response.clone().text().catch(() => "");
  if (body) return response;
  return jsonError(
    AUTH_ERROR_CODES.AUTH_DATABASE_UNAVAILABLE,
    "The authentication service hit an unexpected error.",
    503,
  );
}

function hasSessionCredential(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  if (cookie.includes(SESSION_TOKEN_COOKIE)) return true;
  const authorization = request.headers.get("authorization") ?? "";
  return /^Bearer\s+\S+/i.test(authorization);
}

function cookielessSessionResponse(): Response {
  return new Response("null", {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname.endsWith("/get-session") && !hasSessionCredential(request)) {
    return cookielessSessionResponse();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Response>((resolve) => {
    timer = setTimeout(() => resolve(timeoutResponse()), AUTH_HANDLER_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([auth.handler(request), timeout]);
    return await withStableErrorBody(response);
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
