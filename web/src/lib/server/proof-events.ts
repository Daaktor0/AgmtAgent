/**
 * Content-free Proof operational events (PWC-21).
 *
 * Allowlisted names and buckets only. Raw errors, bodies, keys and snippets
 * are dropped rather than logged.
 */
export const PROOF_EVENT_VERSION = "proof-event-v1";

export const PROOF_EVENT_NAMES = [
  "run_admitted",
  "upload_complete",
  "scan_outcome",
  "attempt_started",
  "stage_duration",
  "rule_outcome",
  "validation_outcome",
  "ready",
  "download_started",
  "delete_requested",
  "purge_verified",
  "purge_overdue",
  "admission_paused",
] as const;
export type ProofEventName = (typeof PROOF_EVENT_NAMES)[number];

export const PROOF_SIZE_BUCKETS = ["le_1mib", "le_5mib", "le_25mib", "over"] as const;
export type ProofSizeBucket = (typeof PROOF_SIZE_BUCKETS)[number];

export const PROOF_DURATION_BUCKETS = ["le_1s", "le_5s", "le_30s", "le_120s", "le_300s", "over"] as const;
export type ProofDurationBucket = (typeof PROOF_DURATION_BUCKETS)[number];

const FORBIDDEN = /filename|snippet|quote|exactQuote|body|stack|password|objectKey|storage_key|presigned|tenantId|ownerUserId|replacement/i;
const EVENT_NAME = new Set<string>(PROOF_EVENT_NAMES);

export type ProofOperationalEvent = {
  version: typeof PROOF_EVENT_VERSION;
  name: ProofEventName;
  token: string;
  stage: string | null;
  errorCode: string | null;
  sizeBucket: ProofSizeBucket | null;
  durationBucket: ProofDurationBucket | null;
  count: number | null;
};

export class ProofEventError extends Error {
  readonly code = "invalid_operational_event";
  constructor(message: string) {
    super(message);
    this.name = "ProofEventError";
  }
}

export function sizeBucketFor(bytes: number): ProofSizeBucket {
  if (!Number.isFinite(bytes) || bytes < 0) return "over";
  if (bytes <= 1024 * 1024) return "le_1mib";
  if (bytes <= 5 * 1024 * 1024) return "le_5mib";
  if (bytes <= 25 * 1024 * 1024) return "le_25mib";
  return "over";
}

export function durationBucketFor(ms: number): ProofDurationBucket {
  if (!Number.isFinite(ms) || ms < 0) return "over";
  if (ms <= 1_000) return "le_1s";
  if (ms <= 5_000) return "le_5s";
  if (ms <= 30_000) return "le_30s";
  if (ms <= 120_000) return "le_120s";
  if (ms <= 300_000) return "le_300s";
  return "over";
}

export function parseProofEvent(value: unknown): ProofOperationalEvent {
  if (!value || typeof value !== "object") throw new ProofEventError("event must be an object");
  const record = value as Record<string, unknown>;
  if (JSON.stringify(record).match(FORBIDDEN)) throw new ProofEventError("event contains forbidden content fields");
  if (record.version !== PROOF_EVENT_VERSION) throw new ProofEventError("event version is invalid");
  if (typeof record.name !== "string" || !EVENT_NAME.has(record.name)) throw new ProofEventError("event name is not allowlisted");
  if (typeof record.token !== "string" || !/^[a-z0-9]{16,32}$/.test(record.token)) {
    throw new ProofEventError("operational token is invalid");
  }
  if ("error" in record || "stack" in record || "body" in record || "key" in record) {
    throw new ProofEventError("raw error or object key fields are not permitted");
  }
  return {
    version: PROOF_EVENT_VERSION,
    name: record.name as ProofEventName,
    token: record.token,
    stage: record.stage == null ? null : String(record.stage),
    errorCode: record.errorCode == null ? null : String(record.errorCode),
    sizeBucket: record.sizeBucket == null ? null : record.sizeBucket as ProofSizeBucket,
    durationBucket: record.durationBucket == null ? null : record.durationBucket as ProofDurationBucket,
    count: record.count == null ? null : Number(record.count),
  };
}

export function emitProofEvent(event: ProofOperationalEvent, sink: (line: string) => void = console.info): void {
  const parsed = parseProofEvent(event);
  sink(JSON.stringify(parsed));
}
