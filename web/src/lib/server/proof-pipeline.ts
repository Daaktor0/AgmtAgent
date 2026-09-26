/**
 * Live Proof scan → queue → process → publish path (PWC-22–25).
 *
 * scanning → processing remains illegal. A missing antivirus never yields a
 * ready document. Publication requires a settled HEAD receipt.
 */
import { createHash } from "node:crypto";
import type { ProductRunRow } from "./product-runs.ts";
import { assertProductRunTransition } from "./product-runs.ts";
import { scanProofDocx } from "./proof-scan.ts";
import { mayAdvanceAfterScan } from "./proof-scan-receipt.ts";
import { runLocalProofCompute } from "./proof-compute.ts";
import { admitPublication, type ProofTransfer } from "./proof-transfer.ts";
import type { ProofObjectStore } from "./proof-objects.ts";
import { assertProofQueueTransition } from "./proof-queue.ts";
import type { ProofAntivirus } from "./proof-antivirus.ts";
import { deletionOutcome, maySetDeletionVerifiedAt } from "./proof-delete.ts";

export const PROOF_PIPELINE_VERSION = "proof-pipeline-v1";

export class ProofPipelineError extends Error {
  readonly code: string;
  readonly rejected: boolean;
  constructor(code: string, message: string, rejected = false) {
    super(message);
    this.name = "ProofPipelineError";
    this.code = code;
    this.rejected = rejected;
  }
}

export type ProofPipelineDeps = {
  now: () => number;
  objects: ProofObjectStore;
  transfer: ProofTransfer;
  antivirus: ProofAntivirus;
  transition: (run: ProductRunRow, to: ProductRunRow["status"]) => Promise<ProductRunRow>;
  recordScan: (run: ProductRunRow, receipt: unknown) => Promise<void>;
  publish: (run: ProductRunRow, input: {
    outputArtifactId: string;
    correctionCount: number;
    commentCount: number;
    noticeCount: number;
    coverageStatus: "complete" | "limited";
  }) => Promise<ProductRunRow>;
  fail: (run: ProductRunRow, code: string, rejected: boolean) => Promise<ProductRunRow>;
};

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function loadSettledSource(
  transfer: ProofTransfer,
  objects: ProofObjectStore,
  run: ProductRunRow,
): Promise<Uint8Array> {
  const writers = await transfer.listWriters(run.runId);
  const source = writers.find((writer) => writer.kind === "source" && writer.writeStatus === "settled");
  if (!source) throw new ProofPipelineError("source_missing", "Settled source object is missing", false);
  const bytes = await objects.get({ key: source.key, expectedSha256: source.expectedSha256, expectedSize: source.expectedSize });
  if (!bytes) throw new ProofPipelineError("source_missing", "Settled source object is missing", false);
  return bytes;
}

export async function executeProofPipeline(run: ProductRunRow, deps: ProofPipelineDeps): Promise<ProductRunRow> {
  let current = run;
  try {
    if (current.status === "scanning") {
      const source = await loadSettledSource(deps.transfer, deps.objects, current);
      try {
        await scanProofDocx(Buffer.from(source));
      } catch (error) {
        const code = error instanceof Error ? error.message.slice(0, 64) : "invalid_docx_zip";
        throw new ProofPipelineError(code, "Structural package scan rejected the file", true);
      }
      const receipt = await deps.antivirus.scan({
        bytes: source,
        sourceSha256: current.sourceSha256 ?? sha256Hex(source),
        byteSize: source.byteLength,
        now: deps.now(),
      });
      await deps.recordScan(current, receipt);
      if (receipt.status === "infected") throw new ProofPipelineError("malware_detected", "Antivirus detected a threat", true);
      if (!mayAdvanceAfterScan(receipt)) {
        throw new ProofPipelineError(receipt.status === "scanner_unavailable" ? "scanner_unavailable" : "scan_failed", "Antivirus did not return a clean receipt", false);
      }
      assertProofQueueTransition("scanning", "queued");
      current = await deps.transition(current, "queued");
    }

    if (current.status === "queued") {
      assertProofQueueTransition("queued", "processing");
      current = await deps.transition(current, "processing");
    }

    if (current.status === "processing") {
      const source = await loadSettledSource(deps.transfer, deps.objects, current);
      const computed = await runLocalProofCompute(source, current.sourceSha256 ?? sha256Hex(source));
      const written = await deps.transfer.putObject({
        runId: current.runId,
        tenantId: current.tenantId,
        ownerUserId: current.ownerUserId,
        generation: current.cancellationGeneration,
        attempt: Math.max(1, current.attemptCount),
        kind: "marked_docx",
        bytes: computed.output,
        deadlineMs: current.deadlines.retentionDeadline,
      });
      if (written.status !== "settled" || !written.receipt) {
        throw new ProofPipelineError("publication_uncertain", "Output write did not settle", false);
      }
      const head = await deps.objects.head({ key: written.key });
      const admitted = admitPublication({
        writer: {
          artifactId: written.artifactId,
          runId: current.runId,
          tenantId: current.tenantId,
          ownerUserId: current.ownerUserId,
          generation: current.cancellationGeneration,
          attempt: Math.max(1, current.attemptCount),
          kind: "marked_docx",
          key: written.key,
          writeStatus: "settled",
          expectedSha256: computed.receipt.outputSha256,
          expectedSize: computed.receipt.outputBytes,
          deadlineMs: current.deadlines.retentionDeadline,
          uploadId: null,
          settledReceipt: written.receipt,
        },
        head,
      });
      if (!admitted.admitted) throw new ProofPipelineError(admitted.code, "Output publication was refused", false);
      assertProductRunTransition("processing", "exporting");
      current = await deps.transition(current, "exporting");
      current = await deps.publish(current, {
        outputArtifactId: written.artifactId,
        correctionCount: computed.receipt.correctionCount,
        commentCount: computed.receipt.commentCount,
        noticeCount: computed.receipt.noticeCount,
        coverageStatus: computed.receipt.coverage,
      });
    }
    return current;
  } catch (error) {
    if (error instanceof ProofPipelineError) return deps.fail(current, error.code, error.rejected);
    const code = error instanceof Error ? error.message.slice(0, 64) : "proof_failed";
    return deps.fail(current, code, false);
  }
}

export async function executeProofDeletion(input: {
  run: ProductRunRow;
  transfer: ProofTransfer;
  objects: ProofObjectStore;
  markDeleted: (run: ProductRunRow, verified: boolean) => Promise<ProductRunRow>;
}): Promise<ProductRunRow> {
  await input.transfer.cancel({
    runId: input.run.runId,
    tenantId: input.run.tenantId,
    ownerUserId: input.run.ownerUserId,
  });
  const writers = await input.transfer.listWriters(input.run.runId);
  const inspections = [];
  for (const writer of writers) {
    try {
      await input.objects.delete({ key: writer.key });
    } catch {
      /* HEAD below records remaining presence */
    }
    inspections.push(await input.objects.inspect({ key: writer.key }));
  }
  const outcome = deletionOutcome({
    runStatus: "deleting",
    writers: writers.map((writer) => ({ status: writer.writeStatus })),
    inspections,
  });
  return input.markDeleted(input.run, maySetDeletionVerifiedAt(outcome));
}
