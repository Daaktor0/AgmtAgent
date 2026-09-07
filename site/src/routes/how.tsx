import { createFileRoute, redirect } from "@tanstack/react-router";

/** Retired in the v2 overhaul — Proof now has its own page. */
export const Route = createFileRoute("/how")({
  beforeLoad: () => {
    throw redirect({ to: "/products/proof" });
  },
});
