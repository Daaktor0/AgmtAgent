import { createFileRoute, Link } from "@tanstack/react-router";
import { PROOF_LOCAL_DEVICE, PROOF_LOCAL_PRIVACY } from "@/lib/proof-local/copy";

export const Route = createFileRoute("/proof/help")({ component: ProofHelp });

function ProofHelp() {
  return (
      <article className="mx-auto max-w-[720px] space-y-6 text-sm leading-7">
        <p className="text-sm text-stone">Agmt / Proof</p>
        <h1 className="font-display text-[32px] leading-tight sm:text-5xl">How to use Proof</h1>
        <p>Proof reads a native Word document on this device and returns a marked copy. Safe corrections appear as tracked changes. Items that need your judgment appear as Word comments.</p>
        <p>{PROOF_LOCAL_DEVICE}</p>
        <h2 className="font-display text-2xl">What Proof checks in this beta</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>A small frozen list of common typos in ordinary English prose</li>
          <li>Repeated ordinary function words such as “the the”</li>
          <li>Unfinished placeholders such as [●] or [TBD]</li>
          <li>Duplicate definitions in an unambiguous scope</li>
          <li>Duplicate clause numbers and missing simple internal references when numbering scope is complete</li>
        </ul>
        <p>Proof is not a comprehensive legal review, grammar checker or drafting assistant. It does not use a language model.</p>
        <h2 className="font-display text-2xl">Review in Word</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Download the marked document.</li>
          <li>Open it in Microsoft Word.</li>
          <li>Turn on All Markup.</li>
          <li>Accept or reject Agmt’s tracked changes. Existing comments and revisions remain.</li>
        </ol>
        <h2 className="font-display text-2xl">Privacy</h2>
        <p>{PROOF_LOCAL_PRIVACY}</p>
        <p>Independent JavaScript validation runs on every document before download. Open XML SDK and actual Word checks are release and regression tests, not a claimed per-document production scan. Agmt does not virus-scan the file.</p>
        <h2 className="font-display text-2xl">If something goes wrong</h2>
        <p>If a document cannot be processed safely, choose another file. Closing or refreshing this page loses the current run; choose the file again. Proof does not keep a copy on Agmt’s servers to resume later.</p>
        <p><Link to="/proof" className="underline underline-offset-4">Back to Proof</Link></p>
      </article>
  );
}
