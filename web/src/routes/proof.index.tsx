import { createFileRoute } from "@tanstack/react-router";
import { ProofLocalExperience } from "@/components/agmt/proof-local";

export const Route = createFileRoute("/proof/")({
  component: ProofIndex,
});

function ProofIndex() {
  return <ProofLocalExperience />;
}
