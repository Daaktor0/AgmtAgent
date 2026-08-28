import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { APP_URL, PRODUCT } from "@/brand/copy";
import { Page, SiteFrame } from "@/components/site/frame";

export const Route = createFileRoute("/beta")({
  component: BetaPage,
  head: () => ({ meta: [{ title: "Open Agmt — Agmt" }] }),
});

function BetaPage() {
  return (
    <SiteFrame current="/beta">
      <Page>
        <header className="max-w-3xl">
          <p className="label text-accent">Open Agmt</p>
          <h1 className="mt-4 text-[2.8rem] leading-[1.02] text-ink sm:text-[4rem]">
            Take the next document into Agmt.
          </h1>
          <p className="mt-6 max-w-[var(--measure)] text-lg leading-relaxed text-ink-2">
            Sign in with Google or a single-use email link. Create a Matter, upload a native DOCX and run Proof.
          </p>
          <a
            href={APP_URL}
            className="group mt-8 inline-flex min-h-12 items-center gap-2 bg-accent px-5 font-medium text-accent-ink no-underline transition-colors hover:bg-accent-hover"
          >
            Open Agmt
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </a>
          <p className="mt-7 max-w-[var(--measure)] text-sm leading-relaxed text-muted">
            {PRODUCT.scope}
          </p>
        </header>
      </Page>
    </SiteFrame>
  );
}
