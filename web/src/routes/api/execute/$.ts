import { createFileRoute } from "@tanstack/react-router";
import { handleExecuteApi } from "@/lib/execute/server";

export const Route = createFileRoute("/api/execute/$")({
  server: { handlers: { POST: ({ request }) => handleExecuteApi(request), GET: ({ request }) => handleExecuteApi(request) } },
});
