import { createFileRoute, redirect } from "@tanstack/react-router";

/** Retired in the v2 overhaul — split into /privacy and /terms. */
export const Route = createFileRoute("/legal")({
  beforeLoad: () => {
    throw redirect({ to: "/terms" });
  },
});
