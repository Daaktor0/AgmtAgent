import { createFileRoute } from "@tanstack/react-router";
import { acceptInvite } from "@/lib/execute/server";

export const Route = createFileRoute("/invite/$token")({
  server: { handlers: { GET: ({ request, params }) => acceptInvite(request, params.token) } },
});
