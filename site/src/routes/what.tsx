import { createFileRoute, Link } from "@tanstack/react-router";
import { MAIL, PRODUCT, PROOF, REVIEW, WHO } from "@/brand/copy";
import { Clause, Page, Prose, SiteFrame } from "@/components/site/frame";

export const Route = createFileRoute("/what")({
  component: WhatPage,
  head: () => ({ meta: [{ title: "What Agmt solves — Agmt" }] }),
});

function WhatPage() {
  return (
    <SiteFrame current="/what">
      <Page>
        <header className="max-w-[var(--measure)]">
          <p className="label text-accent">What Agmt solves</p>
          <h1 className="mt-4 text-[2.8rem] leading-[1.02] text-ink sm:text-[4rem]">
            The final proof is careful work done under the worst clock.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-2">
            Every document turn can disturb definitions, references, numbering, blanks, figures
            and execution details. Agmt makes that mechanical pass available free, before the
            lawyer spends time on the legal call.
          </p>
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

          <Clause n="3" title="The working trail">
            <Prose className="mt-3">{PRODUCT.matter}</Prose>
            <Prose className="mt-3">{MAIL.lede}</Prose>
          </Clause>

          <Clause n="4" title="Built first for">
            <Prose className="mt-3">{WHO.is}</Prose>
            <Prose className="mt-3">{WHO.isNot}</Prose>
          </Clause>
        </div>

        <p className="mt-12 border-t border-rule pt-6 text-[0.9375rem] text-muted">
          Agmt is launching soon.{" "}
          <Link to="/beta" className="text-accent underline underline-offset-4">
            Book a beta seat or set a reminder
          </Link>
          .
        </p>
      </Page>
    </SiteFrame>
  );
}
