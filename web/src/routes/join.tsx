import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ExecuteShell } from "@/components/execute/execute-shell";
import { FIELD, Field, useHydrated } from "@/components/execute/access-gate";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { EXECUTE_CSP_META } from "@/lib/execute/csp";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * "Set up your account", from the "You're in" email. The link carries the
 * email and name only, no secret: an account is only useful once its email
 * is confirmed from that inbox, and only an approved email opens the tool.
 */
export const Route = createFileRoute("/join")({
  validateSearch: (s: Record<string, unknown>): { email?: string; name?: string } => ({
    email: text(s.email, 200) || undefined,
    name: text(s.name, 120) || undefined,
  }),
  component: Join,
  head: () => ({
    meta: [
      { title: "Set up your account — Execute by Agmt" },
      { name: "robots", content: "noindex" },
      { httpEquiv: "Content-Security-Policy", content: EXECUTE_CSP_META },
    ],
  }),
});

function Join() {
  const search = Route.useSearch();
  const invited = Boolean(search.email);
  const [name, setName] = useState(search.name ?? "");
  const [email, setEmail] = useState(search.email ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = useHydrated();

  return (
    <ExecuteShell>
      <section className="mx-auto max-w-[520px] space-y-8 py-6" data-testid="join">
        {state === "sent" ? (
          <div className="space-y-4" role="status" data-testid="join-sent">
            <h1 className="font-display text-[38px] leading-[1.05] tracking-[-0.02em] sm:text-[44px]">Check your inbox.</h1>
            <p className="text-[17px] leading-8 text-ink/80">
              We've sent a link to <span className="font-medium text-ink">{email.trim()}</span>. Click it to confirm the address is
              yours, and you're in.
            </p>
            <p className="text-sm leading-6 text-stone">
              It can take a minute; check spam if it isn't there. The link works for an hour. If you already had an account, we've
              emailed you how to sign in instead.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <h1 className="font-display text-[38px] leading-[1.05] tracking-[-0.02em] sm:text-[44px]">{invited ? "Set up your account." : "Create an account."}</h1>
              <p className="text-[17px] leading-8 text-ink/80">
                {invited
                  ? "Choose a password. Then confirm your email from the link we send, and you're in."
                  : "Execute is available by invitation for now. Use the email address you asked for access with."}
              </p>
            </div>
            <form
              method="post"
              data-ready={ready}
              className="space-y-4 border-t border-rule pt-8"
              onSubmit={async (e) => {
                e.preventDefault();
                if (password !== confirm) return;
                setState("busy");
                setError(null);
                try {
                  const res = await authClient.signUp.email({ email: email.trim(), password, name: name.trim() || email.trim(), callbackURL: "/" });
                  if (res.error) {
                    setError(
                      res.error.code === "PASSWORD_TOO_SHORT"
                        ? "Use at least 12 characters."
                        : "Setting up the account didn't work just now. Try again in a moment.",
                    );
                    setState("idle");
                    return;
                  }
                  setState("sent");
                } catch {
                  setError("Agmt couldn't be reached. Check your connection and try again.");
                  setState("idle");
                }
              }}
            >
              <Field label="Name">
                <input required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
              </Field>
              <Field label="Email" hint={invited ? "The address your access was approved for." : undefined}>
                <input type="email" required maxLength={200} autoComplete="username" readOnly={invited} value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
              </Field>
              <Field label="Password" hint="At least 12 characters. A short sentence you'll remember works well.">
                <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} />
              </Field>
              <Field label="Password again">
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={mismatch}
                  className={FIELD}
                />
              </Field>
              {mismatch ? <p className="text-sm text-oxblood">The two passwords don't match yet.</p> : null}
              {error ? <p className="text-sm text-oxblood">{error}</p> : null}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <Button type="submit" disabled={state === "busy" || mismatch || !ready}>
                  {state === "busy" ? "Setting up…" : "Set up my account"}
                </Button>
                <a href="/" className="text-sm underline underline-offset-4">
                  I already have an account
                </a>
              </div>
            </form>
          </>
        )}
      </section>
    </ExecuteShell>
  );
}
