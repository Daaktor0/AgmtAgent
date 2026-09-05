import { createFileRoute } from "@tanstack/react-router";
import { SiteFrame } from "@/components/site/frame";
import { DispatchForm } from "@/components/site/dispatch-form";
import { DISPATCH } from "@/brand/copy";
export const Route = createFileRoute("/beta")({
  component: DispatchPage,
  head: () => ({
    meta: [
      { title: "Agmt Dispatch — Follow the build" },
      { name: "description", content: DISPATCH.body },
    ],
  }),
});
function DispatchPage() {
  return (
    <SiteFrame>
      <section className="dispatch-section dispatch-page site-container">
        <div className="dispatch-copy">
          <p className="eyebrow">{DISPATCH.name}</p>
          <h1 className="page-title">
            Be here for
            <br />
            <em>what comes next.</em>
          </h1>
          <p>{DISPATCH.body}</p>
          <div className="dispatch-detail">
            <span aria-hidden>↗</span>
            <p>New tools. Beta openings. The next chapter of Agmt.</p>
          </div>
          <p className="small-note">
            Already requested a beta place? Your request stays on the list. Dispatch does not change
            your booking.
          </p>
        </div>
        <DispatchForm />
      </section>
    </SiteFrame>
  );
}
