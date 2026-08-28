import { createFileRoute, Link } from "@tanstack/react-router";
import { HOW } from "@/brand/copy";
import { Clause, Page, Prose, SiteFrame } from "@/components/site/frame";
import { FlowDiagram } from "@/components/site/flow-diagram";

export const Route = createFileRoute("/how")({
  component: HowPage,
  head: () => ({ meta: [{ title: "How it works — Agmt" }] }),
});

function HowPage() {
  return (
    <SiteFrame current="/how">
      <Page>
        <header className="max-w-[var(--measure)]">
          <p className="label">How</p>
          <h1 className="mt-2 text-[2rem] leading-tight text-ink">How it works</h1>
          <p className="mt-4 text-lg text-ink-2">
            Five rules the product is built to keep. They are the reason it refuses as often as it
            reports.
          </p>
        </header>

        <div className="mt-12 space-y-10">
          {HOW.map((item, i) => (
            <Clause key={item.heading} n={String(i + 1)} title={item.heading}>
              <Prose className="mt-3">{item.body}</Prose>
            </Clause>
          ))}
        </div>

        <section className="mt-14 border-t border-rule pt-8">
          <h2 className="text-[1.375rem] text-ink">The path a pack takes</h2>
          <FlowDiagram />
        </section>

        <p className="mt-12 border-t border-rule pt-6 text-[0.9375rem] text-muted">
          Neither mode is available yet.{" "}
          <Link to="/beta" className="text-accent underline underline-offset-4">
            Beta seats
          </Link>{" "}
          are how you see it first.
        </p>
      </Page>
    </SiteFrame>
  );
}
