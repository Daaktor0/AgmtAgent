/**
 * Operator health receipts stored on R2 (PWC-21/27/34).
 *
 * Purge, scanner and validator freshness are read on admission. Missing or
 * stale signals deny uploads. Health objects live outside the proof/v2
 * expiry namespace so purge listing cannot treat them as documents.
 */
import type { ProofR2Bucket } from "./proof-objects.ts";

export const PROOF_HEALTH_PREFIX = "proof/health";
export const PROOF_HEALTH_KEYS = {
  purge: `${PROOF_HEALTH_PREFIX}/purge.json`,
  scanner: `${PROOF_HEALTH_PREFIX}/scanner.json`,
  validator: `${PROOF_HEALTH_PREFIX}/validator.json`,
} as const;

export type ProofHealthSignal = keyof typeof PROOF_HEALTH_KEYS;

export type ProofHealthReceipt = {
  signal: ProofHealthSignal;
  readyAt: number;
  version: string;
};

export type ProofHealthSnapshot = {
  purgeReadyAt: number | null;
  scannerReadyAt: number | null;
  validatorReadyAt: number | null;
};

function parseReceipt(signal: ProofHealthSignal, text: string): ProofHealthReceipt | null {
  try {
    const value = JSON.parse(text) as Partial<ProofHealthReceipt>;
    if (value.signal !== signal) return null;
    if (!Number.isFinite(value.readyAt) || typeof value.version !== "string") return null;
    return { signal, readyAt: Number(value.readyAt), version: value.version };
  } catch {
    return null;
  }
}

export async function writeProofHealth(
  bucket: ProofR2Bucket,
  signal: ProofHealthSignal,
  now: number,
  version: string,
): Promise<void> {
  const body = Buffer.from(JSON.stringify({ signal, readyAt: now, version }), "utf8");
  await bucket.put(PROOF_HEALTH_KEYS[signal], body, {
    customMetadata: { proof_health: signal, ready_at: String(now) },
  });
}

export async function readProofHealth(bucket: ProofR2Bucket): Promise<ProofHealthSnapshot> {
  const snapshot: ProofHealthSnapshot = { purgeReadyAt: null, scannerReadyAt: null, validatorReadyAt: null };
  for (const signal of Object.keys(PROOF_HEALTH_KEYS) as ProofHealthSignal[]) {
    const bytes = await bucket.get(PROOF_HEALTH_KEYS[signal]);
    if (!bytes) continue;
    const parsed = parseReceipt(signal, Buffer.from(bytes).toString("utf8"));
    if (!parsed) continue;
    if (signal === "purge") snapshot.purgeReadyAt = parsed.readyAt;
    if (signal === "scanner") snapshot.scannerReadyAt = parsed.readyAt;
    if (signal === "validator") snapshot.validatorReadyAt = parsed.readyAt;
  }
  return snapshot;
}
