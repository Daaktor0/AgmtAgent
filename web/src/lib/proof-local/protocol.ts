import type { ProofLanguage, ProofProfile } from "../products/capabilities.ts";
import type { LocalProofResult, LocalProofStage } from "./pipeline.ts";

export type ProofWorkerRequest =
  | {
    type: "process";
    id: string;
    bytes: ArrayBuffer;
    profile: ProofProfile;
    language: ProofLanguage;
  }
  | { type: "cancel"; id: string };

export type ProofWorkerResponse =
  | { type: "progress"; id: string; stage: LocalProofStage }
  | {
    type: "done";
    id: string;
    output: ArrayBuffer;
    summary: Omit<LocalProofResult, "output">;
  }
  | { type: "error"; id: string; code: string }
  | { type: "cancelled"; id: string };
