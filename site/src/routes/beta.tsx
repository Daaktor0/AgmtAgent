import { createFileRoute } from "@tanstack/react-router";
import { BETA } from "@/brand/copy";
import { SEAT_OPEN, SEAT_RESERVED, SEAT_TOTAL } from "@/brand/tokens";
import { Aside, Page, Prose, SiteFrame } from "@/components/site/frame";
import { SeatForm } from "@/components/site/seat-form";
import { getSeatCounts } from "@/lib/waitlist";

export const Route = createFileRoute("/beta")({
  loader: () => getSeatCounts(),
  component: BetaPage,
  head: () => ({ meta: [{ title: "Beta seats — Agmt" }] }),
});

function BetaPage() {
  const counts = Route.useLoaderData();

  return (
    <SiteFrame current="/beta">
      <Page>
        <header className="max-w-[var(--measure)]">
          <p className="label">Beta</p>
          <h1 className="mt-2 text-[2rem] leading-tight text-ink">
            {SEAT_TOTAL} seats, split {SEAT_OPEN} and {SEAT_RESERVED}
          </h1>
          <div className="mt-5 space-y-3">
            {BETA.rule.map((line) => (
              <Prose key={line} className="text-lg">
                {line}
              </Prose>
            ))}
          </div>
          <div className="mt-5">
            <Aside>{BETA.aside}</Aside>
          </div>
        </header>

        <div className="mt-10 max-w-2xl">
          <SeatForm counts={counts} />
        </div>

        <p className="mt-8 max-w-[var(--measure)] text-[0.9375rem] text-muted">
          A reminder is not a seat, and the site will not tell you otherwise. If the {SEAT_OPEN} are
          gone, the form puts you on the waitlist and says so; the {SEAT_RESERVED} reserved seats
          stay closed until they are allotted by hand.
        </p>
      </Page>
    </SiteFrame>
  );
}
