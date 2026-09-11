import { createFileRoute, Link } from "@tanstack/react-router";
import { PROOF_LOCAL_DEVICE, PROOF_LOCAL_LIMITS_NOTE, PROOF_LOCAL_NO_ACCOUNT, PROOF_LOCAL_PRIVACY } from "@/lib/proof-local/copy";
import { publishedProofCapacityPolicy } from "@/lib/proof-local/policy";

export const Route = createFileRoute("/proof/help")({ component: ProofHelp });

function ProofHelp() {
  return (
      <article className="mx-auto max-w-[720px] space-y-6 text-sm leading-7">
        <p className="text-sm text-stone">Agmt / Proof</p>
        <h1 className="font-display text-[32px] leading-tight sm:text-5xl">How to use Proof</h1>
        <p>Proof reads a native Word document on this device and returns a marked copy. Safe corrections appear as tracked changes. Items that need your judgment appear as Word comments.</p>
        <p>{PROOF_LOCAL_NO_ACCOUNT}</p>
        <p>{PROOF_LOCAL_DEVICE}</p>
        <h2 className="font-display text-2xl">What Proof checks in this beta</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Ordinary English spelling in prose, as Word comments, using a UK or US dictionary. Names, defined terms, identifiers, quoted defined names and short quoted examples are left alone. Quoted sentences of ordinary prose are commented. A word that appears many times is not treated as correct merely because it repeats; repeated comments are combined onto the first exact span</li>
          <li>A small frozen list of common typos that can be corrected as tracked changes</li>
          <li>Repeated ordinary function words such as “the the”</li>
          <li>Repeated punctuation such as “pay,,”, extra ordinary-prose spaces, a space before a comma or full stop, and a missing space after punctuation, as tracked changes when the span is exact</li>
          <li>Unmatched brackets or quotation marks, as comments, after checking neighbouring paragraphs. Proof does not insert the missing mark merely because one paragraph is missing it</li>
          <li>Headers: tracked typo and punctuation corrections only. Proof does not place comments in headers in this cohort. Footers, footnotes and endnotes are preserved and not checked</li>
          <li>Unfinished placeholders such as [●] or [TBD]</li>
          <li>Duplicate definitions in an unambiguous scope, schedule re-definitions that change the meaning, and defined terms used with the wrong capitalisation</li>
          <li>Duplicate clause numbers, missing or ambiguous internal references, and references that only exist in another schedule, when numbering scope is complete</li>
          <li>Title-case phrases that look like defined terms but have no matching definition</li>
          <li>A party role used with a different legal name from the one declared for that role, when the names are not merely Ltd/Limited or a different group company</li>
          <li>Calendar-invalid dates such as 31 April, and bound words-and-figures pairs that do not match, such as USD 10,000 (fifteen thousand)</li>
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
        <h2 className="font-display text-2xl">Size and complexity</h2>
        <p>The published file-size limit is {publishedProofCapacityPolicy().label}. {PROOF_LOCAL_LIMITS_NOTE} File-size refusals are distinct from complexity refusals (Word XML or extracted text). Proof does not recommend splitting an agreement into clauses, because that can miss document-wide checks.</p>
        <h2 className="font-display text-2xl">If something goes wrong</h2>
        <p>If a document cannot be processed safely, choose another file. Closing or refreshing this page loses the current run; choose the file again. Proof does not keep a copy on Agmt’s servers to resume later.</p>
        <h2 className="font-display text-2xl">Invited testing</h2>
        <p>Public Proof stays available. Invited testers can report an incorrect finding, a missed error, or a formatting or download problem without attaching the document. <Link to="/proof/feedback" className="underline underline-offset-4">Send feedback</Link>.</p>
        <p><Link to="/proof" className="underline underline-offset-4">Back to Proof</Link></p>
      </article>
  );
}
