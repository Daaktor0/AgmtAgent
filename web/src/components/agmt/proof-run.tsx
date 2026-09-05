import { Button } from "@/components/ui/button";
import { proofView } from "@/lib/products/proof-state";
import type { RunSummary } from "@/lib/products/contracts";

/** Pure view: fixture responses belong in tests, never a deployed fake job handler. */
export function ProofRunView({ run, now, onDownload, onDelete }: {
  run: RunSummary; now: number; onDownload: () => void; onDelete: () => void;
}) {
  const view = proofView(run, now);
  return <section className="max-w-2xl space-y-6" aria-live="polite" aria-atomic="true">
    <h1 className="font-display text-3xl">{view.message}</h1>
    {view.download ? <>
      <p>{run.correctionCount} suggested corrections · {run.commentCount} comments</p>
      <Button onClick={onDownload}>{run.correctionCount + run.commentCount ? "Download proofread Word document" : "Download checked Word document"}</Button>
      {run.coverage === "limited" ? <p className="border-l-2 border-oxblood pl-4">Some checks are incomplete. See the coverage comment in your Word document.</p> : null}
    </> : null}
    {(view.download || view.delete) ? <p className="text-sm leading-6 text-stone">Files are kept for no more than two hours from upload. Download availability ends at <time dateTime={new Date(run.deadlines.accessDeadline).toISOString()}>{new Date(run.deadlines.accessDeadline).toLocaleString()}</time>. You can delete them earlier.</p> : null}
    {view.delete ? <Button variant="secondary" onClick={onDelete}>Delete files now</Button> : null}
    {run.status === "deleted" && run.deletionVerifiedAt !== null ? <p>Files deleted.</p> : null}
  </section>;
}
