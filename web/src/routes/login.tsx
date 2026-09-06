import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient, authEnabled } from "@/lib/auth/client";
import { AUTH_ERROR_CODES } from "@/lib/auth/error-codes";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { safeProofReturn } from "@/lib/products/registry";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/login")({ validateSearch: (s: Record<string, unknown>): { returnTo?: "/" | "/proof" } => ({ returnTo: safeProofReturn(s.returnTo) }), component: Login });

/**
 * Friendly text for the stable codes the auth backend can return (see
 * `error-codes.ts`). Anything else — an unrecognised code, or none at all —
 * falls back to the server's own `error.message`, then to a generic string;
 * this never hides a *specific known* failure behind that generic text.
 */
const AUTH_ERROR_MESSAGES: Partial<Record<string, string>> = {
  [AUTH_ERROR_CODES.INVALID_ORIGIN]:
    "This page isn't running on a trusted domain. Reload the app at https://app.agmt.legal and try again.",
  [AUTH_ERROR_CODES.INVALID_CREDENTIALS]: "Incorrect email or password.",
  [AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED]:
    "Verify your email before signing in — check your inbox for the verification link.",
  [AUTH_ERROR_CODES.AUTH_DATABASE_UNAVAILABLE]:
    "Agmt can't reach the authentication database right now. Try again shortly.",
  [AUTH_ERROR_CODES.AUTH_REQUEST_TIMEOUT]: "That took too long to respond. Try again.",
  [AUTH_ERROR_CODES.EMAIL_DELIVERY_FAILED]: "We could not send the verification email. Try again shortly.",
};

function describeAuthError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return "Authentication failed.";
  return (error.code && AUTH_ERROR_MESSAGES[error.code]) || error.message || "Authentication failed.";
}

const AUTH_CLIENT_TIMEOUT_MS = 12_000;

function withAuthClientTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Authentication request timed out. Please try again.")),
      AUTH_CLIENT_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

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
  // Set once a request tells us this email needs verifying — either right
  // after sign-up (requireEmailVerification means there is no session yet
  // to redirect with), or after a sign-in attempt comes back
  // EMAIL_NOT_VERIFIED. Offers a real "resend" action: retrying sign-up
  // with the same email does NOT resend — Better Auth deliberately returns
  // an indistinguishable fake success for an existing email (anti-account-
  // enumeration), so a second sign-up attempt silently sends nothing.
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  useEffect(() => {
    if (!isPending && user) void navigate({ to: returnTo });
  }, [isPending, navigate, user, returnTo]);

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResendState("idle");
    setBusy(true);
    try {
      if (creating) {
        const result = await withAuthClientTimeout(authClient.signUp.email({ email, password, name: name || email }));
        if (result.error) throw new Error(describeAuthError(result.error));
        setPendingVerificationEmail(email);
      } else {
        const result = await withAuthClientTimeout(authClient.signIn.email({ email, password, callbackURL: returnTo }));
        if (result.error) {
          if (result.error.code === AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED) setPendingVerificationEmail(email);
          throw new Error(describeAuthError(result.error));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerificationEmail() {
    if (!pendingVerificationEmail) return;
    setError(null);
    setResendState("sending");
    try {
      const result = await withAuthClientTimeout(
        authClient.sendVerificationEmail({ email: pendingVerificationEmail, callbackURL: returnTo }),
      );
      if (result.error) throw new Error(describeAuthError(result.error));
      setResendState("sent");
    } catch (err) {
      setResendState("idle");
      setError(err instanceof Error ? err.message : "Authentication failed.");
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
          ) : pendingVerificationEmail ? (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-ink-muted">
                We sent a verification link to <strong className="text-ink">{pendingVerificationEmail}</strong>.
                Open it to finish signing in. If it doesn&apos;t arrive in a minute, check spam, or send it again.
              </p>
              <button
                type="button"
                disabled={resendState === "sending"}
                onClick={() => void resendVerificationEmail()}
                className="w-full rounded-md bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
              >
                {resendState === "sending" ? "Sending…" : resendState === "sent" ? "Sent — resend again" : "Resend verification email"}
              </button>
              <button
                type="button"
                className="text-sm underline underline-offset-4"
                onClick={() => { setPendingVerificationEmail(null); setResendState("idle"); setError(null); }}
              >
                Use a different email
              </button>
            </div>
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
