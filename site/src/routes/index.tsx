import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SiteFrame } from "@/components/site/frame";
import { ProofSpecimen } from "@/components/site/proof-specimen";
import { ProofCta } from "@/components/site/state-cta";
import { AgmtSymbol } from "@/brand/logo";
import { HOME, FUTURE_PRODUCTS, PROOF_STATE, METADATA } from "@/brand/copy";

const isLaunch = PROOF_STATE === "launch";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: isLaunch ? METADATA.home.title : METADATA.home.prelaunchTitle },
      {
        name: "description",
        content: isLaunch ? METADATA.home.description : METADATA.home.prelaunchDescription,
      },
    ],
  }),
});

function Home() {
  return (
    <SiteFrame>
      {/* H01 */}
      <section className="relative overflow-hidden py-14 sm:py-20 lg:py-28">
        <AgmtSymbol aria-hidden className="hero-symbol" />
        <div className="site-container relative">
          <p className="eyebrow">{HOME.hero.eyebrow}</p>
          <h1 className="text-hero mt-4 max-w-3xl">{HOME.hero.headline}</h1>
          <p className="text-lead mt-6 max-w-xl text-[var(--color-ash)]">
            {isLaunch ? HOME.hero.body : HOME.hero.prelaunchBody}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
            <ProofCta prelaunchLabel={HOME.hero.secondaryLink} prelaunchTo="/products/proof" />
            {isLaunch ? (
              <Link className="text-link" to="/products/proof">
                {HOME.hero.secondaryLink} <ArrowRight size={16} aria-hidden />
              </Link>
            ) : null}
          </div>
          <p className="text-helper mt-5">{isLaunch ? HOME.hero.helper : HOME.hero.prelaunchHelper}</p>
        </div>
      </section>

      {/* H02 */}
      <section className="border-t border-rule bg-white py-14 sm:py-20 lg:py-28">
        <div className="site-container grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="eyebrow">{HOME.featured.label}</p>
            <h2 className="text-section-title mt-4">{HOME.featured.headline}</h2>
            <p className="text-lead mt-5 max-w-md text-[var(--color-ash)]">{HOME.featured.body}</p>
            <p className="mt-4 max-w-md text-[1.0625rem] leading-[1.7]">{HOME.featured.outputExplanation}</p>
            <Link to="/products/proof" className="text-link mt-7">
              {HOME.featured.link} <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <ProofSpecimen caption={HOME.featured.specimenCaption} />
        </div>
      </section>

      {/* H03 */}
      <section aria-label={HOME.facts.accessibleLabel} className="py-14 sm:py-20 lg:py-24">
        <div className="site-container">
          <div className="grid gap-10 sm:grid-cols-3 sm:gap-8">
            {HOME.facts.items.map((fact) => (
              <div key={fact.heading} className="border-t border-rule pt-6">
                <h3 className="text-product-title">{fact.heading}</h3>
                <p className="mt-3 text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">{fact.body}</p>
              </div>
            ))}
          </div>
          <Link to="/trust" className="text-link mt-10">
            {HOME.facts.link} <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>

      {/* H04 */}
      <section className="border-t border-rule py-14 sm:py-20 lg:py-24">
        <div className="site-container">
          <h2 className="text-section-title max-w-lg">{HOME.future.heading}</h2>
          <p className="text-lead mt-4 max-w-xl text-[var(--color-ash)]">{HOME.future.intro}</p>
          <ul className="mt-10 divide-y divide-[var(--color-rule)] border-y border-rule">
            {FUTURE_PRODUCTS.map((product) => (
              <li
                key={product.name}
                className="flex flex-wrap items-center justify-between gap-4 py-5"
              >
                <div>
                  <p className="font-semibold">{product.name}</p>
                  <p className="text-helper mt-0.5">{product.description}</p>
                </div>
                <span className="status-pill">{product.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* H05 */}
      <section data-surface="dark" className="py-16 sm:py-24">
        <div className="site-container text-center">
          <h2 className="text-section-title mx-auto max-w-xl">
            {isLaunch ? HOME.closing.headline : HOME.closing.prelaunchHeadline}
          </h2>
          <p className="text-lead mx-auto mt-4 max-w-md text-[var(--color-dark-secondary)]">
            {isLaunch ? HOME.closing.body : HOME.closing.prelaunchBody}
          </p>
          <div className="mt-8 flex justify-center">
            <ProofCta prelaunchLabel="View all products" prelaunchTo="/products" variant="on-dark" />
          </div>
          <Link to="/builders" className="text-link mt-8 inline-flex">
            {HOME.closing.quietLink}
          </Link>
        </div>
      </section>
    </SiteFrame>
  );
}
