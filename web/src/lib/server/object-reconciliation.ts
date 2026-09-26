export type ReconciliationStatus = "deleted" | "recorded" | "unresolved";

export type ReconciliationResult = {
  status: ReconciliationStatus;
  recordError?: unknown;
  deleteError?: unknown;
};

/**
 * Reconcile an external publication after the relational transaction failed.
 *
 * The record callback must be idempotent and must reject any manifest whose
 * tenant, immutable key, provider, storage key, or integrity metadata differs.
 * The delete callback must verify the exact recorded integrity metadata before
 * deleting provider bytes. An unknown transaction outcome is record-only:
 * deleting in that case could destroy a relational publication that actually
 * committed.
 */
export async function reconcileExternalPublication(input: {
  allowDeletion: boolean;
  record: () => Promise<void>;
  deleteExact: () => Promise<void>;
}): Promise<ReconciliationResult> {
  if (!input.allowDeletion) {
    try {
      await input.record();
      return { status: "recorded" };
    } catch (recordError) {
      return { status: "unresolved", recordError };
    }
  }

  try {
    await input.record();
  } catch (recordError) {
    try {
      await input.deleteExact();
      return { status: "deleted", recordError };
    } catch (deleteError) {
      return { status: "unresolved", recordError, deleteError };
    }
  }

  try {
    await input.deleteExact();
    return { status: "deleted" };
  } catch (deleteError) {
    return { status: "recorded", deleteError };
  }
}
