import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { requestMagicLink } from "@/lib/fn/agmt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/login")({ component: Login });

function friendlySignInError(raw: string): string {
  if (/pop-?up blocked/i.test(raw)) {
    return "The Google sign-in window was blocked. Allow pop-ups for this preview, then try again. Or use the email link below.";
  }
  if (/cancelled or failed/i.test(raw)) {
    return "Google sign-in did not finish. Close any leftover sign-in window and try again, or use the email link.";
  }
  return raw;
}

function Login() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [mail, setMail] = useState<{
    subject: string;
    previewToken: string;
    support: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isPending && user) {
    void navigate({ to: "/" });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div>
          <p className="font-display text-4xl font-medium tracking-tight text-ink">Agmt</p>
          <p className="mt-2 text-sm text-ink-muted">Proof the artefact. Review is a later slice.</p>
        </div>
        <Card className="space-y-4 p-6">
          <h1 className="font-display text-xl font-medium">Sign in</h1>
          <p className="text-sm text-ink-muted">
            Google sign-in (opens a small window), or a single-use email link that expires in 15
            minutes. No password is stored.
          </p>
          {authEnabled ? (
            <div className="space-y-2">
              {GROK_PROVIDERS.filter((p) => p.idp === "google").map((p) => (
                <Button
                  key={p.providerId}
                  className="w-full"
                  disabled={busy !== null}
                  onClick={() => {
                    setBusy(p.providerId);
                    setError(null);
                    void signIn(p.providerId, { callbackURL: "/" })
                      .then(() => {
                        void navigate({ to: "/" });
                      })
                      .catch((e: Error) => {
                        setError(friendlySignInError(e.message || "Sign-in failed"));
                      })
                      .finally(() => setBusy(null));
                  }}
                >
                  {busy === p.providerId ? "Opening Google…" : `Continue with ${p.label}`}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Sign-in is disabled.</p>
          )}
          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-ink-subtle">
            <span className="h-px flex-1 bg-rule" />
            or email
            <span className="h-px flex-1 bg-rule" />
          </div>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy("email");
              setError(null);
              void requestMagicLink({ data: { email } })
                .then((r) => setMail(r))
                .catch((err: Error) => setError(err.message))
                .finally(() => setBusy(null));
            }}
          >
            <label className="block text-sm font-medium">
              Email
              <Input
                className="mt-1"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="you@firm.in"
              />
            </label>
            <Button type="submit" variant="secondary" className="w-full" disabled={busy !== null}>
              {busy === "email" ? "Sending link…" : "Send verification link"}
            </Button>
          </form>
          {mail ? (
            <div className="space-y-2 rounded-[16px] border border-rule bg-paper p-4 text-sm">
              <p>
                Production sends a message with subject <strong>{mail.subject}</strong>. It states the
                15-minute expiry, names no Matter, and gives {mail.support}.
              </p>
              <p className="text-ink-muted">
                This preview cannot deliver mail. Open the one-time link to verify.
              </p>
              <a
                className="inline-flex min-h-11 items-center text-forest underline"
                href={`/verify?token=${encodeURIComponent(mail.previewToken)}`}
              >
                Verify email for Agmt
              </a>
            </div>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </Card>
        <p className="text-xs text-ink-subtle">
          Agmt does not provide legal advice. A lawyer remains responsible for the document signed or
          shared.
        </p>
      </div>
    </main>
  );
}
