import { PROOF_UI_COPY } from "@/lib/products/api-contracts";
import type { ProofAuthKind } from "@/lib/products/proof-state";

export function ProofAccessGate({
  auth,
  verificationSent,
  returnTo,
}: {
  auth: ProofAuthKind;
  verificationSent?: boolean;
  returnTo: string;
}) {
  if (auth === "loading") {
    return <p className="text-sm" role="status">{PROOF_UI_COPY.auth_loading.heading}</p>;
  }
  if (auth === "unavailable") {
    return <p className="text-sm" role="alert">{PROOF_UI_COPY.auth_unavailable.heading}</p>;
  }
  if (auth === "signed_out") {
    return (
      <p className="text-sm leading-6">
        {PROOF_UI_COPY.signed_out.heading}{" "}
        <a href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="underline underline-offset-4">Sign in to Agmt</a>
        . You may need to select your file again.
      </p>
    );
  }
  if (auth === "unverified") {
    return (
      <div className="space-y-1 text-sm leading-6">
        <p>{verificationSent ? PROOF_UI_COPY.verification_sent.heading : PROOF_UI_COPY.unverified.heading}</p>
        {verificationSent ? <p className="text-stone">{PROOF_UI_COPY.verification_sent.main}</p> : null}
      </div>
    );
  }
  return null;
}
