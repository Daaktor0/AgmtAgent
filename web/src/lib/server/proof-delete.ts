/**
 * Resumable Proof deletion (PWC-26 local algorithm).
 *
 * deletionVerifiedAt requires drained writers and provider absence. A missing
 * live R2 HEAD while writers remain open cannot prove deletion.
 */
import type { ProofObjectInspect } from "./proof-objects.ts";

export const PROOF_DELETE_VERSION = "proof-delete-v1";

export type ProofDeleteWriter = { status: "reserved" | "writing" | "settled" | "uncertain" };
export type ProofDeleteOutcome = "pending" | "verified" | "uncertain";

export function deletionOutcome(input: {
  runStatus: "deleting" | "deleted";
  writers: readonly ProofDeleteWriter[];
  inspections: readonly ProofObjectInspect[];
}): ProofDeleteOutcome {
  if (input.writers.some((writer) => writer.status === "writing" || writer.status === "uncertain")) {
    return "uncertain";
  }
  if (input.inspections.some((item) => item.presence === "unknown" || item.presence === "present" || item.presence === "corrupt")) {
    return input.inspections.some((item) => item.presence === "unknown") ? "uncertain" : "pending";
  }
  if (input.inspections.every((item) => item.presence === "absent") && input.writers.every((writer) => writer.status === "reserved" || writer.status === "settled") && input.runStatus === "deleting") {
    return "verified";
  }
  return "pending";
}

export function maySetDeletionVerifiedAt(outcome: ProofDeleteOutcome): boolean {
  return outcome === "verified";
}
