import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/agmt/shell";

export const Route = createFileRoute("/")({ component: Home });
function Home() {
  return <Shell><section className="max-w-3xl space-y-7">
    <p className="text-sm text-stone">Agreement utilities</p>
    <h1 className="font-display text-4xl sm:text-5xl">Agmt</h1>
    <p className="text-base leading-7">Tools for the work around agreements. Proof is the first product.</p>
    <div className="space-y-4 border-y border-rule py-7">
      <h2 className="font-display text-3xl">Proof</h2>
      <p className="text-sm leading-6 text-stone">Proofread a Word agreement. Review safe corrections as tracked changes and items needing judgment as comments.</p>
      <Link to="/proof" className="inline-flex min-h-10 items-center border border-oxblood bg-oxblood px-5 text-sm text-paper focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-oxblood">Open Proof</Link>
      <p className="text-sm text-stone">Beta preparation · uploads not yet available</p>
    </div>
    <Link to="/matters" className="text-sm text-stone underline underline-offset-4">Existing matters</Link>
  </section></Shell>;
}
