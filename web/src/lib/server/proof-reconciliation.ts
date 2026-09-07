/**
 * Reconcile uncertain Proof transfers (PWC-18).
 *
 * Discover reserved keys and prefixes. Never treat a timeout as a successful
 * abort. A no-writer receipt is issued only after every writing/uncertain
 * record is gone and provider HEAD/list are empty for those keys.
 */
import type { ProofObjectStore } from "./proof-objects.ts";
import { parseProofObjectKey } from "./proof-objects.ts";
import type { TransferLedger, WriterRecord } from "./proof-transfer.ts";

export const PROOF_RECONCILIATION_VERSION = "proof-reconciliation-v1" as const;

export type WriterReconciliation = {
  artifactId: string;
  key: string;
  status: "deleted" | "absent" | "unresolved";
  headError?: unknown;
  deleteError?: unknown;
};

export type NoWriterReceipt = {
  version: typeof PROOF_RECONCILIATION_VERSION;
  runId: string;
  generation: number;
  writerCount: number;
  uncertainCount: number;
  verifiedAt: number;
};

export async function reconcileUncertainWriter(input: {
  objects: ProofObjectStore;
  ledger: TransferLedger;
  writer: WriterRecord;
}): Promise<WriterReconciliation> {
  const key = input.writer.key;
  parseProofObjectKey(key);
  let head;
  try {
    head = await input.objects.head({ key });
  } catch (headError) {
    return { artifactId: input.writer.artifactId, key, status: "unresolved", headError };
  }
  if (!head) {
    await input.ledger.clearWriter(input.writer.artifactId);
    return { artifactId: input.writer.artifactId, key, status: "absent" };
  }
  if (head.sha256 !== input.writer.expectedSha256 || head.byteSize !== input.writer.expectedSize) {
    return { artifactId: input.writer.artifactId, key, status: "unresolved" };
  }
  try {
    await input.objects.delete({ key });
  } catch (deleteError) {
    return { artifactId: input.writer.artifactId, key, status: "unresolved", deleteError };
  }
  const gone = await input.objects.head({ key });
  if (gone) return { artifactId: input.writer.artifactId, key, status: "unresolved" };
  await input.ledger.clearWriter(input.writer.artifactId);
  return { artifactId: input.writer.artifactId, key, status: "deleted" };
}

export async function reconcileRunWriters(input: {
  objects: ProofObjectStore;
  ledger: TransferLedger;
  runId: string;
}): Promise<WriterReconciliation[]> {
  const writers = await input.ledger.listWriters(input.runId);
  const results: WriterReconciliation[] = [];
  for (const writer of writers) {
    if (writer.writeStatus === "settled") continue;
    results.push(await reconcileUncertainWriter({ objects: input.objects, ledger: input.ledger, writer }));
  }
  return results;
}

export async function noWriterReceipt(input: {
  objects: ProofObjectStore;
  ledger: TransferLedger;
  runId: string;
  generation: number;
  nowMs?: number;
}): Promise<NoWriterReceipt | null> {
  const writers = await input.ledger.listWriters(input.runId);
  const active = writers.filter((writer) => writer.writeStatus === "writing" || writer.writeStatus === "uncertain");
  if (active.length) return null;
  for (const writer of writers) {
    if (writer.writeStatus === "reserved") {
      const head = await input.objects.head({ key: writer.key });
      if (head) return null;
    }
  }
  return {
    version: PROOF_RECONCILIATION_VERSION,
    runId: input.runId,
    generation: input.generation,
    writerCount: writers.length,
    uncertainCount: 0,
    verifiedAt: input.nowMs ?? Date.now(),
  };
}
