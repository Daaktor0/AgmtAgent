/**
 * Reconcile Proof transfers (PWC-18).
 *
 * Publication and deletion are separate authorities:
 * - checksum/size mismatch never publishes;
 * - an object owned through a server-reserved proof/v2 key remains
 *   deletable even if incomplete, corrupt or mismatched;
 * - missing HEAD cannot prove deletion while writes remain possible;
 * - uncertain ownership or provider state stays unresolved.
 */
import type { ProofObjectStore } from "./proof-objects.ts";
import { admitPublication, ownedReservedKey, type TransferLedger, type WriterRecord } from "./proof-transfer.ts";

export const PROOF_RECONCILIATION_VERSION = "proof-reconciliation-v1" as const;

export type WriterReconciliation = {
  artifactId: string;
  key: string;
  status: "deleted" | "absent" | "unresolved";
  code: string;
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

function fenced(status: string | undefined): boolean {
  return status === "deleting" || status === "deleted";
}

export async function reconcileUncertainWriter(input: {
  objects: ProofObjectStore;
  ledger: TransferLedger;
  writer: WriterRecord;
}): Promise<WriterReconciliation> {
  const key = input.writer.key;
  if (!ownedReservedKey(input.writer, key)) {
    return { artifactId: input.writer.artifactId, key, status: "unresolved", code: "ownership_uncertain" };
  }

  const run = await input.ledger.loadRun(input.writer.runId);
  const writers = await input.ledger.listWriters(input.writer.runId);
  const writing = writers.some((writer) => writer.writeStatus === "writing");
  const closed = fenced(run?.status);

  let inspected;
  try {
    inspected = await input.objects.inspect({ key });
  } catch (headError) {
    return { artifactId: input.writer.artifactId, key, status: "unresolved", code: "provider_uncertain", headError };
  }
  if (inspected.presence === "unknown") {
    return { artifactId: input.writer.artifactId, key, status: "unresolved", code: "provider_uncertain", headError: inspected.error };
  }

  if (inspected.presence === "absent") {
    if (!closed || writing) {
      return { artifactId: input.writer.artifactId, key, status: "unresolved", code: "writes_still_possible" };
    }
    await input.ledger.clearWriter(input.writer.artifactId);
    return { artifactId: input.writer.artifactId, key, status: "absent", code: "absent" };
  }

  if (!closed) {
    const publication = admitPublication({ writer: { ...input.writer, writeStatus: "settled" }, head: inspected.receipt });
    const code = inspected.presence === "corrupt" || publication.code === "integrity_mismatch"
      ? "integrity_mismatch"
      : "not_fenced";
    return { artifactId: input.writer.artifactId, key, status: "unresolved", code };
  }

  try {
    await input.objects.delete({ key });
  } catch (deleteError) {
    return { artifactId: input.writer.artifactId, key, status: "unresolved", code: "provider_uncertain", deleteError };
  }
  const gone = await input.objects.inspect({ key });
  if (gone.presence !== "absent") {
    return { artifactId: input.writer.artifactId, key, status: "unresolved", code: "delete_unverified" };
  }
  await input.ledger.clearWriter(input.writer.artifactId);
  return { artifactId: input.writer.artifactId, key, status: "deleted", code: "deleted" };
}

export async function reconcileRunWriters(input: {
  objects: ProofObjectStore;
  ledger: TransferLedger;
  runId: string;
}): Promise<WriterReconciliation[]> {
  const run = await input.ledger.loadRun(input.runId);
  const deleting = fenced(run?.status);
  const writers = await input.ledger.listWriters(input.runId);
  const results: WriterReconciliation[] = [];
  for (const writer of writers) {
    if (!deleting && writer.writeStatus === "settled") continue;
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
  const run = await input.ledger.loadRun(input.runId);
  if (!fenced(run?.status)) return null;
  const writers = await input.ledger.listWriters(input.runId);
  const active = writers.filter((writer) => writer.writeStatus === "writing" || writer.writeStatus === "uncertain");
  if (active.length) return null;
  for (const writer of writers) {
    if (!ownedReservedKey(writer, writer.key)) return null;
    const inspected = await input.objects.inspect({ key: writer.key });
    if (inspected.presence !== "absent") return null;
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
