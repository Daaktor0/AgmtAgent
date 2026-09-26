import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ExecuteShell } from "@/components/execute/execute-shell";
import { useHydrated } from "@/components/execute/access-gate";
import { Button } from "@/components/ui/button";
import { getDecision } from "@/lib/execute/access.fn";
import { EXECUTE_CSP_META } from "@/lib/execute/csp";
import type { AccessRecord, AccessStatus } from "@/lib/execute/access-store";
import { cn } from "@/lib/utils";

type Action = "approve" | "not_yet" | "decline";
const ACTIONS: Action[] = ["approve", "not_yet", "decline"];

/**
 * The founder's decision page, opened from an access-request email. Opening
 * it changes nothing (mail scanners open links); only pressing a button does.
 */
export const Route = createFileRoute("/access/$token")({
  validateSearch: (s: Record<string, unknown>): { do?: Action } =>
    ACTIONS.includes(s.do as Action) ? { do: s.do as Action } : {},
  loader: ({ params }) => getDecision({ data: { token: params.token } }),
  component: Decide,
  head: () => ({
    meta: [
      { title: "Access request — Execute by Agmt" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
      { httpEquiv: "Content-Security-Policy", content: EXECUTE_CSP_META },
    ],
  }),
});

const STATUS_LABEL: Record<AccessStatus, string> = {
  requested: "Waiting for your decision",
  approved: "Approved",
  not_yet: "Not yet",
  declined: "Declined",
};

const ACTION: Record<Action, { status: AccessStatus; button: string; explain: (first: string) => string; done: (first: string, emailed: boolean) => string }> = {
  approve: {
    status: "approved",
    button: "Approve and send the set-up link",
    explain: (f) => `${f} is sent a link to set up their account. They sign in with this email and a password of their own.`,
    done: (f, emailed) => (emailed ? `Approved. ${f} has been sent the link to set up their account.` : `Approved. The email to ${f} couldn't be sent; copy the link below and send it yourself.`),
  },
  not_yet: {
    status: "not_yet",
    button: "Not yet",
    explain: (f) => `${f} gets a warm "not just yet". The request stays here, and you can approve it later from the same email.`,
    done: (f, emailed) => (emailed ? `Marked not yet. ${f} has been told their request is kept.` : `Marked not yet. The email to ${f} couldn't be sent.`),
  },
  decline: {
    status: "declined",
    button: "Decline",
    explain: (f) => `${f} gets a polite note that they can't join this beta, and that we'll write when Agmt opens to everyone. If they had access, it ends now.`,
    done: (f, emailed) => (emailed ? `Declined. ${f} has been sent a polite note.` : `Declined. The email to ${f} couldn't be sent.`),
  },
};

const REASON: Record<string, string> = {
  invalid: "This link isn't valid. Open it again from the access-request email, and check all of it was copied.",
  not_found: "There's no request for this address any more. If they ask again, you'll get a new email.",
  unavailable: "The approved list isn't answering right now. Try again in a minute.",
  unconfigured: "Decisions aren't set up on this server yet (AGMT_INVITE_SECRET is missing).",
};

function Decide() {
  const view = Route.useLoaderData();
  const { token } = Route.useParams();
  const search = Route.useSearch();
  return (
    <ExecuteShell>
      <section className="mx-auto max-w-[640px] space-y-8 py-6" data-testid="decide">
        <p className="text-[11px] uppercase tracking-[0.16em] text-stone">Access request</p>
        {view.ok ? (
          <Decision token={token} initial={view.record} join={"join" in view ? view.join : undefined} preselect={search.do} />
        ) : (
          <div className="space-y-3">
            <h1 className="font-display text-[38px] leading-[1.05] tracking-[-0.02em] sm:text-[44px]">This link can't be used.</h1>
            <p className="text-[17px] leading-8 text-ink/80">{REASON[view.reason] ?? REASON.invalid}</p>
          </div>
        )}
      </section>
    </ExecuteShell>
  );
}

function Decision({ token, initial, join, preselect }: { token: string; initial: AccessRecord; join?: string; preselect?: Action }) {
  const [record, setRecord] = useState(initial);
  const [chosen, setChosen] = useState<Action>(preselect ?? "approve");
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const [outcome, setOutcome] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ready = useHydrated();
  const first = record.name.trim().split(/\s+/)[0] || record.name;
  const current = ACTION[chosen];
  const already = record.status === current.status;

  return (
    <>
      <div className="space-y-2">
        <h1 className="font-display text-[38px] leading-[1.05] tracking-[-0.02em] sm:text-[44px]">{record.name}</h1>
        <p className="text-[15px] text-ink/80">
          {record.email}
          {record.firm ? ` · ${record.firm}` : ""}
        </p>
      </div>

      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 border-y border-rule py-5 text-sm">
        <dt className="text-stone">Signs most</dt>
        <dd>{record.note || "Not given"}</dd>
        <dt className="text-stone">Asked</dt>
        <dd>{new Date(record.requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</dd>
        <dt className="text-stone">Now</dt>
        <dd data-testid="decision-status">
          <span className="inline-flex items-center gap-2">
            <span className={cn("size-2", record.status === "approved" ? "bg-ink" : record.status === "declined" ? "border border-oxblood" : "bg-oxblood")} aria-hidden="true" />
            {STATUS_LABEL[record.status]}
            {record.decidedAt ? <span className="text-stone">· {new Date(record.decidedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span> : null}
          </span>
        </dd>
      </dl>

      {outcome ? (
        <p className="border-l-2 border-ink pl-3 text-[15px] leading-7" role="status" data-testid="decision-outcome">
          {outcome}
        </p>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm font-medium">Your decision</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {ACTIONS.map((a) => (
            <label key={a} className={cn("cursor-pointer border px-4 py-2 text-sm", chosen === a ? "border-ink bg-ink text-paper" : "border-rule-strong hover:border-ink")}>
              <input type="radio" name="decision" value={a} checked={chosen === a} onChange={() => setChosen(a)} className="sr-only" />
              {a === "approve" ? "Approve" : a === "not_yet" ? "Not yet" : "Decline"}
            </label>
          ))}
        </div>
        <p className="text-sm leading-6 text-stone">{already ? `Already ${STATUS_LABEL[record.status].toLowerCase()}. Nothing more will be sent.` : current.explain(first)}</p>
        {state === "failed" ? <p className="text-sm text-oxblood">That didn't go through. Try again in a moment.</p> : null}
        <Button
          variant={chosen === "approve" ? "primary" : "secondary"}
          disabled={state === "busy" || already || !ready}
          data-testid="decision-submit"
          data-ready={ready}
          onClick={async () => {
            setState("busy");
            try {
              const res = await fetch("/api/execute/decide", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, action: chosen }),
              });
              const data = (await res.json().catch(() => ({}))) as { ok?: boolean; emailed?: boolean; status?: AccessStatus; decidedAt?: string | null };
              if (!res.ok || !data.ok || !data.status) throw new Error("failed");
              setRecord((r) => ({ ...r, status: data.status as AccessStatus, decidedAt: data.decidedAt ?? r.decidedAt }));
              setOutcome(current.done(first, Boolean(data.emailed)));
              setState("idle");
            } catch {
              setState("failed");
            }
          }}
        >
          {state === "busy" ? "Working…" : current.button}
        </Button>
      </fieldset>

      {record.status === "approved" && join ? (
        <div className="space-y-2 border-t border-rule pt-6">
          <p className="text-sm font-medium">Their set-up link</p>
          <p className="text-sm leading-6 text-stone">To send it yourself, on WhatsApp for example. It holds no secret: only {record.email} can use it.</p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="max-w-full break-all bg-paper-sunk px-2 py-1 text-[12px]">{join}</code>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(join);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
