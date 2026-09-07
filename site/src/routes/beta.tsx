import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Retired in the v2 overhaul — the 50-seat waitlist mechanic is gone. Proof
 * access now runs through app.agmt.legal directly.
 */
export const Route = createFileRoute("/beta")({
  beforeLoad: () => {
    throw redirect({ to: "/products/proof" });
  },
});
