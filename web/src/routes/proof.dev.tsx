import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/agmt/shell";
import { ProofRunView } from "@/components/agmt/proof-run";
import { PROOF_UI_FIXTURES } from "@/lib/products/api-contracts";
import type { ProofLocalContext } from "@/lib/products/proof-state";

export const Route = createFileRoute("/proof/dev")({ component: ProofDevFixtures });

function localFor(state: string): ProofLocalContext {
  return {
    auth: state === "signed_out" ? "signed_out"
      : state === "unverified" || state === "verification_sent" ? "unverified"
      : state === "auth_loading" ? "loading"
      : state === "auth_unavailable" ? "unavailable"
      : "verified",
    authLoadingMs: state === "auth_unavailable" ? 20_000 : 0,
    verificationSent: state === "verification_sent",
    uploadsPaused: state === "uploads_paused",
    selected: state === "selected" ? { name: "Synthetic_Agreement.docx", size: 12_288 } : null,
    selectionError: state === "wrong_extension" ? "wrong_extension"
      : state === "too_large" ? "too_large"
      : state === "multiple_files" ? "multiple_files"
      : null,
    unknownRun: state === "unknown_run",
    quotaExceeded: state === "quota",
    connectionLost: state === "connection_lost",
    downloadStarted: state === "download_started",
    deleteConfirming: state === "delete_confirmation",
    deleteDelayed: state === "delete_delayed",
    uploading: state === "uploading" ? { sent: 4096, total: 12_288 } : null,
    developmentFixture: true,
  };
}

function ProofDevFixtures() {
  if (!import.meta.env.DEV) {
    return (
      <Shell>
        <section className="mx-auto max-w-[720px] space-y-4">
          <h1 className="font-display text-3xl">This page is only available in local development.</h1>
          <p className="text-sm"><Link to="/proof" className="underline underline-offset-4">Back to Proof</Link></p>
        </section>
      </Shell>
    );
  }
  return (
    <Shell>
      <div className="mx-auto max-w-[960px] space-y-10">
        <header className="space-y-3 border-b border-rule pb-6">
          <p className="text-sm text-stone">Development only</p>
          <h1 className="font-display text-[32px] leading-tight">Proof UI fixtures</h1>
          <p className="text-sm leading-6">
            These screens are section 9 states rendered from strict DTOs. They are not live Proof runs,
            they do not process documents, and they must not be read as production results.
          </p>
          <p className="text-sm"><Link to="/proof" className="underline underline-offset-4">Back to Proof</Link></p>
        </header>
        {PROOF_UI_FIXTURES.map((fixture) => (
          <section key={fixture.state} className="space-y-4 border border-rule p-6">
            <p className="text-xs uppercase tracking-[0.12em] text-stone">{fixture.state}</p>
            <ProofRunView
              run={fixture.run}
              local={localFor(fixture.state)}
              handlers={{}}
            />
          </section>
        ))}
      </div>
    </Shell>
  );
}
