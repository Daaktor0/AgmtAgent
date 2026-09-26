export const PROOF_WORKER_FORBIDDEN_ID_PARTS = [
  "proof-antivirus",
  "proof-service",
  "runtime-env.server",
  "better-auth",
  "node:fs",
  "node:net",
  "node:child_process",
] as const;

export function normalizeModuleId(id: string): string {
  return id.replaceAll("\\", "/");
}

export function isProofWorkerImporter(importer: string | undefined, graph: Set<string>): boolean {
  if (!importer) return false;
  const norm = normalizeModuleId(importer);
  if (norm.includes("proof.worker") || norm.includes("/src/lib/proof-local/")) return true;
  return graph.has(norm);
}

export function rememberProofWorkerModule(id: string, graph: Set<string>): string {
  const norm = normalizeModuleId(id);
  graph.add(norm);
  return norm;
}

export function isForbiddenProofWorkerImport(id: string): boolean {
  return PROOF_WORKER_FORBIDDEN_ID_PARTS.some((part) => id.includes(part));
}
