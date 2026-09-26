import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Shell } from "@/components/agmt/shell";

export const Route = createFileRoute("/proof")({
  component: ProofLayout,
});

function ProofLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
