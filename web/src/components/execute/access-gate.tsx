import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { authClient, signOut } from "@/lib/auth/client";
import { AUTH_ERROR_CODES } from "@/lib/auth/error-codes";
import type { ExecuteAccess } from "@/lib/execute/server";

export const FIELD = "block h-10 w-full border border-rule bg-paper px-3 text-sm outline-none focus:border-ink read-only:bg-paper-sunk read-only:text-ink/70";

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

/**
 * True once React is running. Forms that take a password keep their button
 * disabled until then, and post (never GET) if submitted early, so a
 * password can't end up in the address bar.
 */
export function useHydrated(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{label}</span>
        {children}
      </label>
      {hint ? <p className="text-[13px] leading-5 text-stone">{hint}</p> : null}
    </div>
  );
}

export function SignOutButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => void signOut("/")} className={className ?? "text-sm underline underline-offset-4"}>
      Sign out
    </button>
  );
}

/** Returning people: email and password. */
function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "note"; text: string } | null>(null);
  const ready = useHydrated();

  return (
    <form
      method="post"
      className="space-y-4"
      data-testid="sign-in"
      data-ready={ready}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
          const res = await authClient.signIn.email({ email: email.trim(), password });
          if (!res.error) {
            window.location.assign("/");
            return;
          }
          const code = res.error.code;
          setMessage(
            code === AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED
              ? { tone: "note", text: "Confirm your email first. We've just sent the link again; check your inbox, and spam." }
              : code === AUTH_ERROR_CODES.INVALID_CREDENTIALS
                ? { tone: "error", text: "That email and password don't match. Check them, or choose a new password." }
                : { tone: "error", text: "We couldn't sign you in just now. Try again in a moment." },
          );
        } catch {
          setMessage({ tone: "error", text: "We couldn't reach Agmt. Check your connection and try again." });
        }
        setBusy(false);
      }}
    >
      <h2 className="font-display text-2xl">Sign in</h2>
      <p className="text-sm leading-6 text-stone">If you've been invited, sign in with the email you asked with.</p>
      <Field label="Email">
        <input type="email" required autoComplete="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
      </Field>
      <Field label="Password">
        <input type="password" required autoComplete="current-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} />
      </Field>
      {message ? <p className={message.tone === "error" ? "text-sm text-oxblood" : "text-sm"}>{message.text}</p> : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button type="submit" disabled={busy || !ready}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <a href={`/reset-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`} className="text-sm underline underline-offset-4">
          Forgot your password?
        </a>
      </div>
    </form>
  );
}

/** New people: the access request. The email is fixed when they're signed in. */
function AskForAccess({ email: lockedEmail, name: knownName }: { email?: string | null; name?: string | null }) {
  const [form, setForm] = useState({ name: knownName ?? "", email: lockedEmail ?? "", firm: "", note: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed" | "limited">("idle");
  const [result, setResult] = useState<{ acknowledged: boolean; status: string }>({ acknowledged: false, status: "requested" });
  const ready = useHydrated();

  if (state === "sent") {
    return (
      <div className="space-y-3" role="status" data-testid="access-sent">
        <h2 className="font-display text-2xl">Thank you, {firstName(form.name)}.</h2>
        {result.status === "approved" ? (
          <p className="text-[15px] leading-7 text-ink/80">
            You already have a place. We've emailed <span className="font-medium text-ink">{form.email.trim()}</span> the link to set up
            your account again.
          </p>
        ) : (
          <p className="text-[15px] leading-7 text-ink/80">
            Your request is noted. We'll email <span className="font-medium text-ink">{form.email.trim()}</span> as soon as your place
            is ready. There is nothing else you need to do.
          </p>
        )}
        {result.acknowledged && result.status !== "approved" ? (
          <p className="text-sm leading-6 text-stone">We've sent a short confirmation to that address. If it isn't in your inbox, check spam.</p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      method="post"
      className="space-y-4"
      data-testid="ask-for-access"
      data-ready={ready}
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        const res = await post("/api/execute/access-request", form);
        setResult({ acknowledged: res.data.acknowledged === true, status: String(res.data.status ?? "requested") });
        setState(res.ok ? "sent" : res.status === 429 ? "limited" : "failed");
      }}
    >
      <h2 className="font-display text-2xl">Ask for access</h2>
      <p className="text-sm leading-6 text-stone">We'll email you when your place is ready, usually within a few days.</p>
      <Field label="Name">
        <input required maxLength={120} autoComplete="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={FIELD} />
      </Field>
      <Field label="Work email">
        <input
          type="email"
          required
          maxLength={200}
          autoComplete="email"
          readOnly={Boolean(lockedEmail)}
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className={FIELD}
        />
      </Field>
      <Field label="Firm or company">
        <input maxLength={160} autoComplete="organization" value={form.firm} onChange={(e) => setForm((f) => ({ ...f, firm: e.target.value }))} className={FIELD} />
      </Field>
      <Field label="What do you sign most often? (optional)">
        <textarea rows={3} maxLength={1000} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="block w-full border border-rule bg-paper p-3 text-sm outline-none focus:border-ink" />
      </Field>
      {state === "failed" ? <p className="text-sm text-oxblood">It didn't send. Check your connection and try again.</p> : null}
      {state === "limited" ? <p className="text-sm text-oxblood">We've already had a few requests from this connection today. Please try again tomorrow.</p> : null}
      <Button type="submit" disabled={state === "sending" || !ready}>
        {state === "sending" ? "Sending…" : "Ask for access"}
      </Button>
    </form>
  );
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-[920px] space-y-8 py-6" data-testid="access-gate">
      <p className="text-[11px] uppercase tracking-[0.16em] text-stone">Executed copies · private beta</p>
      <h1 className="max-w-[640px] font-display text-[40px] leading-[1.05] sm:text-[52px]">{title}</h1>
      {children}
    </section>
  );
}

const INTRO =
  "Agmt assembles executed copies of multi-party agreements on your own computer: signature pages out, countersigned pages and stamp papers in, one complete copy per party. We're opening it to a small group of lawyers first, so we can learn from real closings.";

/** What someone sees at app.agmt.legal when the tool isn't open to them yet. */
export function AccessGate({ access }: { access: ExecuteAccess }) {
  if (access.state === "signed_out") {
    return (
      <Frame title="Open to invited lawyers for now.">
        <p className="max-w-[640px] text-[17px] leading-8 text-ink/80">{INTRO}</p>
        <div className="grid gap-10 border-t border-rule pt-8 md:grid-cols-2 md:gap-14">
          <SignIn />
          <div className="border-t border-rule pt-8 md:border-l md:border-t-0 md:pl-14 md:pt-0">
            <AskForAccess />
          </div>
        </div>
      </Frame>
    );
  }

  const who = access.email ? <span className="font-medium text-ink">{access.email}</span> : "this account";
  const footer = (
    <p className="border-t border-rule pt-6 text-sm text-stone">
      Signed in as {who}. <SignOutButton className="ml-1 text-ink underline underline-offset-4" />
    </p>
  );

  if (access.state === "pending") {
    return (
      <Frame title="Your request is with us.">
        <p className="max-w-[640px] text-[17px] leading-8 text-ink/80">
          Thank you{access.name ? `, ${firstName(access.name)}` : ""}. We'll email you as soon as your place is ready, and this page will
          open the tool for you. There's nothing else you need to do.
        </p>
        {footer}
      </Frame>
    );
  }

  if (access.state === "declined") {
    return (
      <Frame title="Not in this beta.">
        <p className="max-w-[640px] text-[17px] leading-8 text-ink/80">
          We can't include this account in the closed beta. Agmt will open to everyone after it, and we'll let you know when it does.
        </p>
        {footer}
      </Frame>
    );
  }

  if (access.state === "unavailable") {
    return (
      <Frame title="We can't check your access right now.">
        <p className="max-w-[640px] text-[17px] leading-8 text-ink/80">Something on our side isn't answering. Try again in a minute.</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
        {footer}
      </Frame>
    );
  }

  // Signed in (for example from Proof) but hasn't asked yet.
  return (
    <Frame title="Ask for a place in the beta.">
      <p className="max-w-[640px] text-[17px] leading-8 text-ink/80">{INTRO}</p>
      <div className="max-w-[460px] border-t border-rule pt-8">
        <AskForAccess email={access.email} name={access.name} />
      </div>
      {footer}
    </Frame>
  );
}
