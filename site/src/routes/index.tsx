import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  FileText,
  Flag,
  FolderOpen,
  ListChecks,
  Search,
  X,
} from "lucide-react";
import { PRODUCT, PROOF, REVIEW, BETA } from "@/brand/copy";
import { Aside, SiteFrame } from "@/components/site/frame";
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
      <section className="hero-grid relative isolate overflow-hidden bg-ink text-paper">
        <div className="mx-auto grid min-h-[calc(100svh-4.75rem)] max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.88fr_1.12fr] lg:gap-10 lg:py-24">
          <header className="relative z-10 max-w-2xl">
            <p className="label label-inverse flex items-center gap-3">
              <span className="h-px w-8 bg-accent" aria-hidden />
              {PRODUCT.eyebrow}
            </p>
            <h1 className="mt-7 text-[3.55rem] leading-[0.94] tracking-[-0.045em] text-paper sm:text-[5rem] lg:text-[5.4rem]">
              Proof the artefact.
              <span className="mt-1 block text-paper/72">
                Review the deal<span className="text-accent">.</span>
              </span>
            </h1>
            <p className="mt-8 text-xl font-medium text-paper sm:text-2xl">{PRODUCT.heading}</p>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-paper/65">{PRODUCT.lede}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="#beta"
                className="group inline-flex min-h-12 items-center gap-2 bg-accent px-5 font-medium text-accent-ink no-underline transition-colors hover:bg-accent-hover"
              >
                {seatsOpen ? "Join the beta" : "Join the waitlist"}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="#product"
                className="inline-flex min-h-12 items-center border border-paper/25 px-5 font-medium text-paper no-underline transition-colors hover:border-paper/55 hover:bg-paper/5"
              >
                See the product
              </a>
            </div>
            <p className="mt-7 max-w-xl text-sm leading-relaxed text-paper/45">{PRODUCT.scope}</p>
          </header>

          <ProductPreview />
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-9 gap-y-3 px-5 py-5 sm:px-8">
            <span className="label label-inverse">Proof scope</span>
            {["SHA", "SSA", "SPA", "Disclosure letters"].map((item) => (
              <span key={item} className="font-mono text-xs uppercase tracking-[0.12em] text-paper/52">
                {item}
              </span>
            ))}
            <span className="ml-auto hidden text-sm text-paper/38 md:block">Native DOCX at launch</span>
          </div>
        </div>
      </section>

      <section id="product" className="scroll-mt-20 bg-paper py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <div>
              <p className="label text-accent">The product</p>
              <h2 className="mt-4 text-[2.65rem] leading-[1.02] tracking-[-0.035em] text-ink sm:text-[4rem]">
                One Matter.
                <span className="block text-muted">The whole working trail.</span>
              </h2>
            </div>
            <p className="max-w-2xl text-lg leading-relaxed text-ink-2 lg:pb-1">{PRODUCT.matter}</p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-12">
            <article className="bento-card overflow-hidden bg-ink p-6 text-paper sm:p-8 lg:col-span-7">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="label label-inverse">Matter</p>
                  <h3 className="mt-3 text-3xl text-paper">Project Banyan</h3>
                </div>
                <span className="border border-white/15 px-3 py-1 font-mono text-[0.6875rem] uppercase tracking-wider text-paper/55">
                  Company · Signing
                </span>
              </div>
              <div className="mt-8 space-y-2">
                <DocumentRow name="Shareholders’ Agreement" meta="SHA · Primary · v3" status="Proof complete" />
                <DocumentRow name="Share Subscription Agreement" meta="SSA · Related" status="Ready" />
                <DocumentRow name="Disclosure Letter" meta="Disclosure letter · Related" status="Ready" />
              </div>
            </article>

            <article className="bento-card bg-card p-6 sm:p-8 lg:col-span-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="label text-accent">Before the run</p>
                  <h3 className="mt-3 text-2xl text-ink">Confirm the map.</h3>
                </div>
                <Search className="size-7 text-accent" strokeWidth={1.5} aria-hidden />
              </div>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
                Review legal-name mappings and identifier candidates before Agmt builds the working projection.
              </p>
              <div className="mt-6 space-y-2 font-mono text-xs">
                <MapRow from="Banyan Technologies Private Limited" to="Company" />
                <MapRow from="Northstar Ventures III" to="Investor" />
                <MapRow from="ABCDE1234F" to="[PAN_1]" />
              </div>
            </article>

            <FeatureCard
              icon={Search}
              label="Proof results"
              title="See the defect and its source."
              body="Every hit points back to the document. Partial checks stay visible instead of passing quietly."
            />
            <FeatureCard
              icon={ListChecks}
              label="Key Issues List"
              title="Turn findings into decisions."
              body="Accept, edit, reject or park each row. Shareable remains a separate, deliberate choice."
            />
            <FeatureCard
              icon={Download}
              label="Downloads"
              title="Take the work back to Word."
              body="Export the list or download eligible accepted edits in a tracked-change DOCX."
            />
          </div>
        </div>
      </section>

      <section id="workflow" className="scroll-mt-20 border-y border-rule bg-paper-sunk py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
            <div>
              <p className="label text-accent">The workflow</p>
              <h2 className="mt-4 text-[2.5rem] leading-[1.03] text-ink sm:text-[3.5rem]">
                From upload to a redline you control.
              </h2>
            </div>
            <p className="max-w-2xl text-lg leading-relaxed text-ink-2">
              Agmt keeps the document, the evidence and your disposition connected. You can see what happened before you take any output forward.
            </p>
          </div>
          <FlowDiagram />
        </div>
      </section>

      <section id="modes" className="scroll-mt-20 bg-ink py-20 text-paper sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-3xl">
            <p className="label label-inverse">Two modes, one Matter</p>
            <h2 className="mt-4 text-[2.7rem] leading-[1.02] text-paper sm:text-[4.25rem]">
              Start with the artefact. Move to the legal call.
            </h2>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <ModeCard mode={PROOF} number="01" tone="paper" />
            <ModeCard mode={REVIEW} number="02" tone="accent" />
          </div>
        </div>
      </section>

      <section className="bg-card py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="label text-accent">The output boundary</p>
            <h2 className="mt-4 text-[2.6rem] leading-[1.03] text-ink sm:text-[3.75rem]">
              Agmt does not become your document editor.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
              Work the list in the browser. Download the accepted edits. Open the tracked-change file in Word. The signed paper remains your call.
            </p>
          </div>
          <div className="redline-sheet relative overflow-hidden border border-rule bg-paper p-6 shadow-2xl shadow-ink/10 sm:p-9">
            <div className="flex items-center justify-between border-b border-rule pb-4">
              <div className="flex items-center gap-3">
                <FileText className="size-5 text-accent" aria-hidden />
                <span className="font-mono text-xs text-muted">SHA_Project_Banyan_redline.docx</span>
              </div>
              <span className="label text-accent">Tracked changes</span>
            </div>
            <div className="mt-7 space-y-6 font-serif text-[1.0625rem] leading-[1.8] text-ink-2">
              <p>
                The Company shall obtain the prior written consent of the Investor before undertaking any Reserved Matter.
              </p>
              <p>
                The quorum for a meeting of the Board shall include{" "}
                <span className="rounded-sm bg-accent-soft px-1 text-accent line-through decoration-1">one</span>{" "}
                <span className="border-b-2 border-accent bg-accent-soft/60 px-1 text-accent">the Investor Director</span>{" "}
                for so long as the Investor holds the agreed threshold.
              </p>
              <p className="text-muted">
                Only accepted rows with current evidence and valid anchors enter this file.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="beta" className="scroll-mt-20 border-t border-rule bg-paper py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="label text-accent">Private beta</p>
            <h2 className="mt-4 text-[2.7rem] leading-[1.02] text-ink sm:text-[4rem]">
              Put Agmt on your next deal pack.
            </h2>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-2">{PRODUCT.seats}</p>
            <div className="mt-6">
              <Aside>{BETA.aside}</Aside>
            </div>
            <div className="mt-8 flex items-center gap-3 text-sm text-muted">
              <span className="inline-flex size-9 items-center justify-center rounded-full border border-rule bg-card font-mono text-xs text-accent">
                {counts.openRemaining}
              </span>
              open first-come seats remaining
            </div>
          </div>
          <SeatForm counts={counts} />
        </div>
      </section>
    </SiteFrame>
  );
}

function ProductPreview() {
  return (
    <div
      className="product-stage relative mx-auto w-full max-w-[46rem] lg:mx-0"
      role="img"
      aria-label="Illustrative Agmt Matter and Key Issues interface"
    >
      <div className="paper-layer paper-layer-back" aria-hidden />
      <div className="paper-layer paper-layer-mid" aria-hidden />
      <div className="relative z-10 overflow-hidden border border-white/15 bg-card text-ink shadow-[0_35px_90px_rgba(0,0,0,0.5)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule px-5 py-5 sm:px-7">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">Sample matter</p>
            <p className="mt-1 font-serif text-[1.9rem] leading-tight">Project Banyan</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PreviewChip icon={FolderOpen}>Company</PreviewChip>
            <PreviewChip icon={FileText}>SHA</PreviewChip>
            <PreviewChip icon={Flag}>Signing</PreviewChip>
          </div>
        </div>
        <div className="flex items-center gap-7 border-b border-rule px-5 sm:px-7">
          <span className="border-b-2 border-transparent py-4 text-sm text-muted">Proof</span>
          <span className="border-b-2 border-accent py-4 text-sm font-medium text-ink">Review</span>
          <span className="ml-auto font-mono text-[0.65rem] uppercase tracking-wider text-muted">Key Issues</span>
        </div>
        <div className="p-4 sm:p-6">
          <div className="border border-rule bg-paper">
            <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3">
              <span className="inline-flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-accent">
                <Flag className="size-3" fill="currentColor" /> High
              </span>
              <span className="h-3 w-px bg-rule" aria-hidden />
              <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted">Clause 12.3</span>
              <span className="ml-auto font-mono text-[0.65rem] uppercase tracking-wider text-muted">Reserved matters</span>
            </div>
            <div className="grid sm:grid-cols-[1fr_12rem]">
              <div className="p-4 sm:border-r sm:border-rule">
                <p className="font-serif text-[1.03rem] leading-relaxed text-ink">
                  “The Company shall not undertake any Reserved Matter without the prior written consent of the Investor.”
                </p>
                <div className="mt-4 grid gap-3 text-xs leading-relaxed sm:grid-cols-2">
                  <div>
                    <p className="font-mono uppercase tracking-wider text-faint">Why it matters</p>
                    <p className="mt-1 text-muted">The consent threshold differs from Schedule 4.</p>
                  </div>
                  <div>
                    <p className="font-mono uppercase tracking-wider text-faint">The ask</p>
                    <p className="mt-1 text-muted">Align the threshold before signing.</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-px border-t border-rule bg-rule p-px sm:grid-cols-1 sm:border-t-0">
                <PreviewAction icon={Check} label="Accept" active />
                <PreviewAction icon={ChevronRight} label="Park" />
                <PreviewAction icon={X} label="Reject" />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4 border border-dashed border-rule-strong px-4 py-3 text-xs text-muted">
            <span>Reviewer stamp · Confirmed</span>
            <span className="font-mono uppercase tracking-wider text-accent">Evidence current</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewChip({
  icon: Icon,
  children,
}: {
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-rule bg-paper px-2.5 py-1.5 text-xs text-ink-2">
      <Icon className="size-3" aria-hidden />
      {children}
    </span>
  );
}

function PreviewAction({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof Check;
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={
        active
          ? "inline-flex min-h-12 items-center justify-center gap-2 bg-ink px-3 text-xs text-paper"
          : "inline-flex min-h-12 items-center justify-center gap-2 bg-card px-3 text-xs text-muted"
      }
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

function DocumentRow({ name, meta, status }: { name: string; meta: string; status: string }) {
  return (
    <div className="group flex items-center gap-4 border border-white/12 bg-white/[0.035] px-4 py-3.5">
      <span className="inline-flex size-9 shrink-0 items-center justify-center border border-white/15 text-paper/70">
        <FileText className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-paper">{name}</p>
        <p className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-paper/38">{meta}</p>
      </div>
      <span className="hidden text-xs text-paper/50 sm:block">{status}</span>
      <ChevronRight className="size-4 text-paper/25 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </div>
  );
}

function MapRow({ from, to }: { from: string; to: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 border border-rule bg-paper px-3 py-2.5">
      <span className="truncate text-muted">{from}</span>
      <span className="inline-flex items-center gap-2 text-accent">
        <ArrowRight className="size-3" aria-hidden /> {to}
      </span>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  label,
  title,
  body,
}: {
  icon: typeof Search;
  label: string;
  title: string;
  body: string;
}) {
  return (
    <article className="bento-card bg-card p-6 sm:p-7 lg:col-span-4">
      <div className="flex items-center justify-between gap-4">
        <p className="label text-accent">{label}</p>
        <Icon className="size-5 text-accent" strokeWidth={1.5} aria-hidden />
      </div>
      <h3 className="mt-7 text-2xl leading-tight text-ink">{title}</h3>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{body}</p>
    </article>
  );
}

function ModeCard({
  mode,
  number,
  tone,
}: {
  mode: typeof PROOF | typeof REVIEW;
  number: string;
  tone: "paper" | "accent";
}) {
  const accent = tone === "accent";
  return (
    <article className={accent ? "bg-accent p-6 text-accent-ink sm:p-9" : "bg-paper p-6 text-ink sm:p-9"}>
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className={accent ? "label text-accent-ink/65" : "label text-accent"}>{mode.price}</p>
          <h3 className="mt-3 text-[2.4rem] leading-none">{mode.label}</h3>
        </div>
        <span className={accent ? "font-mono text-xs text-accent-ink/55" : "font-mono text-xs text-muted"}>
          {number}
        </span>
      </div>
      <h4 className="mt-9 max-w-lg font-serif text-[1.75rem] leading-tight">{mode.heading}</h4>
      <p className={accent ? "mt-4 max-w-xl text-accent-ink/78" : "mt-4 max-w-xl text-ink-2"}>{mode.lede}</p>
      <ul className={accent ? "mt-7 border-t border-accent-ink/20" : "mt-7 border-t border-rule"}>
        {mode.does.map((item) => (
          <li
            key={item}
            className={
              accent
                ? "flex gap-3 border-b border-accent-ink/20 py-3 text-sm text-accent-ink/88"
                : "flex gap-3 border-b border-rule py-3 text-sm text-ink-2"
            }
          >
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
      <p className={accent ? "mt-6 text-sm text-accent-ink/65" : "mt-6 text-sm text-muted"}>{mode.aside}</p>
    </article>
  );
}
