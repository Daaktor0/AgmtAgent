import { createFileRoute, Link } from "@tanstack/react-router";
import { brand } from "@/brand/tokens";
import { PRODUCT, PROOF, REVIEW, BETA } from "@/brand/copy";
import { Wordmark } from "@/brand/wordmark";
import { Aside, Page, Prose, SiteFrame } from "@/components/site/frame";
import { FlowDiagram } from "@/components/site/flow-diagram";
import { SeatForm } from "@/components/site/seat-form";
import { getSeatCounts } from "@/lib/waitlist";

export const Route = createFileRoute("/")({
  loader: () => getSeatCounts(),
  component: Home,
});

function Home() {
  const counts = Route.useLoaderData();
  const seatsOpen = counts.openRemaining > 0;

  return (
    <SiteFrame>
      <Page>
        {/* Masthead. The wordmark carries the page; there is no hero to build. */}
        <header className="max-w-[42rem]">
          <Wordmark size="lg" asLink={false} />
          <h1 className="mt-6 text-[2rem] leading-[1.15] text-ink sm:text-[2.5rem]">
            {brand.tagline}
          </h1>
          <p className="mt-4 text-lg text-ink-2">
            {PRODUCT.what} {PRODUCT.modes}
          </p>
          <p className="mt-5 text-[0.9375rem] text-muted">
            Built for the 1 a.m. SHA. Not for the all-of-legal keynote.
          </p>
        </header>

        {/* The two modes. Each column says what it does and what it will not do —
            the refusal is set as its own block, because it is half the product. */}
        <div className="mt-14 grid gap-px border-y border-rule bg-rule sm:grid-cols-2">
          <Mode
            label={PROOF.label}
            price={PROOF.price}
            heading={PROOF.heading}
            lede={PROOF.lede}
            doesTitle="It catches"
            does={PROOF.does}
            refusesTitle={PROOF.refusesTitle}
            refuses={PROOF.refuses}
            aside={PROOF.aside}
          />
          <Mode
            label={REVIEW.label}
            price={REVIEW.price}
            heading={REVIEW.heading}
            lede={REVIEW.lede}
            doesTitle="Every entry carries"
            does={REVIEW.does}
            extra={REVIEW.survives}
            refusesTitle={REVIEW.refusesTitle}
            refuses={REVIEW.refuses}
            aside={REVIEW.aside}
          />
        </div>

        <section className="mt-14">
          <h2 className="text-[1.375rem] text-ink">The path a pack takes</h2>
          <FlowDiagram />
        </section>

        <section className="mt-16 border-t border-rule pt-10">
          <p className="label">Beta</p>
          <h2 className="mt-2 text-[1.75rem] leading-snug text-ink">
            {seatsOpen ? "Hold a beta seat" : "Join the waitlist"}
          </h2>
          <Prose className="mt-3">{PRODUCT.seats}</Prose>
          <div className="mt-4">
            <Aside>{BETA.aside}</Aside>
          </div>
          <div className="mt-8 max-w-2xl">
            <SeatForm counts={counts} />
          </div>
          <p className="mt-6 text-[0.9375rem] text-muted">
            The rule in full is on{" "}
            <Link to="/beta" className="text-accent underline underline-offset-4">
              the beta page
            </Link>
            . What Agmt is not is on{" "}
            <Link to="/what" className="text-accent underline underline-offset-4">
              what
            </Link>
            .
          </p>
        </section>
      </Page>
    </SiteFrame>
  );
}

function Mode({
  label,
  price,
  heading,
  lede,
  doesTitle,
  does,
  extra,
  refusesTitle,
  refuses,
  aside,
}: {
  label: string;
  price: string;
  heading: string;
  lede: string;
  doesTitle: string;
  does: readonly string[];
  extra?: string;
  refusesTitle: string;
  refuses: readonly string[];
  aside: string;
}) {
  return (
    <article className="flex flex-col bg-paper px-5 py-7 sm:px-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-accent">{label}</h2>
        <span className="label">{price}</span>
      </div>
      <p className="mt-3 font-serif text-[1.375rem] leading-snug text-ink">{heading}</p>
      <p className="mt-2 text-ink-2">{lede}</p>

      <p className="label mt-6">{doesTitle}</p>
      <ul className="mt-2 space-y-1 text-ink-2">
        {does.map((d) => (
          <li key={d} className="flex gap-2.5">
            <span aria-hidden className="mt-[0.6em] h-px w-2.5 shrink-0 bg-rule-strong" />
            <span>{d}</span>
          </li>
        ))}
      </ul>
      {extra ? <p className="mt-4 text-ink-2">{extra}</p> : null}

      <p className="label mt-6">{refusesTitle}</p>
      <ul className="mt-2 space-y-1 text-ink-2">
        {refuses.map((r) => (
          <li key={r} className="flex gap-2.5">
            <span aria-hidden className="mt-[0.15em] shrink-0 font-mono text-sm text-accent">
              ×
            </span>
            <span>{r}</span>
          </li>
        ))}
      </ul>

      <p className="mt-auto pt-6 text-[0.9375rem] text-muted">{aside}</p>
    </article>
  );
}
