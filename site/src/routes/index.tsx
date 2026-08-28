import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  Braces,
  Check,
  Clock3,
  FileCheck2,
  Link2,
  ListChecks,
  PenLine,
  Quote,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { BETA, MAIL, PROBLEM, PRODUCT, PROOF, REVIEW } from "@/brand/copy";
import { SiteFrame } from "@/components/site/frame";
import { FlowDiagram } from "@/components/site/flow-diagram";
import { SeatForm } from "@/components/site/seat-form";
import { getPublicSeatStatus } from "@/lib/waitlist";

export const Route = createFileRoute("/")({
  loader: () => getPublicSeatStatus(),
  component: Home,
});

function Home() {
  const status = Route.useLoaderData();

  return (
    <SiteFrame>
      <section className="hero-grid relative isolate overflow-hidden bg-hero text-on-hero">
        <div className="hero-stars" aria-hidden />
        <div className="mx-auto grid min-h-[calc(100svh-4.75rem)] max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14 lg:py-24">
          <header className="relative z-10 max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="launch-badge">
                <span className="launch-pulse" aria-hidden />
                Launching soon
              </span>
              <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-on-hero-muted">
                First beta · 50 seats
              </span>
            </div>
            <p className="mt-9 label label-inverse flex items-center gap-3">
              <span className="h-px w-8 bg-accent" aria-hidden />
              {PRODUCT.eyebrow}
            </p>
            <h1 className="mt-6 max-w-[11ch] text-[3.65rem] leading-[0.92] tracking-[-0.05em] text-on-hero sm:text-[5.2rem] lg:text-[5.65rem]">
              Proofing should not take another evening<span className="text-accent">.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-on-hero-muted sm:text-xl">
              {PRODUCT.lede}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="#beta"
                className="group inline-flex min-h-12 items-center gap-2 bg-accent px-5 font-medium text-accent-ink no-underline transition-colors hover:bg-accent-hover"
              >
                Book a free beta seat
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="#problem"
                className="inline-flex min-h-12 items-center gap-2 border border-white/20 px-5 font-medium text-on-hero no-underline transition-colors hover:border-white/45 hover:bg-white/5"
              >
                See what gets missed
                <ArrowDown className="size-4" />
              </a>
            </div>
            <p className="mt-6 text-sm leading-relaxed text-on-hero-muted">{PRODUCT.scope}</p>
          </header>

          <ProblemHeroVisual />
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto grid max-w-7xl sm:grid-cols-4">
            {[
              ["01", "Drafted", "The clauses take shape."],
              ["02", "Turned", "The document moves again."],
              ["03", "Renumbered", "The references try to follow."],
              ["04", "Proofed", "The last pass still waits."],
            ].map(([n, title, body]) => (
              <div
                key={title}
                className="border-b border-white/10 px-5 py-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-6"
              >
                <span className="font-mono text-[0.65rem] text-accent">{n}</span>
                <p className="mt-1 font-serif text-xl text-on-hero">{title}</p>
                <p className="mt-1 text-sm text-on-hero-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="problem" className="scroll-mt-20 bg-paper py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div>
              <p className="label text-accent">{PROBLEM.eyebrow}</p>
              <h2 className="mt-4 max-w-[12ch] text-[2.75rem] leading-[1.01] tracking-[-0.04em] text-ink sm:text-[4.25rem]">
                {PROBLEM.heading}
              </h2>
            </div>
            <p className="max-w-2xl text-lg leading-relaxed text-ink-2">{PROBLEM.lede}</p>
          </div>

          <div className="mt-14 grid border-l border-t border-rule sm:grid-cols-2 lg:grid-cols-4">
            {PROBLEM.checks.map((item, index) => {
              const icons = [Braces, Link2, ListChecks, ScanSearch] as const;
              const Icon = icons[index];
              return (
                <article
                  key={item.label}
                  className="problem-card min-h-[18rem] border-b border-r border-rule bg-card p-6 sm:p-7"
                >
                  <div className="flex items-center justify-between">
                    <Icon className="size-5 text-accent" strokeWidth={1.6} aria-hidden />
                    <span className="font-mono text-[0.65rem] text-faint">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <p className="mt-12 label">{item.label}</p>
                  <h3 className="mt-2 text-[1.65rem] leading-tight text-ink">{item.title}</h3>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{item.body}</p>
                </article>
              );
            })}
          </div>

          <div className="mt-12 grid overflow-hidden border border-rule bg-paper-sunk lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-6 sm:p-9">
              <p className="label text-accent">The manual sweep</p>
              <blockquote className="mt-5 max-w-2xl font-serif text-[2rem] leading-[1.15] text-ink sm:text-[2.6rem]">
                “Read it once for the deal. Read it again for everything the deal edits broke.”
              </blockquote>
              <p className="mt-5 max-w-xl text-ink-2">
                Proofing is not spellcheck. It is a separate, concentrated pass over the internal
                logic of the document.
              </p>
            </div>
            <ProofingLedger />
          </div>
        </div>
      </section>

      <section id="proof" className="scroll-mt-20 border-y border-rule bg-card py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="label text-accent">{PROOF.label} · {PROOF.price}</p>
            <h2 className="mt-4 max-w-[13ch] text-[2.75rem] leading-[1.01] tracking-[-0.035em] text-ink sm:text-[4rem]">
              {PROOF.heading}
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">{PROOF.lede}</p>
            <ul className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {PROOF.does.map((item) => (
                <li key={item} className="flex gap-3 text-[0.9375rem] text-ink-2">
                  <Check className="mt-1 size-4 shrink-0 text-accent" strokeWidth={2} aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 max-w-xl border-l-2 border-accent pl-4 text-[0.9375rem] text-muted">
              {PROOF.aside}
            </p>
          </div>
          <ProofSpecimen />
        </div>
      </section>

      <section id="review" className="scroll-mt-20 bg-hero py-20 text-on-hero sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div>
              <p className="label label-inverse">{REVIEW.label}</p>
              <h2 className="mt-4 max-w-[13ch] text-[2.75rem] leading-[1.01] tracking-[-0.035em] text-on-hero sm:text-[4rem]">
                {REVIEW.heading}
              </h2>
            </div>
            <p className="max-w-2xl text-lg leading-relaxed text-on-hero-muted">{REVIEW.lede}</p>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden border border-white/10 bg-white/10 lg:grid-cols-3">
            <ReviewColumn
              n="01"
              icon={Quote}
              title="See the wording."
              body="The exact document language sits beside the issue, so the review starts from evidence."
            />
            <ReviewColumn
              n="02"
              icon={ListChecks}
              title="Understand the ask."
              body="Why it matters for this mandate, what needs to change and who reviewed it."
            />
            <ReviewColumn
              n="03"
              icon={PenLine}
              title="Make the call."
              body="Accept, edit, reject or park. Eligible accepted edits can move into tracked changes."
            />
          </div>

          <div className="mt-10 grid gap-6 border-t border-white/10 pt-9 md:grid-cols-[1fr_auto] md:items-start">
            <div>
              <p className="label label-inverse">{MAIL.label}</p>
              <h3 className="mt-3 text-3xl text-on-hero">{MAIL.heading}</h3>
              <p className="mt-3 max-w-2xl text-on-hero-muted">{MAIL.lede}</p>
            </div>
            <span className="inline-flex items-center gap-2 border border-white/15 px-4 py-3 font-mono text-xs uppercase tracking-[0.12em] text-on-hero-muted">
              <FileCheck2 className="size-4 text-accent" aria-hidden />
              Matter → redline → draft
            </span>
          </div>
        </div>
      </section>

      <section className="bg-paper-sunk py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="label text-accent">One working trail</p>
              <h2 className="mt-4 text-[2.6rem] leading-[1.02] text-ink sm:text-[3.75rem]">
                The check is the start, not another loose file.
              </h2>
            </div>
            <p className="max-w-2xl text-lg leading-relaxed text-ink-2">{PRODUCT.matter}</p>
          </div>
          <FlowDiagram />
        </div>
      </section>

      <section id="beta" className="scroll-mt-20 bg-paper py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="label text-accent">First beta</p>
            <h2 className="mt-4 max-w-[11ch] text-[2.8rem] leading-[1.01] tracking-[-0.04em] text-ink sm:text-[4.25rem]">
              {BETA.headline}
            </h2>
            <p className="mt-6 font-serif text-2xl text-accent">{BETA.capacity}</p>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-2">{BETA.body}</p>
            <div className="mt-8 flex items-start gap-3 border-t border-rule pt-6">
              <Sparkles className="mt-1 size-4 shrink-0 text-accent" aria-hidden />
              <p className="max-w-lg text-sm leading-relaxed text-muted">
                No product access is open yet. We will contact the first cohort before the beta begins.
              </p>
            </div>
          </div>
          <SeatForm status={status} />
        </div>
      </section>
    </SiteFrame>
  );
}

function ProblemHeroVisual() {
  return (
    <figure className="problem-visual relative mx-auto w-full max-w-[48rem] lg:mx-0">
      <div className="theme-orb" aria-hidden />
      <div className="relative overflow-hidden border border-white/15 bg-hero-2 shadow-[0_38px_100px_rgba(0,0,0,0.48)]">
        <img
          src="/agmt-proofing-desk.webp"
          alt="Stacks of agreement pages connected by red proofing marks from daylight into night"
          width="1440"
          height="960"
          fetchPriority="high"
          className="aspect-[3/2] w-full object-cover"
        />
        <div className="problem-visual-shade" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 p-4 sm:p-6">
          {["Undefined term", "Broken § 8.3", "Blank [●]", "Figure mismatch"].map((label) => (
            <span key={label} className="finding-tag">
              {label}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 flex items-center justify-between gap-4 text-xs text-on-hero-muted">
        <span>The final pass, made visible.</span>
        <span className="font-mono uppercase tracking-[0.12em]">Day → night</span>
      </figcaption>
    </figure>
  );
}

function ProofingLedger() {
  return (
    <div className="border-t border-rule bg-card p-6 sm:p-8 lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between gap-4 border-b border-rule pb-4">
        <span className="label">What the last pass holds</span>
        <Clock3 className="size-5 text-accent" strokeWidth={1.5} aria-hidden />
      </div>
      <div className="mt-5 space-y-1">
        {[
          ["Definitions", "Used · unused · duplicated · drifted"],
          ["References", "Clause · schedule · annexure · limb"],
          ["Sequences", "Numbering · lists · provisos · blanks"],
          ["Details", "Parties · dates · amounts · percentages"],
          ["Execution", "Signatories · blocks · counterparts"],
        ].map(([title, detail], index) => (
          <div key={title} className="grid grid-cols-[2rem_1fr] gap-3 border-b border-rule py-3 last:border-b-0">
            <span className="font-mono text-xs text-faint">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <p className="text-sm font-medium text-ink">{title}</p>
              <p className="mt-0.5 text-xs text-muted">{detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProofSpecimen() {
  return (
    <figure className="proof-specimen relative mx-auto w-full max-w-[42rem]">
      <div className="proof-page proof-page-back" aria-hidden />
      <div className="proof-page relative border border-rule bg-paper p-6 shadow-2xl shadow-ink/10 sm:p-9">
        <div className="flex items-center justify-between border-b border-rule pb-4">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">
              Agreement · final sweep
            </p>
            <p className="mt-1 font-serif text-2xl text-ink">Mechanical proof</p>
          </div>
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
            <ScanSearch className="size-5" aria-hidden />
          </span>
        </div>
        <div className="mt-7 space-y-5">
          <Finding line="4.2" title="Defined term not found" text="“Effective Date” is used here but no matching definition appears." />
          <Finding line="8.3" title="Cross-reference does not resolve" text="The cited clause moved during renumbering." />
          <Finding line="12.1" title="Words and figures disagree" text="The written amount and numeral do not match." />
        </div>
        <div className="mt-7 flex items-center gap-3 border-t border-rule pt-5 text-sm text-muted">
          <FileCheck2 className="size-4 text-accent" aria-hidden />
          Exact location. Plain explanation. Nothing hidden behind a score.
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-faint">
        An illustrative proofing specimen, not a product screen.
      </figcaption>
    </figure>
  );
}

function Finding({ line, title, text }: { line: string; title: string; text: string }) {
  return (
    <div className="grid grid-cols-[3rem_1fr] gap-4">
      <span className="font-mono text-xs text-accent">§ {line}</span>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
      </div>
    </div>
  );
}

function ReviewColumn({
  n,
  icon: Icon,
  title,
  body,
}: {
  n: string;
  icon: typeof Quote;
  title: string;
  body: string;
}) {
  return (
    <article className="bg-hero-2 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <Icon className="size-5 text-accent" strokeWidth={1.5} aria-hidden />
        <span className="font-mono text-xs text-on-hero-muted">{n}</span>
      </div>
      <h3 className="mt-14 text-3xl text-on-hero">{title}</h3>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-on-hero-muted">{body}</p>
    </article>
  );
}
