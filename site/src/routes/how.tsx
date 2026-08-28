import { createFileRoute, Link } from "@tanstack/react-router";
import { HOW } from "@/brand/copy";
import { Clause, Page, Prose, SiteFrame } from "@/components/site/frame";
import { FlowDiagram } from "@/components/site/flow-diagram";

export const Route = createFileRoute("/how")({
  component: HowPage,
  head: () => ({ meta: [{ title: "How Agmt works — Agmt" }] }),
});

function HowPage() {
  return (
    <SiteFrame current="/how">
      <Page>
        <header className="max-w-[var(--measure)]">
          <p className="label text-accent">How</p>
          <h1 className="mt-4 text-[2.8rem] leading-[1.02] text-ink sm:text-[4rem]">
            From a Matter to a working redline.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-2">
            The document, its evidence and your decisions stay connected throughout the workflow.
          </p>
        </header>

        <div className="mt-14 space-y-11">
          {HOW.map((item, index) => (
            <Clause key={item.heading} n={String(index + 1)} title={item.heading}>
              <Prose className="mt-3">{item.body}</Prose>
            </Clause>
          ))}
        </div>

        <section className="mt-16 border-t border-rule pt-9">
          <h2 className="text-[1.5rem] text-ink">The short version</h2>
          <FlowDiagram />
        </section>

        <p className="mt-12 border-t border-rule pt-6 text-[0.9375rem] text-muted">
          Agmt is entering private beta.{" "}
          <Link to="/beta" className="text-accent underline underline-offset-4">
            Request a seat
          </Link>
          .
        </p>
      </Page>
    </SiteFrame>
  );
}
