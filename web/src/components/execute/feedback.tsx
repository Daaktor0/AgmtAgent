import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const EXECUTE_VERSION = "execute-beta-2026-09";

const KINDS = [
  { id: "broke", label: "Something broke" },
  { id: "wrong-match", label: "A file went to the wrong place" },
  { id: "missing", label: "I need something it doesn't do" },
  { id: "works", label: "This works well" },
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

  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 px-4 py-10" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onClick={onClose}>
      <div className="w-full max-w-[520px] bg-paper p-7 text-ink shadow-[0_24px_64px_rgba(28,25,23,0.25)]" onClick={(e) => e.stopPropagation()}>
        {state === "sent" ? (
          <div className="space-y-4" role="status">
            <h2 id="feedback-title" className="font-display text-3xl">
              Thank you.
            </h2>
            <p className="text-sm leading-6 text-stone">It has reached the founder. {email ? "You'll get a reply at the address you gave." : ""}</p>
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
                Tell us what's working
              </h2>
              <button type="button" onClick={onClose} className="text-2xl leading-none text-stone hover:text-ink" aria-label="Close">
                ×
              </button>
            </div>
            <p className="text-sm leading-6 text-stone">
              This goes straight to the person building Agmt. Don't paste client names or document text. Your documents are
              never sent with it.
            </p>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">What is it about?</legend>
              {KINDS.map((k) => (
                <label key={k.id} className={cn("cursor-pointer border px-3 py-1.5 text-[13px]", kind === k.id ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink")}>
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
                className="block w-full border border-rule bg-paper p-3 text-sm leading-6 outline-none focus:border-ink"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Your email, if you'd like a reply</span>
              <input type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className="block h-10 w-full border border-rule bg-paper px-3 text-sm outline-none focus:border-ink" />
            </label>
            <label className="flex items-start gap-2 text-[13px] leading-5 text-stone">
              <input type="checkbox" checked={technical} onChange={(e) => setTechnical(e.target.checked)} className="mt-0.5 accent-[var(--color-oxblood)]" />
              Include my browser and app version. They describe your software, not your documents.
            </label>
            {state === "failed" ? <p className="text-sm text-oxblood">It didn't send. Check your connection and try again.</p> : null}
            {state === "limited" ? <p className="text-sm text-oxblood">That's a lot of messages today. Try again tomorrow.</p> : null}
            <Button type="submit" disabled={!message.trim() || state === "sending"}>
              {state === "sending" ? "Sending…" : "Send"}
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
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] text-paper underline-offset-4 hover:underline" data-testid="feedback">
        Feedback
      </button>
      {open ? <FeedbackDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}
