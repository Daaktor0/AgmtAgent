import type { ProofPresentation } from "@/lib/products/proof-state";

const STAGE_ICON: Record<string, string> = {
  uploading: "↑",
  scanning: "○",
  queued: "…",
  processing: "○",
  exporting: "○",
  validating: "○",
  slow: "○",
  ready_findings: "✓",
  ready_zero: "✓",
  limited: "!",
  deleting: "○",
  delete_delayed: "!",
  deleted: "✓",
  expired_not_verified: "!",
  temporary_failure: "!",
  retry_ineligible: "!",
  unsupported: "!",
  security_rejection: "!",
};

export function ProofStage({ view }: { view: ProofPresentation }) {
  const icon = STAGE_ICON[view.state] ?? "·";
  return (
    <p className="flex items-center gap-3 text-sm" role="status">
      <span className="inline-flex size-8 items-center justify-center border border-ink text-sm" aria-hidden="true">{icon}</span>
      <span>{view.state.replaceAll("_", " ")}</span>
    </p>
  );
}
