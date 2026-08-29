import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { openTestWorkspace } from "@/lib/fn/test-access";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending) return;
    if (user) {
      void navigate({ to: "/" });
      return;
    }
    if (started.current) return;
    started.current = true;
    void openTestWorkspace()
      .then(() => window.location.replace("/"))
      .catch((err: Error) => setError(err.message || "Could not open the test workspace."));
  }, [isPending, navigate, user]);

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div>
          <p className="font-display text-4xl font-medium tracking-tight text-ink">Agmt</p>
          <p className="mt-2 text-sm text-ink-muted">Proof the artefact.</p>
        </div>
        <Card className="space-y-3 p-6">
          <h1 className="font-display text-xl font-medium">Opening test workspace</h1>
          <p className="text-sm leading-6 text-ink-muted">
            Sign-in is temporarily bypassed for product testing. This browser receives its own isolated
            workspace and secure session.
          </p>
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : (
            <p className="text-sm text-ink-subtle">Preparing Matters…</p>
          )}
        </Card>
        <p className="text-xs text-ink-subtle">
          Test mode is temporary. Do not treat it as the final authentication experience.
        </p>
      </div>
    </main>
  );
}
