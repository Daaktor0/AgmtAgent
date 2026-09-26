import { Link } from "@tanstack/react-router";
import { formatProofInstant } from "@/lib/products/proof-state";
import type { RunSummaryV2 } from "@/lib/products/api-contracts";

export function ProofActiveRuns({ runs }: { runs: readonly RunSummaryV2[] }) {
  if (!runs.length) return null;
  const newest = [...runs].sort((a, b) => b.deadlines.uploadStartedAt - a.deadlines.uploadStartedAt).slice(0, 20);
  return (
    <section className="space-y-3" aria-labelledby="proof-active-runs">
      <h2 id="proof-active-runs" className="font-display text-2xl">Active runs</h2>
      <p className="text-sm text-stone">Filenames are not retained after you leave this page.</p>
      <ul className="space-y-2 text-sm leading-6">
        {newest.map((run) => {
          const started = formatProofInstant(run.deadlines.uploadStartedAt);
          return (
            <li key={run.runId}>
              <Link to="/proof" search={{ run: run.runId }} className="underline underline-offset-4">
                Document uploaded at <time dateTime={started.iso}>{started.label}</time>
              </Link>
              <span className="text-stone"> · {run.status}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
