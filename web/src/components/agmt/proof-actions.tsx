import { Button } from "@/components/ui/button";
import type { ProofPresentation } from "@/lib/products/proof-state";

export type ProofActionHandlers = {
  onDownload?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
  onCheckStatus?: () => void;
  onChooseFile?: () => void;
  onSignIn?: () => void;
  onVerify?: () => void;
  onResend?: () => void;
  onCancelUpload?: () => void;
  onKeepFiles?: () => void;
  onProofread?: () => void;
  onStartAnother?: () => void;
};

export function ProofActions({
  view,
  busy = false,
  handlers,
}: {
  view: ProofPresentation;
  busy?: boolean;
  handlers: ProofActionHandlers;
}) {
  const a = view.actions;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {a.proofread ? <Button className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={handlers.onProofread}>Proofread document</Button> : null}
      {a.download ? <Button className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={handlers.onDownload}>Download Word document</Button> : null}
      {a.retry ? <Button className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={handlers.onRetry}>Try again</Button> : null}
      {a.checkStatus ? <Button className="min-h-11 w-full sm:w-auto" variant="secondary" disabled={busy} onClick={handlers.onCheckStatus}>Check status</Button> : null}
      {a.signIn ? <Button className="min-h-11 w-full sm:w-auto" onClick={handlers.onSignIn}>Sign in</Button> : null}
      {a.resendVerification ? <Button className="min-h-11 w-full sm:w-auto" variant="secondary" disabled={busy} onClick={handlers.onResend}>Resend verification email</Button> : null}
      {a.verify ? <Button className="min-h-11 w-full sm:w-auto" variant="secondary" disabled={busy} onClick={handlers.onVerify}>I’ve verified my email</Button> : null}
      {a.cancelUpload ? <Button className="min-h-11 w-full sm:w-auto" variant="secondary" disabled={busy} onClick={handlers.onCancelUpload}>Cancel upload</Button> : null}
      {a.keepFiles ? <Button className="min-h-11 w-full sm:w-auto" variant="secondary" onClick={handlers.onKeepFiles}>Keep files</Button> : null}
      {a.delete ? <Button className="min-h-11 w-full sm:w-auto" variant="danger" disabled={busy} onClick={handlers.onDelete}>Delete files</Button> : null}
      {a.chooseFile || a.chooseDifferentFile || a.startAnother ? (
        <Button className="min-h-11 w-full sm:w-auto" variant="secondary" onClick={handlers.onChooseFile ?? handlers.onStartAnother}>
          {a.chooseDifferentFile ? "Choose a different file" : a.startAnother ? "Check another document" : "Choose Word document"}
        </Button>
      ) : null}
    </div>
  );
}
