/**
 * Independent deadline purge (PWC-27 local algorithm).
 *
 * This is not a deployed Worker. It enumerates prefix metadata and never
 * treats a missing application database as permission to skip objects.
 */
export const PROOF_PURGE_VERSION = "proof-purge-v1";

export type PurgeObject = {
  key: string;
  deadlineMs: number;
};

export function dueKeys(objects: readonly PurgeObject[], now: number, skewMs = 60_000): string[] {
  return objects.filter((object) => now >= object.deadlineMs - skewMs).map((object) => object.key);
}

export function nextCursor(keys: readonly string[], pageSize = 100): { page: string[]; cursor: string | null } {
  const page = keys.slice(0, pageSize);
  const rest = keys.slice(pageSize);
  return { page, cursor: rest[0] ?? null };
}
