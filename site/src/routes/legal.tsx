import { createFileRoute } from "@tanstack/react-router";
import { LEGAL } from "@/brand/copy";
import { Page, SiteFrame } from "@/components/site/frame";
export const Route = createFileRoute("/legal")({
  component: LegalPage,
  head: () => ({ meta: [{ title: "Legal & updates — Agmt" }] }),
});
function LegalPage() {
  return (
    <SiteFrame>
      <Page>
        <p className="eyebrow">AGMT / A FEW PLAIN TERMS</p>
        <h1 className="page-title">Legal & updates.</h1>
        <div className="legal-prose">
          {LEGAL.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </Page>
    </SiteFrame>
  );
}
