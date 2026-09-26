import { ProofActions, type ProofActionHandlers } from "@/components/agmt/proof-actions";
import { ProofCoverage } from "@/components/agmt/proof-coverage";
import { ProofStage } from "@/components/agmt/proof-stage";
import { presentProofRun, type ProofLocalContext } from "@/lib/products/proof-state";
import type { RunSummaryV2 } from "@/lib/products/api-contracts";

export function ProofRunView({
  run,
  local,
  busy,
  handlers,
}: {
  run: RunSummaryV2 | null;
  local: ProofLocalContext;
  busy?: boolean;
  handlers: ProofActionHandlers;
}) {
  const view = presentProofRun(run, local);
  const live = view.live === "polite" ? "polite" : undefined;
  return (
    <section className="space-y-6" aria-live={live} aria-atomic="true">
      {view.developmentFixture ? (
        <p className="border border-ink bg-paper-sunk px-4 py-3 text-sm" role="note">
          Development fixture. This is not a live Proof run and does not process a document.
        </p>
      ) : null}
      <ProofStage view={view} />
      <h1 className="font-display text-[32px] leading-tight sm:text-5xl">{view.heading}</h1>
      {view.main ? <p className="text-base leading-7">{view.main}</p> : null}
      {view.detail ? <p className="text-sm leading-6 text-stone">{view.detail}</p> : null}
      {view.progress ? (
        <p className="text-sm text-stone">{view.progress.sent} of {view.progress.total} bytes sent. Keep this page open until upload finishes.</p>
      ) : null}
      {view.counts ? (
        <p className="text-sm leading-6">
          {view.counts.corrections} tracked corrections · {view.counts.comments} comments to review
          {view.counts.notices ? ` · ${view.counts.notices} coverage notice` : ""}
        </p>
      ) : null}
      {view.state === "limited" ? (
        <p className="border-l-2 border-oxblood pl-4 text-sm leading-6">Your document is ready with limited coverage. Do not treat this as a clean result.</p>
      ) : null}
      {view.timestamps ? (
        <p className="text-sm leading-6 text-stone">
          Downloads close at <time dateTime={view.timestamps.accessIso}>{view.timestamps.accessLabel}</time>.
          Deletion is due at <time dateTime={view.timestamps.retentionIso}>{view.timestamps.retentionLabel}</time>.
        </p>
      ) : null}
      <ProofCoverage view={view} />
      {view.supportId ? <p className="text-sm text-stone">Support reference {view.supportId}</p> : null}
      <ProofActions view={view} busy={busy} handlers={handlers} />
    </section>
  );
}
