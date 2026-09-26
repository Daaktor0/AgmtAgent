import type { ProofPresentation } from "@/lib/products/proof-state";

export function ProofResultSummary({ view }: { view: ProofPresentation }) {
  if (!view.counts) return null;
  return (
    <div className="space-y-2 border-l-2 border-ink pl-4 text-sm leading-6">
      <p>
        {view.counts.corrections} tracked correction{view.counts.corrections === 1 ? "" : "s"} and {view.counts.comments} anchored comment{view.counts.comments === 1 ? "" : "s"}
        {view.state === "limited" ? " with limited coverage" : ""}.
      </p>
      {view.state === "ready_zero" ? <p>This does not confirm that the document is error-free.</p> : null}
      {view.state === "download_started" ? <p>Your download has started. Check your browser’s downloads. This does not confirm that the file was saved.</p> : null}
    </div>
  );
}
