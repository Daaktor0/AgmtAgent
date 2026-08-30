import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authEnabled, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && user) void navigate({ to: "/" });
  }, [isPending, navigate, user]);

  async function beginSignIn(providerId: string) {
    setError(null);
    try {
      await signIn(providerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div>
          <p className="font-display text-4xl font-medium tracking-tight text-ink">Agmt</p>
          <p className="mt-2 text-sm text-ink-muted">Proof the artefact.</p>
        </div>
        <Card className="space-y-4 p-6">
          <div>
            <h1 className="font-display text-xl font-medium">Sign in to Agmt</h1>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              A verified account is required to access Matter documents.
            </p>
          </div>
          {!authEnabled ? (
            <p className="text-sm text-danger">
              Authentication is unavailable in this environment.
            </p>
          ) : (
            <div className="space-y-2">
              {GROK_PROVIDERS.map((provider) => (
                <button
                  key={provider.providerId}
                  type="button"
                  className="w-full rounded-md border border-line px-4 py-2 text-sm text-ink hover:bg-paper-subtle"
                  onClick={() => void beginSignIn(provider.providerId)}
                >
                  Continue with {provider.label}
                </button>
              ))}
            </div>
          )}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </Card>
      </div>
    </main>
  );
}
