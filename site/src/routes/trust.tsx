import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Page, SiteFrame } from "@/components/site/frame";
import { TRUST, PROOF_STATE, METADATA } from "@/brand/copy";

const isLaunch = PROOF_STATE === "launch";

export const Route = createFileRoute("/trust")({
  component: TrustPage,
  head: () => ({
    meta: [
      { title: METADATA.trust.title },
      { name: "description", content: METADATA.trust.description },
    ],
  }),
});

function TrustPage() {
  return (
    <SiteFrame>
      <Page>
        {/* T01 */}
        <p className="eyebrow">{TRUST.eyebrow}</p>
        <h1 className="text-page-title mt-4 max-w-2xl">{TRUST.headline}</h1>
        <p className="text-lead mt-5 max-w-xl text-[var(--color-ash)]">
          {isLaunch ? TRUST.body : TRUST.prelaunchIntro}
        </p>
        <p className="text-helper mt-3 max-w-xl">{TRUST.scopeNote}</p>

        <div className="mt-16 grid gap-14 sm:mt-20 lg:grid-cols-2 lg:gap-x-16 lg:gap-y-16">
          {/* T02 */}
          <section className="border-t border-rule pt-8">
            <h2 className="text-product-title">{TRUST.processing.heading}</h2>
            <p className="mt-3 text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
              {TRUST.processing.body}
            </p>
            <Link to="/products/proof" hash="checks" className="text-link mt-5">
              {TRUST.processing.link} <ArrowRight size={16} aria-hidden />
            </Link>
          </section>

          {/* T03 */}
          <section className="border-t border-rule pt-8">
            <h2 className="text-product-title">{TRUST.retention.heading}</h2>
            <p className="mt-3 text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
              {TRUST.retention.body}
            </p>
            <p className="mt-3 text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
              {TRUST.retention.supporting}
            </p>
          </section>

          {/* T04 */}
          <section className="border-t border-rule pt-8">
            <h2 className="text-product-title">{TRUST.otherRecords.heading}</h2>
            <p className="mt-3 text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
              {TRUST.otherRecords.body}
            </p>
            <Link to="/privacy" className="text-link mt-5">
              {TRUST.otherRecords.link} <ArrowRight size={16} aria-hidden />
            </Link>
          </section>

          {/* T05 */}
          <section className="border-t border-rule pt-8">
            <h2 className="text-product-title">{TRUST.decision.heading}</h2>
            <p className="mt-3 text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
              {TRUST.decision.body}
            </p>
          </section>
        </div>

        {/* T06 */}
        <div className="mt-16 border-t border-rule pt-10 sm:mt-20">
          <h2 className="text-product-title">{TRUST.further.heading}</h2>
          <p className="mt-3 max-w-xl text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
            {TRUST.further.body}
          </p>
          <Link to="/privacy" className="text-link mt-5">
            {TRUST.further.link} <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </Page>
    </SiteFrame>
  );
}
