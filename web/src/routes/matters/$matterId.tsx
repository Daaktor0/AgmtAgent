import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/matters/$matterId")({
  component: MatterLayout,
});

function MatterLayout() {
  return <Outlet />;
}
