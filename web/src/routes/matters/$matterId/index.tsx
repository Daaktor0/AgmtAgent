import { createFileRoute } from "@tanstack/react-router";
import { MatterWorkspace } from "@/components/agmt/matter-workspace";

export const Route = createFileRoute("/matters/$matterId/")({
  component: MatterRoute,
});

function MatterRoute() {
  const { matterId } = Route.useParams();
  return <MatterWorkspace matterId={matterId} />;
}
