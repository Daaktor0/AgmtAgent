import { z } from "zod";

export const PROOF_WORKER_ENVELOPE_VERSION = 1 as const;
export const MAX_PROOF_WORKER_ENVELOPE_BYTES = 2048;
export const MAX_PROOF_WORKER_ATTEMPTS = 3;

export class ProofWorkerContractError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProofWorkerContractError";
    this.code = code;
  }
}

const versionedId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);

export const ProofWorkerEnvelopeSchema = z.strictObject({
  version: z.literal(PROOF_WORKER_ENVELOPE_VERSION),
  runToken: z.string().regex(/^[a-f0-9]{32}$/),
  tenantContextRef: z.string().regex(/^tctx_[A-Za-z0-9]{16,64}$/),
  attempt: z.number().int().min(1).max(MAX_PROOF_WORKER_ATTEMPTS),
  generation: z.number().int().nonnegative().max(1_000_000),
  parserVersion: versionedId,
  ruleSetVersion: versionedId,
  exporterVersion: versionedId,
  validatorVersion: versionedId,
  computeImageId: versionedId,
});

export type ProofWorkerEnvelope = z.infer<typeof ProofWorkerEnvelopeSchema>;
export type ProofWorkerEnvelopeInput = Omit<ProofWorkerEnvelope, "version">;

function fail(code: string, message: string): never {
  throw new ProofWorkerContractError(code, message);
}

export function validateProofWorkerEnvelope(value: unknown): ProofWorkerEnvelope {
  const parsed = ProofWorkerEnvelopeSchema.safeParse(value);
  if (!parsed.success) fail("invalid_proof_worker_envelope", parsed.error.issues[0]?.message ?? "invalid_proof_worker_envelope");
  let encoded: string;
  try {
    encoded = JSON.stringify(parsed.data);
  } catch {
    fail("invalid_proof_worker_envelope", "Worker envelope cannot be serialized");
  }
  if (Buffer.byteLength(encoded, "utf8") > MAX_PROOF_WORKER_ENVELOPE_BYTES) {
    fail("proof_worker_envelope_too_large", "Worker envelope exceeds 2 KiB");
  }
  return parsed.data;
}

export function buildProofWorkerEnvelope(input: ProofWorkerEnvelopeInput): ProofWorkerEnvelope {
  return validateProofWorkerEnvelope({ version: PROOF_WORKER_ENVELOPE_VERSION, ...input });
}
