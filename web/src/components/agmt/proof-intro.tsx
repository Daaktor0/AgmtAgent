import { Link } from "@tanstack/react-router";
import { PROOF_LOCAL_DEVICE, PROOF_LOCAL_HEADING, PROOF_LOCAL_MAIN, PROOF_LOCAL_PRIVACY } from "@/lib/proof-local/copy";

export function ProofIntro() {
  return (
    <header className="space-y-4">
      <p className="text-sm text-stone">Agmt / Proof</p>
      <p className="text-sm">Free at launch</p>
      <h1 className="font-display text-[32px] leading-tight sm:text-5xl">{PROOF_LOCAL_HEADING}</h1>
      <p className="text-base leading-7">{PROOF_LOCAL_MAIN}</p>
      <p className="border-l-2 border-oxblood pl-4 text-sm leading-6">{PROOF_LOCAL_PRIVACY}</p>
      <p className="text-sm leading-6 text-stone">
        {PROOF_LOCAL_DEVICE}{" "}
        <Link to="/proof/help" className="underline underline-offset-4">What Proof checks</Link>
      </p>
    </header>
  );
}
