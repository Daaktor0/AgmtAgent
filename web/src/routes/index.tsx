import { createFileRoute } from "@tanstack/react-router";
import { ExecuteApp } from "@/components/execute/execute-app";
import { ExecuteShell } from "@/components/execute/execute-shell";
import { InviteOnly } from "@/components/execute/feedback";
import { getExecuteAccess } from "@/lib/execute/access.fn";
import { EXECUTE_CSP_META } from "@/lib/execute/csp";

const DESCRIPTION =
  "An executed copy for every party to a multi-party agreement, assembled on your computer. Signature pages out, signed pages and stamp papers in.";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { invite?: string } =>
    typeof search.invite === "string" ? { invite: search.invite } : {},
  loader: () => getExecuteAccess(),
  component: Home,
  head: () => ({
    meta: [
      { title: "Execute by Agmt" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Execute by Agmt" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: "https://app.agmt.legal/og-execute.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      // Documents are opened here: only Agmt's own code may run, and it may
      // only talk to Agmt. The Worker sends the same policy as a header.
      { httpEquiv: "Content-Security-Policy", content: EXECUTE_CSP_META },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon-execute.svg" },
      { rel: "apple-touch-icon", href: "/brand/execute-180.png" },
    ],
  }),
});

function Home() {
  const access = Route.useLoaderData();
  const { invite } = Route.useSearch();
  return <ExecuteShell>{access.allowed ? <ExecuteApp /> : <InviteOnly reason={invite ?? null} />}</ExecuteShell>;
}
