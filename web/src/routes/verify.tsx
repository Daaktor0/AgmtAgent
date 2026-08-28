import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { verifyMagicLink } from "@/lib/fn/agmt";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/verify")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : "",
  }),
  component: Verify,
});

function storeBearer(token: string) {
  try {
    window.sessionStorage.setItem("grok-auth.bearer-token", token);
  } catch {
    /* ignore */
  }
}

function Verify() {
  const { token } = Route.useSearch();
  const [msg, setMsg] = useState("Verifying your email…");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setMsg("This verification link is missing a token.");
      return;
    }
    void verifyMagicLink({ data: { token } })
      .then((r) => {
        storeBearer(r.sessionToken);
        setMsg("Email verified. Opening your Matters.");
        window.location.replace("/");
      })
      .catch(async (e: Error) => {
        try {
          const existing = await authClient.getSession();
          if (existing.data?.user) {
            window.location.replace("/");
            return;
          }
        } catch {
          /* stay on the error */
        }
        setMsg(e.message);
      });
  }, [token]);

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4">
      <div className="max-w-md text-center">
        <p className="font-display text-3xl">Agmt</p>
        <p className="mt-4 text-sm text-ink-muted">{msg}</p>
      </div>
    </main>
  );
}
