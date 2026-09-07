import { createFileRoute } from "@tanstack/react-router";
import { Page, SiteFrame } from "@/components/site/frame";
import { LEGAL_PAGES } from "@/brand/copy";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({ meta: [{ title: LEGAL_PAGES.terms.navTitle }] }),
});

function TermsPage() {
  return (
    <SiteFrame>
      <Page>
        <h1 className="text-page-title max-w-xl">{LEGAL_PAGES.terms.heading}</h1>
        <div className="reading-measure mt-8 border-t border-rule pt-8">
          <p className="text-lead">{LEGAL_PAGES.pendingHeading}</p>
          <p className="mt-4 text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
            {LEGAL_PAGES.terms.pendingBody}
          </p>
          <p className="mt-4 text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
            {LEGAL_PAGES.pendingNote}
          </p>
        </div>
      </Page>
    </SiteFrame>
  );
}
