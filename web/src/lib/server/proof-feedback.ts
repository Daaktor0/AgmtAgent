/**
 * Metadata-only Proof feedback (PWC-33A).
 *
 * Closed enums only. No free text, filename, snippet or finding body.
 * Feedback never extends deletion or retention.
 */
import { z } from "zod";
import { LaunchRuleIdSchema } from "../agmt/proof/contracts.ts";
import { emitProofEvent } from "./proof-events.ts";

export const PROOF_FEEDBACK_VERSION = "proof-feedback-v1";
export const PROOF_FEEDBACK_MAX_BYTES = 1024;
export const PROOF_FEEDBACK_MAX_PER_RUN = 20;
export const PROOF_FEEDBACK_MAX_PER_OWNER_UTC_DAY = 100;

export const ProofFeedbackCategorySchema = z.enum(["language", "definitions", "references", "completion"]);
export const ProofFeedbackVerdictSchema = z.enum(["useful", "noisy", "incorrect", "missed"]);
export const ProofFeedbackRequestSchema = z.strictObject({
  ruleId: LaunchRuleIdSchema,
  category: ProofFeedbackCategorySchema,
  verdict: ProofFeedbackVerdictSchema,
});
export type ProofFeedbackRequest = z.infer<typeof ProofFeedbackRequestSchema>;

export class ProofFeedbackError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "ProofFeedbackError";
    this.code = code;
    this.status = status;
  }
}

export function parseProofFeedbackBody(raw: string): ProofFeedbackRequest {
  if (raw.length > PROOF_FEEDBACK_MAX_BYTES) {
    throw new ProofFeedbackError("payload_too_large", 400, "Feedback body exceeds 1 KiB");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ProofFeedbackError("invalid_feedback", 400, "Feedback JSON is invalid");
  }
  const result = ProofFeedbackRequestSchema.safeParse(parsed);
  if (!result.success) throw new ProofFeedbackError("invalid_feedback", 400, "Feedback fields are invalid");
  return result.data;
}

export type ProofFeedbackStore = {
  countForRun(runId: string): number;
  countForOwnerUtcDay(ownerUserId: string, utcDay: string): number;
  record(input: { runId: string; ownerUserId: string; utcDay: string; request: ProofFeedbackRequest }): void;
};

export function memoryFeedbackStore(): ProofFeedbackStore {
  const runs = new Map<string, number>();
  const owners = new Map<string, number>();
  return {
    countForRun: (runId) => runs.get(runId) ?? 0,
    countForOwnerUtcDay: (owner, day) => owners.get(`${owner}:${day}`) ?? 0,
    record(input) {
      runs.set(input.runId, (runs.get(input.runId) ?? 0) + 1);
      const key = `${input.ownerUserId}:${input.utcDay}`;
      owners.set(key, (owners.get(key) ?? 0) + 1);
    },
  };
}

export function admitProofFeedback(input: {
  store: ProofFeedbackStore;
  runId: string;
  ownerUserId: string;
  runGone: boolean;
  nowMs: number;
  rawBody: string;
}): ProofFeedbackRequest {
  if (input.runGone) throw new ProofFeedbackError("gone", 410, "This run is no longer available");
  const request = parseProofFeedbackBody(input.rawBody);
  const utcDay = new Date(input.nowMs).toISOString().slice(0, 10);
  if (input.store.countForRun(input.runId) >= PROOF_FEEDBACK_MAX_PER_RUN) {
    throw new ProofFeedbackError("quota_exceeded", 429, "Feedback for this run is capped");
  }
  if (input.store.countForOwnerUtcDay(input.ownerUserId, utcDay) >= PROOF_FEEDBACK_MAX_PER_OWNER_UTC_DAY) {
    throw new ProofFeedbackError("quota_exceeded", 429, "Today’s feedback limit is reached");
  }
  input.store.record({ runId: input.runId, ownerUserId: input.ownerUserId, utcDay, request });
  emitProofEvent({
    version: "proof-event-v1",
    name: "rule_outcome",
    token: "a1b2c3d4e5f60718",
    stage: "ready",
    errorCode: null,
    sizeBucket: null,
    durationBucket: null,
    count: 1,
  }, () => undefined);
  return request;
}
