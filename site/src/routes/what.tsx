import { createFileRoute, Link } from "@tanstack/react-router";
import { IS_NOT, PRODUCT, PROOF, REVIEW, WHO } from "@/brand/copy";
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
          <p className="label text-accent">What</p>
          <h1 className="mt-4 text-[2.8rem] leading-[1.02] text-ink sm:text-[4rem]">
            A working surface for the deal pack.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-2">{PRODUCT.matter}</p>
        </header>

        <div className="mt-14 space-y-11">
          <Clause n="1" title="Proof">
            <Prose className="mt-3">{PROOF.lede}</Prose>
            <ul className="mt-5 space-y-2">
              {PROOF.does.map((item) => (
                <li key={item} className="flex gap-3 text-ink-2">
                  <span aria-hidden className="mt-[0.7em] size-1.5 shrink-0 bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
            <Prose className="mt-4">{PROOF.aside}</Prose>
          </Clause>

          <Clause n="2" title="Review">
            <Prose className="mt-3">{REVIEW.lede}</Prose>
            <ul className="mt-5 space-y-2">
              {REVIEW.does.map((item) => (
                <li key={item} className="flex gap-3 text-ink-2">
                  <span aria-hidden className="mt-[0.7em] size-1.5 shrink-0 bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
            <Prose className="mt-4">{REVIEW.survives}</Prose>
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
          See the complete{" "}
          <Link to="/how" className="text-accent underline underline-offset-4">
            workflow
          </Link>{" "}
          or{" "}
          <Link to="/beta" className="text-accent underline underline-offset-4">
            join the beta
          </Link>
          .
        </p>
      </Page>
    </SiteFrame>
  );
}
