import { useEffect, useRef, useState, type ReactNode } from "react";
import { authEnabled, signOut } from "./client";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";
import { openTestWorkspace } from "@/lib/fn/test-access";

/**
 * Auth state components. During the current product-testing period, signed-out
 * visitors are provisioned an isolated temporary workspace instead of being sent
 * through interactive login. Each workspace still uses a real Better Auth
 * session and owner_user_id boundary.
 */

export const SIGN_IN_PATH = "/login";

export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

/**
 * Temporary open-access gate: create one browser-bound test identity and reload
 * the current route. No shared production dev user is used.
 */
export function RedirectToSignIn() {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void openTestWorkspace()
      .then(() => window.location.reload())
      .catch((err: Error) => setError(err.message || "Could not open the test workspace."));
  }, []);

  if (error) {
    return <p className="mt-4 text-sm text-danger">{error}</p>;
  }
  return <span className="sr-only">Opening test workspace.</span>;
}

export function UserButton() {
  const user = useCurrentUser();
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";
  return (
    <div className="flex items-center gap-2">
      {user.profileImageUrl ? (
        <img
          src={user.profileImageUrl}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/10 text-sm font-medium dark:bg-white/20">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-sm font-medium">{label}</span>
      {authEnabled && (
        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOut().catch(() => setSigningOut(false));
          }}
          className="cursor-pointer text-sm underline-offset-4 opacity-70 hover:underline disabled:cursor-wait disabled:no-underline"
        >
          {signingOut ? "Resetting…" : "Reset test session"}
        </button>
      )}
    </div>
  );
}
