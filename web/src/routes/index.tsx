import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/agmt/shell";
import { parseProofCapabilities, PROOF_CAPABILITIES_FALLBACK, proofAvailabilityCopy, type ProofCapabilitiesV2 } from "@/lib/products/capabilities";

export const Route = createFileRoute("/")({ component: Home });

async function loadProofCapabilities(): Promise<ProofCapabilitiesV2> {
  try {
    const response = await fetch("/api/proof/capabilities", { cache: "no-store" });
    if (!response.ok) return PROOF_CAPABILITIES_FALLBACK;
    return parseProofCapabilities(await response.json());
  } catch {
    return PROOF_CAPABILITIES_FALLBACK;
  }
}

function Home() {
  const [capabilities, setCapabilities] = useState<ProofCapabilitiesV2>(PROOF_CAPABILITIES_FALLBACK);
  useEffect(() => { void loadProofCapabilities().then(setCapabilities); }, []);
  const paused = proofAvailabilityCopy(capabilities.acceptingUploads);
  return <Shell><section className="max-w-3xl space-y-7">
    <p className="text-sm text-stone">Tools for modern legal work</p>
    <h1 className="font-display text-4xl sm:text-5xl">Agmt</h1>
    <p className="text-base leading-7">Tools for the work around agreements. Proof is the first product.</p>
    <div className="space-y-4 border-y border-rule py-7">
      <h2 className="font-display text-3xl">Proof</h2>
      <p className="text-sm leading-6 text-stone">Proofread a Word agreement. Review safe corrections as tracked changes and items needing judgment as comments.</p>
      <p className="text-sm">Free at launch</p>
      <Link to="/proof" className="inline-flex min-h-10 items-center border border-oxblood bg-oxblood px-5 text-sm text-paper focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-oxblood">Open Proof</Link>
      {paused ? <div className="space-y-1 text-sm text-stone"><p>{paused.heading}</p><p>{paused.detail}</p></div> : null}
    </div>
    <Link to="/matters" className="text-sm text-stone underline underline-offset-4">Existing matters</Link>
    {import.meta.env.DEV ? <p className="text-sm text-stone"><Link to="/proof/dev" className="underline underline-offset-4">Development Proof fixtures</Link> — not live processing.</p> : null}
  </section></Shell>;
}
