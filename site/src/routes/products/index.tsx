import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Page, SiteFrame } from "@/components/site/frame";
import { ProofCta } from "@/components/site/state-cta";
import { PRODUCTS_INDEX, FUTURE_PRODUCTS, PROOF_STATE, METADATA } from "@/brand/copy";

const isLaunch = PROOF_STATE === "launch";

export const Route = createFileRoute("/products/")({
  component: ProductsIndex,
  head: () => ({
    meta: [
      { title: METADATA.products.title },
      { name: "description", content: METADATA.products.description },
    ],
  }),
});

function ProductsIndex() {
  const available = PRODUCTS_INDEX.available;
  return (
    <SiteFrame>
      <Page>
        {/* P01 */}
        <p className="eyebrow">{PRODUCTS_INDEX.eyebrow}</p>
        <h1 className="text-page-title mt-4 max-w-2xl">{PRODUCTS_INDEX.headline}</h1>
        <p className="text-lead mt-5 max-w-xl text-[var(--color-ash)]">{PRODUCTS_INDEX.body}</p>

        {/* P02 */}
        <div className="specimen mt-14 p-7 sm:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-semibold">{available.name}</p>
            <span className="status-pill status-pill-citron">
              {isLaunch ? available.status : available.prelaunchStatus}
            </span>
          </div>
          <h2 className="text-product-title mt-4 max-w-lg">{available.headline}</h2>
          <p className="mt-4 max-w-lg text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
            {available.body}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-4">
            <ProofCta prelaunchLabel={available.secondaryLink} prelaunchTo="/products/proof" />
            {isLaunch ? (
              <Link to="/products/proof" className="text-link">
                {available.secondaryLink} <ArrowRight size={16} aria-hidden />
              </Link>
            ) : null}
          </div>
          <p className="text-helper mt-4">{available.helper}</p>
        </div>

        {/* P03 */}
        <h2 className="text-section-title mt-20">{PRODUCTS_INDEX.plannedHeading}</h2>
        <ul className="mt-8 divide-y divide-[var(--color-rule)] border-y border-rule">
          {FUTURE_PRODUCTS.map((product) => (
            <li key={product.name} className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div>
                <p className="font-semibold">{product.name}</p>
                <p className="text-helper mt-0.5">{product.description}</p>
              </div>
              <span className="status-pill">{product.status}</span>
            </li>
          ))}
        </ul>

        <Link to="/trust" className="text-link mt-10">
          How Proof handles your document <ArrowRight size={16} aria-hidden />
        </Link>
      </Page>
    </SiteFrame>
  );
}
