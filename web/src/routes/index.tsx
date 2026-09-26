import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/agmt/shell";
import { AccessGate, SignOutButton } from "@/components/execute/access-gate";
import { ExecuteApp } from "@/components/execute/execute-app";
import { getExecuteAccess } from "@/lib/execute/access.fn";
import { EXECUTE_CSP_META } from "@/lib/execute/csp";

export const Route = createFileRoute("/")({
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
  const signedIn = access.mode === "invite" && access.state !== "signed_out";
  return (
    <Shell account={signedIn ? <SignOutButton className="text-[13px] text-paper underline-offset-4 hover:underline" /> : null}>
      {access.state === "allowed" ? <ExecuteApp /> : <AccessGate access={access} />}
    </Shell>
  );
}
