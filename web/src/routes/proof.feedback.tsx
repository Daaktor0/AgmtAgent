import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PROOF_BETA_FEEDBACK_COPY,
  PROOF_BETA_FEEDBACK_REASONS,
  PROOF_CLIENT_VERSION,
  proofBetaFeedbackBody,
  type ProofBetaFeedbackCategory,
  type ProofBetaFeedbackReason,
} from "@/lib/proof-local/beta-feedback";

export const Route = createFileRoute("/proof/feedback")({ component: ProofFeedbackPage });

const CATEGORIES: { id: ProofBetaFeedbackCategory; label: string }[] = [
  { id: "incorrect_finding", label: "An incorrect finding" },
  { id: "missed_error", label: "A missed error" },
  { id: "formatting_download", label: "A formatting or download problem" },
];

function ProofFeedbackPage() {
  const [category, setCategory] = useState<ProofBetaFeedbackCategory>("incorrect_finding");
  const [reasonCode, setReasonCode] = useState<ProofBetaFeedbackReason | "">("");
  const [includeTechnical, setIncludeTechnical] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setStatus(null);
    try {
      const body = proofBetaFeedbackBody({
        category,
        reasonCode: reasonCode || null,
        includeTechnical,
        appVersion: PROOF_CLIENT_VERSION,
        browser: typeof navigator === "undefined" ? "" : navigator.userAgent,
      });
      const response = await fetch("/api/proof/beta-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setStatus(response.ok ? PROOF_BETA_FEEDBACK_COPY.sent : PROOF_BETA_FEEDBACK_COPY.failed);
    } catch {
      setStatus(PROOF_BETA_FEEDBACK_COPY.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="mx-auto max-w-[720px] space-y-6 text-sm leading-7">
      <p className="text-sm text-stone">Agmt / Proof</p>
      <h1 className="font-display text-[32px] leading-tight sm:text-5xl">{PROOF_BETA_FEEDBACK_COPY.heading}</h1>
      <p>{PROOF_BETA_FEEDBACK_COPY.intro}</p>
      <p className="border-l-2 border-oxblood pl-4">{PROOF_BETA_FEEDBACK_COPY.reminder}</p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <fieldset className="space-y-2">
          <legend>What happened?</legend>
          {CATEGORIES.map((item) => (
            <label key={item.id} className="flex min-h-11 items-center gap-2">
              <input type="radio" name="category" checked={category === item.id} onChange={() => setCategory(item.id)} />
              {item.label}
            </label>
          ))}
        </fieldset>
        <label className="block">
          Optional closed reason
          <select
            className="mt-1 min-h-11 w-full border border-ink bg-paper p-3"
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value as ProofBetaFeedbackReason | "")}
          >
            <option value="">No extra reason</option>
            {PROOF_BETA_FEEDBACK_REASONS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-start gap-2">
          <input type="checkbox" checked={includeTechnical} onChange={(event) => setIncludeTechnical(event.target.checked)} />
          <span>{PROOF_BETA_FEEDBACK_COPY.technicalDisclosure}</span>
        </label>
        {includeTechnical ? (
          <p className="text-stone">App version {PROOF_CLIENT_VERSION}. Browser details will be taken from this page.</p>
        ) : null}
        <Button type="submit" className="min-h-11" disabled={busy}>{PROOF_BETA_FEEDBACK_COPY.send}</Button>
        {status ? <p role="status">{status}</p> : null}
      </form>
      <p><Link to="/proof" className="underline underline-offset-4">Back to Proof</Link></p>
    </article>
  );
}
