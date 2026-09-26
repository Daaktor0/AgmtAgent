import { PROOF_UI_COPY } from "@/lib/products/api-contracts";
import { Button } from "@/components/ui/button";

export function ProofDeleteDialog({
  open,
  busy,
  onKeep,
  onConfirm,
}: {
  open: boolean;
  busy?: boolean;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4" role="dialog" aria-modal="true" aria-labelledby="proof-delete-title">
      <div className="w-full max-w-md space-y-4 border border-ink bg-paper p-6">
        <h2 id="proof-delete-title" className="font-display text-2xl">{PROOF_UI_COPY.delete_confirmation.heading}</h2>
        <p className="text-sm leading-6">{PROOF_UI_COPY.delete_confirmation.main}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button className="min-h-11" variant="secondary" onClick={onKeep}>Keep files</Button>
          <Button className="min-h-11" variant="danger" disabled={busy} onClick={onConfirm}>Delete files</Button>
        </div>
      </div>
    </div>
  );
}
