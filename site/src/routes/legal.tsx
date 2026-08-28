import { createFileRoute } from "@tanstack/react-router";
import { LEGAL } from "@/brand/copy";
import { Page, Prose, SiteFrame } from "@/components/site/frame";

export const Route = createFileRoute("/legal")({
  component: LegalPage,
  head: () => ({ meta: [{ title: "Legal — Agmt" }] }),
});

/** No turn of phrase on this page. It says what is true and stops. */
function LegalPage() {
  return (
    <SiteFrame current="/legal">
      <Page>
        <header className="max-w-[var(--measure)]">
          <p className="label">Legal</p>
          <h1 className="mt-2 text-[2rem] leading-tight text-ink">Legal</h1>
        </header>
        <div className="mt-8 space-y-4">
          {LEGAL.map((line) => (
            <Prose key={line} className="text-lg">
              {line}
            </Prose>
          ))}
        </div>
      </Page>
    </SiteFrame>
  );
}
