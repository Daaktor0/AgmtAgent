/**
 * Isolated Proof compute contract (PWC-23 local).
 *
 * The web Worker must not load the ZIP tree. This module is the in-process
 * engine/validator boundary for unit tests. Live Container execution is
 * Blocked on D-01 provisioning.
 */
import { createHash } from "node:crypto";
import { exportProofDocx } from "../agmt/export/docx.ts";

export const PROOF_COMPUTE_VERSION = "proof-compute-v1";
export const PROOF_COMPUTE_MAX_OUTPUT_BYTES = 35 * 1024 * 1024;

export type ProofComputeReceipt = {
  version: typeof PROOF_COMPUTE_VERSION;
  sourceSha256: string;
  outputSha256: string;
  outputBytes: number;
  correctionCount: number;
  commentCount: number;
  noticeCount: number;
  coverage: "complete" | "limited";
};

export class ProofComputeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProofComputeError";
    this.code = code;
  }
}

export async function runLocalProofCompute(source: Uint8Array, expectedSha256: string): Promise<{ output: Uint8Array; receipt: ProofComputeReceipt }> {
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  if (sourceSha256 !== expectedSha256) throw new ProofComputeError("source_hash_mismatch", "Compute source hash does not match the reserved object");
  const exported = await exportProofDocx(Buffer.from(source));
  if (exported.bytes.byteLength > PROOF_COMPUTE_MAX_OUTPUT_BYTES) {
    throw new ProofComputeError("output_too_large", "Compute output exceeds 35 MiB");
  }
  const outputSha256 = createHash("sha256").update(exported.bytes).digest("hex");
  const receipt: ProofComputeReceipt = {
    version: PROOF_COMPUTE_VERSION,
    sourceSha256,
    outputSha256,
    outputBytes: exported.bytes.byteLength,
    correctionCount: exported.receipt.plan.findings.filter((finding) => finding.kind === "correction").length,
    commentCount: exported.receipt.commentIds.length,
    noticeCount: exported.receipt.plan.notices.length,
    coverage: exported.analysis.coverage === "limited" || exported.receipt.plan.notices.length ? "limited" : "complete",
  };
  return { output: exported.bytes, receipt };
}
