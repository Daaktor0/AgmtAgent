import type { ProofLanguage, ProofProfile } from "../products/capabilities.ts";
import { runProofWorkerJob, type LocalProofJob, type ProofWorkerLike } from "./job.ts";
import type { LocalProofStage } from "./pipeline.ts";
import ProofWorker from "./proof.worker.ts?worker";

export type { LocalProofJob };

export function processProofInWorker(input: {
  bytes: Uint8Array;
  profile: ProofProfile;
  language: ProofLanguage;
  onStage?: (stage: LocalProofStage) => void;
}): LocalProofJob {
  return runProofWorkerJob(new ProofWorker() as ProofWorkerLike, input);
}
