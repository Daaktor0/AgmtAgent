import { createFileRoute } from "@tanstack/react-router";
import { Page, SiteFrame } from "@/components/site/frame";
import { BuildersForm } from "@/components/site/builders-form";
import { BUILDERS, METADATA } from "@/brand/copy";

export const Route = createFileRoute("/builders")({
  component: BuildersPage,
  head: () => ({
    meta: [
      { title: METADATA.builders.title },
      { name: "description", content: METADATA.builders.description },
    ],
  }),
});

function BuildersPage() {
  return (
    <SiteFrame>
      <Page>
        <p className="eyebrow">{BUILDERS.eyebrow}</p>
        <h1 className="text-page-title mt-4 max-w-xl">{BUILDERS.headline}</h1>
        <p className="text-lead mt-5 max-w-lg text-[var(--color-ash)]">{BUILDERS.body}</p>

        <div className="mt-14">
          <BuildersForm />
        </div>
      </Page>
    </SiteFrame>
  );
}
