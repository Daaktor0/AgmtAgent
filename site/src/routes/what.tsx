import { createFileRoute, redirect } from "@tanstack/react-router";

/** Retired in the v2 overhaul — the company idea now lives on the homepage. */
export const Route = createFileRoute("/what")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
