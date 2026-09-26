import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { verifyMagicLink } from "@/lib/fn/auth-email";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/verify")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: Verify,
});

function storePreviewBearer(token: string) {
  if (!window.location.hostname.endsWith(".grok-sandbox.com")) return;
  try {
    window.sessionStorage.setItem("grok-auth.bearer-token", token);
  } catch {
    /* preview storage unavailable */
  }
}

function Verify() {
  const { token } = Route.useSearch();
  const [message, setMessage] = useState("Verifying your secure sign-in link…");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setMessage("This sign-in link is missing its token.");
      return;
    }

    void verifyMagicLink({ data: { token } })
      .then(async (result) => {
        // Deployed sessions remain in the HttpOnly __Host- cookie set server-side.
        // Only the sandbox preview needs a bearer because its iframe cookies are partitioned.
        storePreviewBearer(result.sessionToken);
        try {
          await authClient.getSession();
        } catch {
          /* the session store will recover on the next request */
        }
        setMessage("Signed in. Opening your Matters…");
        window.location.replace("/");
      })
      .catch(async (error: Error) => {
        try {
          const existing = await authClient.getSession();
          if (existing.data?.user) {
            window.location.replace("/");
            return;
          }
        } catch {
          /* stay on the verification error */
        }
        setMessage(error.message);
      });
  }, [token]);

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4">
      <div className="max-w-md text-center">
        <p className="font-display text-3xl text-ink">Agmt</p>
        <p className="mt-4 text-sm leading-6 text-ink-muted">{message}</p>
      </div>
    </main>
  );
}
