import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient, authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { safeProofReturn } from "@/lib/products/registry";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/login")({ validateSearch: (s: Record<string, unknown>): { returnTo?: "/" | "/proof" } => ({ returnTo: safeProofReturn(s.returnTo) }), component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const returnTo = safeProofReturn(Route.useSearch().returnTo);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPending && user) void navigate({ to: returnTo });
  }, [isPending, navigate, user, returnTo]);

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = creating
        ? await authClient.signUp.email({ email, password, name: name || email })
        : await authClient.signIn.email({ email, password, callbackURL: returnTo });
      if (result.error) throw new Error(result.error.message ?? "Authentication failed.");
      if (creating && typeof window !== "undefined") window.location.href = returnTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
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
              A verified account is required to upload and access documents.
            </p>
          </div>
          {!authEnabled ? (
            <p className="text-sm text-danger">
              Authentication is unavailable in this environment.
            </p>
          ) : (
            <div className="space-y-5">
              <form className="space-y-3" onSubmit={(event) => void submitEmail(event)}>
                {creating ? <input aria-label="Name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="w-full rounded-md border border-line px-3 py-2 text-sm" /> : null}
                <input aria-label="Email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
                <input aria-label="Password" required type="password" minLength={12} autoComplete={creating ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (12+ characters)" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
                <button type="submit" disabled={busy} className="w-full rounded-md bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50">
                  {busy ? "Working…" : creating ? "Create account" : "Sign in with email"}
                </button>
                <button type="button" className="text-sm underline underline-offset-4" onClick={() => { setCreating((value) => !value); setError(null); }}>
                  {creating ? "Already have an account? Sign in" : "Need an account? Create one"}
                </button>
              </form>
            </div>
          )}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </Card>
      </div>
    </main>
  );
}
