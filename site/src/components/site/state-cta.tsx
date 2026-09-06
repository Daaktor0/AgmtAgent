import { Link } from "@tanstack/react-router";
import { CTA, PROOF_STATE } from "@/brand/copy";
import { APP_URL } from "@/brand/tokens";

/**
 * The one place a "start Proof" button decides between the live app link and
 * a prelaunch fallback — see Agmt-Website-Copywriting-v2.md §13. Every
 * launch CTA renders through this so the two never drift apart.
 */
export function ProofCta({
  prelaunchLabel,
  prelaunchTo,
  variant = "primary",
  className = "",
}: {
  prelaunchLabel: string;
  prelaunchTo: string;
  variant?: "primary" | "on-dark";
  className?: string;
}) {
  const cls = `btn ${variant === "on-dark" ? "btn-on-dark" : "btn-primary"} ${className}`;
  if (PROOF_STATE === "launch") {
    return (
      <a className={cls} href={APP_URL}>
        {CTA.useProof}
      </a>
    );
  }
  return (
    <Link className={cls} to={prelaunchTo}>
      {prelaunchLabel}
    </Link>
  );
}
