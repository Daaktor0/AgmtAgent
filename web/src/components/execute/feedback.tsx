import { useEffect, useRef, useState } from "react";
import { useModalFocus } from "./dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const EXECUTE_VERSION = "execute-beta-2026-09";

const KINDS = [
  { id: "broke", label: "Something broke" },
  { id: "wrong-match", label: "A file went to the wrong place" },
  { id: "missing", label: "I need something it doesn't do" },
  { id: "works", label: "Something works well" },
  { id: "other", label: "Something else" },
] as const;

type Kind = (typeof KINDS)[number]["id"];

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("broke");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [technical, setTechnical] = useState(true);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed" | "limited">("idle");
  const first = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useModalFocus(box, first);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 px-4 py-10" onClick={onClose}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="feedback-title" className="w-full max-w-[520px] border border-ink bg-paper p-6 text-ink shadow-[0_24px_64px_rgba(28,25,23,0.25)] sm:p-7" onClick={(e) => e.stopPropagation()}>
        {state === "sent" ? (
          <div className="space-y-4" role="status">
            <h2 id="feedback-title" className="font-display text-3xl">
              Thank you.
            </h2>
            <p className="text-sm leading-6 text-stone">Your feedback has been sent.{email.trim() ? ` A reply will come to ${email.trim()}.` : ""}</p>
            <Button onClick={onClose}>Close</Button>
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setState("sending");
              const res = await post("/api/execute/feedback", {
                kind,
                message,
                email,
                technical: technical ? { browser: navigator.userAgent.slice(0, 300), path: location.pathname, version: EXECUTE_VERSION } : null,
              });
              setState(res.ok ? "sent" : res.status === 429 ? "limited" : "failed");
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="feedback-title" className="font-display text-3xl">
                Send feedback
              </h2>
              <button type="button" onClick={onClose} className="text-2xl leading-none text-stone hover:text-ink" aria-label="Close feedback">
                ×
              </button>
            </div>
            <p className="text-sm leading-6 text-stone">
              It goes straight to Agmt's founder. Please leave out client names and document text. Your documents are never sent
              with it.
            </p>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">What is it about?</legend>
              {KINDS.map((k) => (
                <label key={k.id} className={cn("cursor-pointer border px-3 py-1.5 text-[13px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-oxblood", kind === k.id ? "border-ink bg-ink text-paper" : "border-rule-strong hover:border-ink")}>
                  <input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} className="sr-only" />
                  {k.label}
                </label>
              ))}
            </fieldset>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">What happened, or what would help?</span>
              <textarea
                ref={first}
                required
                maxLength={2000}
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="block w-full border border-rule-strong bg-paper p-3 text-sm leading-6 outline-none focus:border-ink"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Your email, if you'd like a reply</span>
              <input type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className="block h-10 w-full border border-rule-strong bg-paper px-3 text-sm outline-none focus:border-ink" />
            </label>
            <label className="flex items-start gap-2 text-[13px] leading-5 text-stone">
              <input type="checkbox" checked={technical} onChange={(e) => setTechnical(e.target.checked)} className="mt-0.5 accent-[var(--color-oxblood)]" />
              Include my browser and app version. They describe your software, not your documents.
            </label>
            {state === "failed" ? <p className="text-sm text-oxblood" role="alert">Not sent. Check your connection and try again.</p> : null}
            {state === "limited" ? <p className="text-sm text-oxblood" role="alert">Too many messages from this connection today. Try again tomorrow.</p> : null}
            <Button type="submit" disabled={!message.trim() || state === "sending"}>
              {state === "sending" ? "Sending…" : "Send feedback"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] text-current underline underline-offset-4 decoration-rule-strong hover:decoration-current" data-testid="feedback">
        Feedback
      </button>
      {open ? <FeedbackDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function InviteOnly({ reason }: { reason: string | null }) {
  const [form, setForm] = useState({ name: "", email: "", firm: "", note: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed" | "limited">("idle");
  const [acknowledged, setAcknowledged] = useState(false);
  const note =
    reason === "expired"
      ? "That invitation link has expired. Ask for a new one below."
      : reason === "invalid"
        ? "That invitation link isn't valid. Check you copied all of it, or ask for access below."
        : null;
  return (
    <section className="mx-auto max-w-[560px] space-y-8 py-6">
      <h1 className="font-display text-[38px] leading-[1.05] tracking-[-0.02em] sm:text-[50px]">Execute is available by invitation for now.</h1>
      <p className="text-[17px] leading-8 text-ink/85">
        Execute assembles an executed copy for every party to a multi-party agreement, on your own computer. If you have an invitation
        link, open it in this browser. Otherwise, ask for access below.
      </p>
      {note ? <p className="border-l-2 border-oxblood pl-3 text-sm">{note}</p> : null}
      {state === "sent" ? (
        <div className="space-y-3 border-t border-rule pt-8" role="status" data-testid="access-sent">
          <h2 className="font-display text-2xl">Request received.</h2>
          <p className="text-[15px] leading-7 text-ink/85">
            We'll write to <span className="font-medium text-ink">{form.email.trim()}</span> when your access is ready. There's nothing
            more to do.
          </p>
          {acknowledged ? (
            <p className="text-sm leading-6 text-stone">
              A confirmation is on its way to {form.email.trim()}. If it isn't in your inbox, check your spam folder.
            </p>
          ) : null}
        </div>
      ) : (
        <form
          className="space-y-4 border-t border-rule pt-8"
          onSubmit={async (e) => {
            e.preventDefault();
            setState("sending");
            const res = await post("/api/execute/access-request", form);
            setAcknowledged(res.data.acknowledged === true);
            setState(res.ok ? "sent" : res.status === 429 ? "limited" : "failed");
          }}
        >
          <h2 className="font-display text-2xl">Ask for access</h2>
          {(
            [
              ["name", "Name", "text", true],
              ["email", "Work email", "email", true],
              ["firm", "Firm or company (optional)", "text", false],
            ] as const
          ).map(([key, label, type, required]) => (
            <label key={key} className="block space-y-1.5">
              <span className="text-sm font-medium">{label}</span>
              <input
                type={type}
                required={required}
                maxLength={key === "email" ? 200 : 160}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="block h-10 w-full border border-rule-strong bg-paper px-3 text-sm outline-none focus:border-ink"
              />
            </label>
          ))}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">What do you sign most often? (optional)</span>
            <textarea rows={3} maxLength={1000} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="block w-full border border-rule-strong bg-paper p-3 text-sm outline-none focus:border-ink" />
          </label>
          {state === "failed" ? <p className="text-sm text-oxblood" role="alert">Not sent. Check your connection and try again.</p> : null}
          {state === "limited" ? <p className="text-sm text-oxblood" role="alert">Too many requests from this connection today. Try again tomorrow.</p> : null}
          <Button type="submit" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Ask for access"}
          </Button>
        </form>
      )}
    </section>
  );
}
