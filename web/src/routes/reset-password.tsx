import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/agmt/shell";
import { FIELD, Field, useHydrated } from "@/components/execute/access-gate";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { EXECUTE_CSP_META } from "@/lib/execute/csp";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Forgot password, in two steps on one page: ask for a link by email, then
 * (arriving back from that link with ?token=) choose the new password.
 */
export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>): { email?: string; token?: string; error?: string } => ({
    email: text(s.email, 200) || undefined,
    token: text(s.token, 512) || undefined,
    error: text(s.error, 64) || undefined,
  }),
  component: ResetPassword,
  head: () => ({
    meta: [
      { title: "Reset your password — Agmt" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
      { httpEquiv: "Content-Security-Policy", content: EXECUTE_CSP_META },
    ],
  }),
});

function ResetPassword() {
  const search = Route.useSearch();
  return (
    <Shell>
      <section className="mx-auto max-w-[520px] space-y-8 py-6" data-testid="reset-password">
        <p className="text-[11px] uppercase tracking-[0.16em] text-stone">Your account</p>
        {search.token ? <ChooseNew token={search.token} /> : <AskForLink email={search.email ?? ""} expired={Boolean(search.error)} />}
      </section>
    </Shell>
  );
}

function AskForLink({ email: initial, expired }: { email: string; expired: boolean }) {
  const [email, setEmail] = useState(initial);
  const [state, setState] = useState<"idle" | "busy" | "sent" | "failed">("idle");
  const ready = useHydrated();

  if (state === "sent") {
    return (
      <div className="space-y-4" role="status" data-testid="reset-sent">
        <h1 className="font-display text-[40px] leading-[1.05]">Check your inbox.</h1>
        <p className="text-[17px] leading-8 text-ink/80">
          If there's an Agmt account for <span className="font-medium text-ink">{email.trim()}</span>, we've sent it a link to choose a
          new password. The link works once, for an hour.
        </p>
        <a href="/" className="inline-block text-sm underline underline-offset-4">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <h1 className="font-display text-[40px] leading-[1.05]">Forgot your password?</h1>
        <p className="text-[17px] leading-8 text-ink/80">Enter your email and we'll send you a link to choose a new one.</p>
        {expired ? <p className="border-l-2 border-oxblood pl-3 text-sm">That link has expired or was already used. Ask for a new one below.</p> : null}
      </div>
      <form
        method="post"
        data-ready={ready}
        className="space-y-4 border-t border-rule pt-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setState("busy");
          try {
            const res = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
            setState(res.error ? "failed" : "sent");
          } catch {
            setState("failed");
          }
        }}
      >
        <Field label="Email">
          <input type="email" required maxLength={200} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
        </Field>
        {state === "failed" ? <p className="text-sm text-oxblood">We couldn't send the link just now. Try again in a moment.</p> : null}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button type="submit" disabled={state === "busy" || !ready}>
            {state === "busy" ? "Sending…" : "Send me a link"}
          </Button>
          <a href="/" className="text-sm underline underline-offset-4">
            Back to sign in
          </a>
        </div>
      </form>
    </>
  );
}

function ChooseNew({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "expired" | "failed">("idle");
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = useHydrated();

  if (state === "done") {
    return (
      <div className="space-y-4" role="status" data-testid="reset-done">
        <h1 className="font-display text-[40px] leading-[1.05]">Password changed.</h1>
        <p className="text-[17px] leading-8 text-ink/80">Sign in with your new password. Any other computer you were signed in on has been signed out.</p>
        <a href="/" className="inline-flex h-10 items-center rounded-[2px] border border-oxblood bg-oxblood px-5 text-sm font-medium text-paper no-underline hover:bg-oxblood-pressed">
          Sign in
        </a>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-display text-[40px] leading-[1.05]">Choose a new password.</h1>
      <form
        method="post"
        data-ready={ready}
        className="space-y-4 border-t border-rule pt-8"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== confirm) return;
          setState("busy");
          try {
            const res = await authClient.resetPassword({ newPassword: password, token });
            setState(!res.error ? "done" : res.error.code === "INVALID_TOKEN" ? "expired" : "failed");
          } catch {
            setState("failed");
          }
        }}
      >
        <Field label="New password" hint="At least 12 characters.">
          <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} />
        </Field>
        <Field label="New password again">
          <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} className={FIELD} />
        </Field>
        {mismatch ? <p className="text-sm text-oxblood">The two passwords don't match yet.</p> : null}
        {state === "expired" ? (
          <p className="text-sm text-oxblood">
            That link has expired or was already used. <a href="/reset-password" className="underline underline-offset-4">Ask for a new one</a>.
          </p>
        ) : null}
        {state === "failed" ? <p className="text-sm text-oxblood">We couldn't change the password just now. Try again in a moment.</p> : null}
        <Button type="submit" disabled={state === "busy" || mismatch || !ready}>
          {state === "busy" ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </>
  );
}
