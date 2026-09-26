import { useState } from "react";
import { Button } from "@/components/ui/button";

const RULES = [
  "language.typo_allowlist",
  "language.duplicate_word",
  "completion.placeholder",
  "references.missing_target",
  "references.duplicate_number",
  "definitions.duplicate",
] as const;
const CATEGORIES = ["language", "definitions", "references", "completion"] as const;
const VERDICTS = ["useful", "noisy", "incorrect", "missed"] as const;

export function ProofFeedback({
  disabled,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit: (input: { ruleId: string; category: string; verdict: string }) => Promise<void> | void;
}) {
  const [ruleId, setRuleId] = useState<typeof RULES[number]>(RULES[0]);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>(CATEGORIES[0]);
  const [verdict, setVerdict] = useState<typeof VERDICTS[number]>(VERDICTS[0]);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 border-t border-rule pt-6"
      onSubmit={(event) => {
        event.preventDefault();
        void Promise.resolve(onSubmit({ ruleId, category, verdict }))
          .then(() => setStatus("Feedback recorded. It does not change this run or its deletion time."))
          .catch(() => setStatus("Feedback could not be recorded. Try again shortly."));
      }}
    >
      <h2 className="font-display text-2xl">Optional feedback</h2>
      <p className="text-sm leading-6 text-stone">Closed counters only. Do not include document text.</p>
      <label className="block text-sm">
        Check
        <select className="mt-1 min-h-11 w-full border border-ink bg-paper px-3" value={ruleId} disabled={disabled} onChange={(event) => setRuleId(event.target.value as typeof RULES[number])}>
          {RULES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        Category
        <select className="mt-1 min-h-11 w-full border border-ink bg-paper px-3" value={category} disabled={disabled} onChange={(event) => setCategory(event.target.value as typeof CATEGORIES[number])}>
          {CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        Verdict
        <select className="mt-1 min-h-11 w-full border border-ink bg-paper px-3" value={verdict} disabled={disabled} onChange={(event) => setVerdict(event.target.value as typeof VERDICTS[number])}>
          {VERDICTS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <Button type="submit" variant="secondary" className="min-h-11" disabled={disabled}>Send feedback</Button>
      {status ? <p className="text-sm" role="status">{status}</p> : null}
    </form>
  );
}
