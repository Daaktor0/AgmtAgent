import type { ZipLimitSet } from "../agmt/zip-safety.ts";
import {
  PROOF_LOCAL_POLICY_DESKTOP,
  PROOF_LOCAL_POLICY_VERSION,
  publishedProofCapacityPolicy,
  type ProofCapacityPolicy,
} from "./policy.ts";

/**
 * Browser resource ceilings. Published numbers come from the selected
 * capacity policy (`proof-local-limits-v3`). Desktop source ceiling is the
 * measured 100 MiB image-heavy class; 150 MiB is a Chromium-tested stretch
 * for the same family, not the UI cap. Dense prose still hits the 1e6
 * extracted-code-point gate. XML complexity is a separate admit gate.
 */
export const PROOF_LOCAL_LIMITS_VERSION = PROOF_LOCAL_POLICY_VERSION;

export function proofLocalLimitsFromPolicy(policy: ProofCapacityPolicy = publishedProofCapacityPolicy()): {
  maxSourceBytes: number;
  maxOutputBytes: number;
  maxProcessingMs: number;
  zip: ZipLimitSet;
  label: string;
} {
  return {
    maxSourceBytes: policy.maxSourceBytes,
    maxOutputBytes: policy.maxOutputBytes,
    maxProcessingMs: policy.maxProcessingMs,
    zip: policy.zip,
    label: policy.label,
  };
}

const published = proofLocalLimitsFromPolicy(PROOF_LOCAL_POLICY_DESKTOP);

export const PROOF_LOCAL_MAX_SOURCE_BYTES = published.maxSourceBytes;
export const PROOF_LOCAL_MAX_OUTPUT_BYTES = published.maxOutputBytes;
export const PROOF_LOCAL_MAX_PROCESSING_MS = published.maxProcessingMs;
export const PROOF_LOCAL_ZIP_LIMITS: ZipLimitSet = published.zip;
export const PROOF_LOCAL_SIZE_LABEL = published.label;

export function proofLocalSizeLabel(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)} MiB`;
  if (bytes % 1024 === 0) return `${bytes / 1024} KiB`;
  return `${bytes} bytes`;
}
