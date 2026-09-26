import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { authClient, signOut } from "@/lib/auth/client";
import { AUTH_ERROR_CODES } from "@/lib/auth/error-codes";
import type { ExecuteAccess } from "@/lib/execute/server";

export const FIELD = "block h-10 w-full border border-rule-strong bg-paper px-3 text-sm outline-none focus:border-ink read-only:border-rule read-only:bg-paper-sunk read-only:text-ink/80";

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
              ? { tone: "note", text: "Confirm your email first. We've sent the link again; check your inbox and your spam folder." }
              : code === AUTH_ERROR_CODES.INVALID_CREDENTIALS
                ? { tone: "error", text: "That email and password don't match. Check them, or choose a new password." }
                : { tone: "error", text: "Signing in didn't work just now. Try again in a moment." },
          );
        } catch {
          setMessage({ tone: "error", text: "Agmt couldn't be reached. Check your connection and try again." });
        }
        setBusy(false);
      }}
    >
      <h2 className="font-display text-2xl">Sign in</h2>
      <p className="text-sm leading-6 text-stone">Use the email address you asked for access with.</p>
      <Field label="Email">
        <input type="email" required autoComplete="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
      </Field>
      <Field label="Password">
        <input type="password" required autoComplete="current-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} />
      </Field>
      {message ? <p role="alert" className={message.tone === "error" ? "text-sm text-oxblood" : "text-sm"}>{message.text}</p> : null}
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
  const [form, setForm] = useState({ name: knownName ?? "", email: lockedEmail ?? "", note: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed" | "limited">("idle");
  const [result, setResult] = useState<{ acknowledged: boolean; status: string }>({ acknowledged: false, status: "requested" });
  const ready = useHydrated();

  if (state === "sent") {
    return (
      <div className="space-y-3" role="status" data-testid="access-sent">
        <h2 className="font-display text-2xl">{result.status === "approved" ? "You already have access." : "Request received."}</h2>
        {result.status === "approved" ? (
          <p className="text-[15px] leading-7 text-ink/85">
            We've emailed <span className="font-medium text-ink">{form.email.trim()}</span> the link to set up your account again.
          </p>
        ) : (
          <p className="text-[15px] leading-7 text-ink/85">
            We'll write to <span className="font-medium text-ink">{form.email.trim()}</span> when your access is ready. There's nothing
            more to do.
          </p>
        )}
        {result.acknowledged && result.status !== "approved" ? (
          <p className="text-sm leading-6 text-stone">
            A confirmation is on its way to {form.email.trim()}. If it isn't in your inbox, check your spam folder.
          </p>
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
      <p className="text-sm leading-6 text-stone">Access is by invitation for now. We'll email you when yours is ready.</p>
      <Field label="Name">
        <input required maxLength={120} autoComplete="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={FIELD} />
      </Field>
      <Field label="Email">
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
      <Field label="What do you sign most often? (optional)">
        <textarea rows={3} maxLength={1000} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="block w-full border border-rule-strong bg-paper p-3 text-sm outline-none focus:border-ink" />
      </Field>
      {state === "failed" ? <p className="text-sm text-oxblood" role="alert">Not sent. Check your connection and try again.</p> : null}
      {state === "limited" ? <p className="text-sm text-oxblood" role="alert">Too many requests from this connection today. Try again tomorrow.</p> : null}
      <Button type="submit" disabled={state === "sending" || !ready}>
        {state === "sending" ? "Sending…" : "Ask for access"}
      </Button>
    </form>
  );
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-[920px] space-y-8 py-6" data-testid="access-gate">
      <h1 className="max-w-[680px] font-display text-[38px] leading-[1.05] tracking-[-0.02em] sm:text-[50px]">{title}</h1>
      {children}
    </section>
  );
}

const INTRO =
  "Execute assembles an executed copy for every party to a multi-party agreement, on your own computer: signature pages out, signed pages and stamp papers in. Your documents are not uploaded.";

/** What someone sees at app.agmt.legal when the tool isn't open to them yet. */
export function AccessGate({ access }: { access: ExecuteAccess }) {
  if (access.state === "signed_out") {
    return (
      <Frame title="Execute is available by invitation for now.">
        <p className="max-w-[640px] text-[17px] leading-8 text-ink/80">{INTRO}</p>
        <div className="grid gap-10 border-t border-ink pt-8 md:grid-cols-2 md:gap-14">
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
          Thank you{access.name ? `, ${firstName(access.name)}` : ""}. We'll email you when your access is ready, and this page will then
          open Execute. There's nothing more to do.
        </p>
        {footer}
      </Frame>
    );
  }

  if (access.state === "declined") {
    return (
      <Frame title="We can't offer access to this account.">
        <p className="max-w-[640px] text-[17px] leading-8 text-ink/80">
          We're not able to offer this account access to Execute. If you think we've misunderstood something, reply to our email.
        </p>
        {footer}
      </Frame>
    );
  }

  if (access.state === "unavailable") {
    return (
      <Frame title="We can't check your access right now.">
        <p className="max-w-[640px] text-[17px] leading-8 text-ink/80">The access check isn't answering. Try again in a minute.</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
        {footer}
      </Frame>
    );
  }

  // Signed in (for example from Proof) but hasn't asked yet.
  return (
    <Frame title="Ask for access to Execute.">
      <p className="max-w-[640px] text-[17px] leading-8 text-ink/80">{INTRO}</p>
      <div className="max-w-[460px] border-t border-rule pt-8">
        <AskForAccess email={access.email} name={access.name} />
      </div>
      {footer}
    </Frame>
  );
}
