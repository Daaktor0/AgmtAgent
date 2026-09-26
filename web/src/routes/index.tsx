import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/agmt/shell";
import { ExecuteApp } from "@/components/execute/execute-app";
import { InviteOnly } from "@/components/execute/feedback";
import { getExecuteAccess } from "@/lib/execute/access.fn";
import { EXECUTE_CSP_META } from "@/lib/execute/csp";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { invite?: string } =>
    typeof search.invite === "string" ? { invite: search.invite } : {},
  loader: () => getExecuteAccess(),
  component: Home,
  head: () => ({
    meta: [
      { title: "Executed copies — Agmt" },
      {
        name: "description",
        content:
          "Assemble executed copies of multi-party agreements on your own computer: signature pages out, countersigned pages and stamp papers in, one complete copy per party.",
      },
      // Documents are opened here: only Agmt's own code may run, and it may
      // only talk to Agmt. The Worker sends the same policy as a header.
      { httpEquiv: "Content-Security-Policy", content: EXECUTE_CSP_META },
    ],
  }),
});

function Home() {
  const access = Route.useLoaderData();
  const { invite } = Route.useSearch();
  return <Shell>{access.allowed ? <ExecuteApp /> : <InviteOnly reason={invite ?? null} />}</Shell>;
}
