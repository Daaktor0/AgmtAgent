import { getRequest } from "@tanstack/react-start/server";
import { applicationDatabaseConnectionString, serverEnv } from "../runtime-env.server.ts";
import { gateIdentityEnabled } from "./gate-identity.server";
import { auth, authConfigured, isAuthConfigured } from "./server";

/**
 * Server-side session resolution (server-only).
 *
 * Agmt runs Better Auth at same-origin `/api/auth/*`. A valid Better Auth
 * session is authoritative regardless of how it was opened: email verification,
 * delivered magic link, gate identity, or the temporary isolated product-testing flow.
 * Never trust a client-supplied user id — only Better Auth's verified session.
 */

/** True when a real database is configured server-side. */
function databaseConfigured(): boolean {
  return Boolean(applicationDatabaseConnectionString());
}

/** Re-export so callers can branch on it without importing `server.ts`. */
export { authConfigured };

/** Dev fallback user id, used only for local development with no persistent DB. */
export const DEV_USER_ID = "dev-user";

/**
 * Thrown by `requireUserId` when the caller has no valid session. Carries
 * `status: 401`; the message is a stable contract for route guards.
 */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

/**
 * Resolve a real Better Auth session from the current request.
 *
 * Do this BEFORE considering whether an interactive provider is configured.
 * The temporary product-testing entrypoint deliberately creates a real Better
 * Auth user/session even while email login is bypassed. Rejecting that
 * session merely because an OAuth provider is absent would collapse the test
 * workspace back onto the unsafe shared-dev-user path.
 */
export async function getSessionUser(
  bearerToken?: string,
): Promise<VerifiedUser | null> {
  const request = getRequest();
  if (!request) return null;
  let headers = request.headers;
  if (bearerToken) {
    headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }
  try {
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return null;
    return { id: session.user.id, email: session.user.email ?? null };
  } catch {
    return null;
  }
}

/**
 * Resolve the current user id for a server function.
 *
 * 1. Any valid Better Auth session wins. This includes the temporary isolated
 *    test workspace currently used on production.
 * 2. If there is no session and interactive auth/gate identity is configured,
 *    fail unauthorized.
 * 3. Only local development without a persistent database may use DEV_USER_ID.
 *    A deployed/persistent database never falls back to a shared user.
 */
export async function requireUserId(bearerToken?: string): Promise<string> {
  const user = await getSessionUser(bearerToken);
  if (user) return user.id;

  if (authConfigured || gateIdentityEnabled()) {
    throw new UnauthorizedError();
  }

  if (databaseConfigured() || isAuthConfigured() || serverEnv("CLOUDFLARE_ENV")) {
    throw new UnauthorizedError();
  }

  return DEV_USER_ID;
}
