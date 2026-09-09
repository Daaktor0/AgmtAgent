import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/agmt/shell";
import { PROOF_LOCAL_DEVICE } from "@/lib/proof-local/copy";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Shell><section className="max-w-3xl space-y-7">
    <p className="text-sm text-stone">Tools for modern legal work</p>
    <h1 className="font-display text-4xl sm:text-5xl">Agmt</h1>
    <p className="text-base leading-7">Tools for the work around agreements. Proof is the first product.</p>
    <div className="space-y-4 border-y border-rule py-7">
      <h2 className="font-display text-3xl">Proof</h2>
      <p className="text-sm leading-6 text-stone">Proofread a Word agreement. Review safe corrections as tracked changes and items needing judgment as comments.</p>
      <p className="text-sm">Free at launch</p>
      <p className="text-sm leading-6 text-stone">{PROOF_LOCAL_DEVICE} Agmt’s servers do not receive the file.</p>
      <Link to="/proof" className="inline-flex min-h-10 items-center border border-oxblood bg-oxblood px-5 text-sm text-paper focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-oxblood">Open Proof</Link>
    </div>
    <Link to="/matters" className="text-sm text-stone underline underline-offset-4">Existing matters</Link>
    {import.meta.env.DEV ? <p className="text-sm text-stone"><Link to="/proof/dev" className="underline underline-offset-4">Development Proof fixtures</Link> — not live processing.</p> : null}
  </section></Shell>;
}
