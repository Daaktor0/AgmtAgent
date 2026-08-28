import { createFileRoute, Link } from "@tanstack/react-router";
import { AI_LINE, IS_NOT, PRODUCT, PROOF, REVIEW, WHO } from "@/brand/copy";
import { Clause, Page, Prose, SiteFrame } from "@/components/site/frame";

export const Route = createFileRoute("/what")({
  component: WhatPage,
  head: () => ({ meta: [{ title: "What Agmt is — Agmt" }] }),
});

function WhatPage() {
  return (
    <SiteFrame current="/what">
      <Page>
        <header className="max-w-[var(--measure)]">
          <p className="label">What</p>
          <h1 className="mt-2 text-[2rem] leading-tight text-ink">
            What Agmt is, and what it is not
          </h1>
          <p className="mt-4 text-lg text-ink-2">{PRODUCT.what}</p>
        </header>

        <div className="mt-12 space-y-10">
          <Clause n="1" title="Proof">
            <Prose className="mt-3">
              A mechanical integrity pass. No language model. It catches artefact defects: undefined
              and unused definitions, dangling cross-references, numbering breaks, signature block
              against the parties, hidden characters, table-versus-prose number clashes. Instant. It
              does not guess, and it does not say whether a clause is “market.”
            </Prose>
            <Prose className="mt-3">{PROOF.aside}</Prose>
          </Clause>

          <Clause n="2" title="Review">
            <Prose className="mt-3">
              A planned read of named provisions against a mandate — who you act for, the stage,
              what must be protected. The output is a Key Issues List: severity, topic, clause,
              verbatim quote, why it matters for this mandate, the ask, optional proposed language,
              and a reviewer stamp. {REVIEW.survives} Not a chatbot summary. Not a memo that
              disappears.
            </Prose>
            <Prose className="mt-3">{AI_LINE}</Prose>
          </Clause>

          <Clause n="3" title="What it is not">
            <ul className="mt-4 space-y-3">
              {IS_NOT.map((line) => (
                <li key={line} className="flex max-w-[var(--measure)] gap-3">
                  <span aria-hidden className="mt-[0.15em] shrink-0 font-mono text-sm text-accent">
                    ×
                  </span>
                  <span className="text-ink-2">{line}</span>
                </li>
              ))}
            </ul>
          </Clause>

          <Clause n="4" title="Who it is for">
            <Prose className="mt-3">{WHO.is}</Prose>
            <Prose className="mt-3">{WHO.isNot}</Prose>
          </Clause>
        </div>

        <p className="mt-12 border-t border-rule pt-6 text-[0.9375rem] text-muted">
          How the two modes work is on{" "}
          <Link to="/how" className="text-accent underline underline-offset-4">
            how
          </Link>
          . Seats are on{" "}
          <Link to="/beta" className="text-accent underline underline-offset-4">
            beta
          </Link>
          .
        </p>
      </Page>
    </SiteFrame>
  );
}
