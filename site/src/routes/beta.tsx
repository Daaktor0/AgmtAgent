import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, CircleDot, FileCheck2 } from "lucide-react";
import { BETA, PRODUCT } from "@/brand/copy";
import { Page, SiteFrame } from "@/components/site/frame";
import { SeatForm } from "@/components/site/seat-form";
import { getPublicSeatStatus } from "@/lib/waitlist";

export const Route = createFileRoute("/beta")({
  loader: () => getPublicSeatStatus(),
  component: BetaPage,
  head: () => ({ meta: [{ title: "Agmt beta — launching soon" }] }),
});

function BetaPage() {
  const status = Route.useLoaderData();

  return (
    <SiteFrame current="/beta">
      <Page className="max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <header className="lg:sticky lg:top-28">
            <span className="launch-badge launch-badge-light">
              <span className="launch-pulse" aria-hidden />
              Launching soon
            </span>
            <p className="mt-8 label text-accent">First beta</p>
            <h1 className="mt-4 max-w-[11ch] text-[3rem] leading-[0.98] tracking-[-0.045em] text-ink sm:text-[4.5rem]">
              {BETA.headline}
            </h1>
            <p className="mt-6 font-serif text-2xl text-accent">{BETA.capacity}</p>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-2">{BETA.body}</p>

            <div className="mt-9 space-y-4 border-t border-rule pt-7">
              <BetaPoint icon={FileCheck2}>Free agreement Proof when access opens.</BetaPoint>
              <BetaPoint icon={CircleDot}>{PRODUCT.scope}</BetaPoint>
              <BetaPoint icon={Bell}>Book a seat or set a reminder. No app access yet.</BetaPoint>
            </div>
          </header>
          <SeatForm status={status} />
        </div>
      </Page>
    </SiteFrame>
  );
}

function BetaPoint({
  icon: Icon,
  children,
}: {
  icon: typeof Bell;
  children: ReactNode;
}) {
  return (
    <div className="flex max-w-lg items-start gap-3 text-sm leading-relaxed text-muted">
      <Icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
