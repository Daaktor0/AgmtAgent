import { createAuthClient } from "better-auth/react";
import { runSignOut } from "../../../scripts/sign-out-plan.mjs";

/** Better Auth client for this app's same-origin email/password auth. */
export const authClient = createAuthClient({
  fetchOptions: {
    onRequest(ctx) {
      const token = getBearerToken();
      if (token) ctx.headers.set("Authorization", `Bearer ${token}`);
      return ctx;
    },
  },
});

/** True when the real authentication UI should be shown. */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

// Embedded previews may need a bearer token because iframe cookies are
// partitioned. Production uses the secure session cookie instead.
const BEARER_KEY = "grok-auth.bearer-token";

export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

function inLivePreview(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".grok-sandbox.com")
  );
}

/** Sign out of this app's local session, then redirect. */
export async function signOut(redirectTo = "/"): Promise<void> {
  await runSignOut({
    livePreview: inLivePreview(),
    hasBearer: Boolean(getBearerToken()),
    requestSignOut: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed");
    },
    clearToken: () => {
      if (typeof window === "undefined") return;
      try {
        window.sessionStorage.removeItem(BEARER_KEY);
      } catch {
        /* storage unavailable — ignore */
      }
    },
    redirect: () => {
      window.location.href = redirectTo;
    },
  });
}
