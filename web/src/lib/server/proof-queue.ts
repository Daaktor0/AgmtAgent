/**
 * Outbox/lease Proof queue contract (PWC-24 local).
 *
 * scanning → processing remains illegal. Recovered queued runs are rescanned.
 * Live Cloudflare Queues are not provisioned here.
 */
import { canTransitionProductRun } from "./product-runs.ts";
import type { RunStatus } from "../products/contracts.ts";

export const PROOF_QUEUE_ENVELOPE_VERSION = 1 as const;
export const PROOF_QUEUE_HEARTBEAT_MS = 15_000;
export const PROOF_QUEUE_MAX_ATTEMPTS = 3;

export type ProofQueueEnvelope = {
  version: typeof PROOF_QUEUE_ENVELOPE_VERSION;
  runId: string;
  generation: number;
  attempt: number;
  stage: "scan" | "process";
};

export class ProofQueueError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProofQueueError";
    this.code = code;
  }
}

export function assertProofQueueTransition(from: RunStatus, to: RunStatus): void {
  if (from === "scanning" && to === "processing") {
    throw new ProofQueueError("illegal_shortcut", "scanning cannot skip queued");
  }
  if (!canTransitionProductRun(from, to)) {
    throw new ProofQueueError("invalid_state_transition", `${from} -> ${to}`);
  }
}

export function nextQueueStage(status: RunStatus): "scan" | "process" | null {
  if (status === "scanning") return "scan";
  if (status === "queued") return "process";
  return null;
}

export function acknowledgeDuplicate(input: { currentStatus: RunStatus; envelopeGeneration: number; runGeneration: number }): "ack" | "ignore" {
  if (input.envelopeGeneration !== input.runGeneration) return "ignore";
  if (["ready", "rejected", "failed", "deleting", "deleted"].includes(input.currentStatus)) return "ack";
  return "ignore";
}

export function parseProofQueueEnvelope(value: unknown): ProofQueueEnvelope {
  if (!value || typeof value !== "object") throw new ProofQueueError("invalid_envelope", "envelope must be an object");
  const record = value as Record<string, unknown>;
  if (record.version !== PROOF_QUEUE_ENVELOPE_VERSION) throw new ProofQueueError("invalid_envelope", "version");
  if (typeof record.runId !== "string" || typeof record.generation !== "number" || typeof record.attempt !== "number") {
    throw new ProofQueueError("invalid_envelope", "fields");
  }
  if (record.stage !== "scan" && record.stage !== "process") throw new ProofQueueError("invalid_envelope", "stage");
  if ("filename" in record || "tenantId" in record || "findings" in record) {
    throw new ProofQueueError("invalid_envelope", "content fields are forbidden");
  }
  if (record.attempt > PROOF_QUEUE_MAX_ATTEMPTS) throw new ProofQueueError("attempts_exhausted", "max attempts");
  return {
    version: PROOF_QUEUE_ENVELOPE_VERSION,
    runId: record.runId,
    generation: record.generation,
    attempt: record.attempt,
    stage: record.stage,
  };
}
