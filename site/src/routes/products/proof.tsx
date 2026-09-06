import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Page, SiteFrame } from "@/components/site/frame";
import { ProofSpecimen } from "@/components/site/proof-specimen";
import { ProofCta } from "@/components/site/state-cta";
import { PROOF, PROOF_STATE, METADATA } from "@/brand/copy";

const isLaunch = PROOF_STATE === "launch";

export const Route = createFileRoute("/products/proof")({
  component: ProofPage,
  head: () => ({
    meta: [
      { title: isLaunch ? METADATA.proof.title : METADATA.proof.prelaunchTitle },
      {
        name: "description",
        content: isLaunch ? METADATA.proof.description : METADATA.proof.prelaunchDescription,
      },
    ],
  }),
});

function ProofPage() {
  return (
    <SiteFrame>
      <Page>
        {/* F01 */}
        <p className="eyebrow">{PROOF.breadcrumb}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-page-title max-w-2xl">{PROOF.name}</h1>
        </div>
        <span className="status-pill status-pill-citron mt-4 inline-flex">
          {isLaunch ? PROOF.status : PROOF.prelaunchStatus}
        </span>
        {!isLaunch ? (
          <p className="mt-5 max-w-xl text-[1.0625rem] leading-[1.7]" role="status">
            {PROOF.prelaunchNotice}
          </p>
        ) : null}
        <h2 className="text-section-title mt-6 max-w-2xl">{PROOF.headline}</h2>
        <p className="text-lead mt-4 max-w-xl text-[var(--color-ash)]">{PROOF.body}</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
          <ProofCta prelaunchLabel="View all products" prelaunchTo="/products" />
          <a href="#checks" className="text-link">
            {PROOF.secondaryLink} <ArrowRight size={16} aria-hidden />
          </a>
        </div>
        <p className="text-helper mt-4">{PROOF.helper}</p>

        {/* F02 */}
        <div className="mt-16 sm:mt-20">
          <h2 className="text-section-title max-w-xl">{PROOF.output.heading}</h2>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
            {PROOF.output.body}
          </p>
          <p className="mt-2 max-w-xl text-[1.0625rem] leading-[1.7]">{PROOF.output.supporting}</p>
          <div className="mt-8 max-w-2xl">
            <ProofSpecimen caption={PROOF.output.exampleCaption} />
          </div>
        </div>

        {/* F03 */}
        <div className="mt-16 border-t border-rule pt-14 sm:mt-20 sm:pt-16">
          <h2 className="text-section-title max-w-xl">{PROOF.steps.heading}</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {PROOF.steps.items.map((step, i) => (
              <li key={step.heading}>
                <span className="eyebrow">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-product-title mt-2">{step.heading}</p>
                <p className="mt-2 text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* F04 */}
        <div id="checks" className="mt-16 scroll-mt-24 border-t border-rule pt-14 sm:mt-20 sm:pt-16">
          <h2 className="text-section-title max-w-xl">{PROOF.checks.heading}</h2>
          <p className="text-lead mt-4 max-w-xl text-[var(--color-ash)]">{PROOF.checks.intro}</p>
          <ul className="mt-8 divide-y divide-[var(--color-rule)] border-y border-rule">
            {PROOF.checks.items.map((check) => (
              <li key={check.name} className="grid gap-1 py-5 sm:grid-cols-[14rem_1fr] sm:gap-8">
                <p className="font-semibold">{check.name}</p>
                <p className="text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">{check.description}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-xl text-[1.0625rem] leading-[1.7]">{PROOF.checks.scopeNote}</p>
          <p className="mt-3 max-w-xl font-semibold">{PROOF.checks.decisionNote}</p>
        </div>

        {/* F05 */}
        <div className="mt-16 border-t border-rule pt-14 sm:mt-20 sm:pt-16">
          <h2 className="text-section-title max-w-xl">{PROOF.documents.heading}</h2>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-[1.7]">{PROOF.documents.body}</p>
          <p className="mt-3 max-w-xl text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
            {PROOF.documents.limitations}
          </p>
          <p className="text-helper mt-3 max-w-xl">{PROOF.documents.coverageNote}</p>
        </div>

        {/* F06 */}
        <div className="mt-16 border-t border-rule pt-14 sm:mt-20 sm:pt-16">
          <h2 className="text-section-title max-w-xl">{PROOF.handling.heading}</h2>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-[1.7]">{PROOF.handling.body}</p>
          <p className="mt-3 max-w-xl text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
            {PROOF.handling.timingNote}
          </p>
          <p className="mt-3 max-w-xl text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
            {PROOF.handling.processingNote}
          </p>
          <Link to="/trust" className="text-link mt-6">
            {PROOF.handling.link} <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        {/* F07 */}
        <div className="mt-16 border-t border-rule pt-14 sm:mt-20 sm:pt-16">
          <h2 className="text-section-title max-w-xl">Questions</h2>
          <div className="mt-8 max-w-2xl">
            {PROOF.faq.map((item) => (
              <details key={item.question} className="faq-item">
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>

        {/* F08 */}
        <div className="mt-16 border-t border-rule pt-14 text-center sm:mt-20 sm:pt-16">
          <h2 className="text-section-title mx-auto max-w-lg">
            {isLaunch ? PROOF.closing.headline : PROOF.closing.prelaunchHeadline}
          </h2>
          <div className="mt-7 flex justify-center">
            <ProofCta prelaunchLabel="View all products" prelaunchTo="/products" />
          </div>
          <p className="text-helper mt-4">
            {isLaunch ? PROOF.closing.helper : PROOF.closing.prelaunchHelper}
          </p>
        </div>
      </Page>
    </SiteFrame>
  );
}
