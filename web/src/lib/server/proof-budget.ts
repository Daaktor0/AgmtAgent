/**
 * Fail-closed Proof spend control (PWC-21). Billing alerts are not a cap.
 *
 * Cloudflare does not hard-stop Workers/R2/Container usage at the included
 * allotment. Admission therefore refuses new uploads before estimated usage
 * plus reserved finish/delete/purge capacity would exceed included limits.
 * Cloudflare Containers are not authorised: a stuck instance cannot be
 * prevented from billing overage.
 */
import type { ProofR2Bucket } from "./proof-objects.ts";

export class ProofBudgetError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter: number | null;
  constructor(code: string, status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "ProofBudgetError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export const PROOF_BUDGET_VERSION = "proof-budget-v1";
export const PROOF_BUDGET_KEY = "proof/health/budget.json";
export const PROOF_BUDGET_FRESHNESS_MS = 90_000;
export const PROOF_CLOUDFLARE_CONTAINERS_ALLOWED = false;

/** Workers Paid included monthly allotments used by Proof. */
export const PROOF_INCLUDED_MONTHLY = Object.freeze({
  workersRequests: 10_000_000,
  workersCpuMs: 30_000_000,
  r2StorageBytes: 10 * 1024 * 1024 * 1024,
  r2ClassA: 1_000_000,
  r2ClassB: 10_000_000,
  workersLogs: 20_000_000,
  containerMemoryGibHours: 25,
  containerVcpuMinutes: 375,
  containerDiskGbHours: 200,
});

/**
 * Worst-case cost of one accepted job through scan, process, download and
 * verified deletion. Over-estimate on purpose.
 */
export const PROOF_JOB_COST = Object.freeze({
  requests: 50,
  cpuMs: 20_000,
  classA: 30,
  classB: 60,
  peakStorageBytes: 50 * 1024 * 1024,
});

/** Capacity that must remain after a new admission. */
export const PROOF_OPERATING_RESERVE = Object.freeze({
  appHeadroomRequests: 2_000_000,
  appHeadroomCpuMs: 8_000_000,
  appHeadroomClassA: 100_000,
  appHeadroomClassB: 500_000,
  cronRequestsPerMinute: 2,
  cronCpuMsPerMinute: 80,
  cronClassAPerMinute: 4,
  cronClassBPerMinute: 4,
});

export type ProofBudgetLedger = {
  version: typeof PROOF_BUDGET_VERSION;
  utcMonth: string;
  jobsAdmitted: number;
  jobsInFlight: number;
  estimatedRequests: number;
  estimatedCpuMs: number;
  estimatedClassA: number;
  estimatedClassB: number;
  estimatedPeakStorageBytes: number;
  containerGibHours: number;
  readyAt: number;
  admit: boolean;
};

export function utcMonthKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7);
}

export function minutesUntilUtcMonthEnd(nowMs: number): number {
  const now = new Date(nowMs);
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0);
  return Math.max(1, Math.ceil((next - nowMs) / 60_000));
}

export function nextUtcMonthRetryAfter(nowMs: number): number {
  return minutesUntilUtcMonthEnd(nowMs) * 60;
}

export function emptyProofBudget(nowMs: number): ProofBudgetLedger {
  return {
    version: PROOF_BUDGET_VERSION,
    utcMonth: utcMonthKey(nowMs),
    jobsAdmitted: 0,
    jobsInFlight: 0,
    estimatedRequests: 0,
    estimatedCpuMs: 0,
    estimatedClassA: 0,
    estimatedClassB: 0,
    estimatedPeakStorageBytes: 0,
    containerGibHours: 0,
    readyAt: nowMs,
    admit: true,
  };
}

export function rollProofBudgetMonth(ledger: ProofBudgetLedger, nowMs: number): ProofBudgetLedger {
  if (ledger.utcMonth === utcMonthKey(nowMs)) return ledger;
  return emptyProofBudget(nowMs);
}

function cronReserve(nowMs: number) {
  const minutes = minutesUntilUtcMonthEnd(nowMs);
  return {
    requests: PROOF_OPERATING_RESERVE.cronRequestsPerMinute * minutes,
    cpuMs: PROOF_OPERATING_RESERVE.cronCpuMsPerMinute * minutes,
    classA: PROOF_OPERATING_RESERVE.cronClassAPerMinute * minutes,
    classB: PROOF_OPERATING_RESERVE.cronClassBPerMinute * minutes,
  };
}

export function proofBudgetAllowsAdmission(ledger: ProofBudgetLedger, nowMs: number): boolean {
  if (!PROOF_CLOUDFLARE_CONTAINERS_ALLOWED && ledger.containerGibHours > 0) return false;
  const rolled = rollProofBudgetMonth(ledger, nowMs);
  const cron = cronReserve(nowMs);
  const afterRequests = rolled.estimatedRequests + PROOF_JOB_COST.requests + cron.requests + PROOF_OPERATING_RESERVE.appHeadroomRequests;
  const afterCpu = rolled.estimatedCpuMs + PROOF_JOB_COST.cpuMs + cron.cpuMs + PROOF_OPERATING_RESERVE.appHeadroomCpuMs;
  const afterClassA = rolled.estimatedClassA + PROOF_JOB_COST.classA + cron.classA + PROOF_OPERATING_RESERVE.appHeadroomClassA;
  const afterClassB = rolled.estimatedClassB + PROOF_JOB_COST.classB + cron.classB + PROOF_OPERATING_RESERVE.appHeadroomClassB;
  const peak = (rolled.jobsInFlight + 1) * PROOF_JOB_COST.peakStorageBytes;
  return afterRequests <= PROOF_INCLUDED_MONTHLY.workersRequests
    && afterCpu <= PROOF_INCLUDED_MONTHLY.workersCpuMs
    && afterClassA <= PROOF_INCLUDED_MONTHLY.r2ClassA
    && afterClassB <= PROOF_INCLUDED_MONTHLY.r2ClassB
    && peak <= PROOF_INCLUDED_MONTHLY.r2StorageBytes;
}

export function evaluateProofBudget(ledger: ProofBudgetLedger, nowMs: number): ProofBudgetLedger {
  const rolled = rollProofBudgetMonth(ledger, nowMs);
  return { ...rolled, readyAt: nowMs, admit: proofBudgetAllowsAdmission(rolled, nowMs) };
}

export function reserveProofBudget(ledger: ProofBudgetLedger, nowMs: number): ProofBudgetLedger {
  const evaluated = evaluateProofBudget(ledger, nowMs);
  if (!evaluated.admit) {
    throw new ProofBudgetError(
      "quota_exceeded",
      429,
      "You’ve reached this month’s free capacity.",
      nextUtcMonthRetryAfter(nowMs),
    );
  }
  return evaluateProofBudget({
    ...evaluated,
    jobsAdmitted: evaluated.jobsAdmitted + 1,
    jobsInFlight: evaluated.jobsInFlight + 1,
    estimatedRequests: evaluated.estimatedRequests + PROOF_JOB_COST.requests,
    estimatedCpuMs: evaluated.estimatedCpuMs + PROOF_JOB_COST.cpuMs,
    estimatedClassA: evaluated.estimatedClassA + PROOF_JOB_COST.classA,
    estimatedClassB: evaluated.estimatedClassB + PROOF_JOB_COST.classB,
    estimatedPeakStorageBytes: (evaluated.jobsInFlight + 1) * PROOF_JOB_COST.peakStorageBytes,
  }, nowMs);
}

/** Release in-flight reservation after verified deletion. Does not refund monthly estimates. */
export function releaseProofBudgetInFlight(ledger: ProofBudgetLedger, nowMs: number): ProofBudgetLedger {
  const rolled = rollProofBudgetMonth(ledger, nowMs);
  return evaluateProofBudget({
    ...rolled,
    jobsInFlight: Math.max(0, rolled.jobsInFlight - 1),
    estimatedPeakStorageBytes: Math.max(0, rolled.jobsInFlight - 1) * PROOF_JOB_COST.peakStorageBytes,
  }, nowMs);
}

function parseLedger(text: string): ProofBudgetLedger | null {
  try {
    const value = JSON.parse(text) as Partial<ProofBudgetLedger>;
    if (value.version !== PROOF_BUDGET_VERSION) return null;
    if (typeof value.utcMonth !== "string" || !/^\d{4}-\d{2}$/.test(value.utcMonth)) return null;
    const numbers = [
      value.jobsAdmitted, value.jobsInFlight, value.estimatedRequests, value.estimatedCpuMs,
      value.estimatedClassA, value.estimatedClassB, value.estimatedPeakStorageBytes,
      value.containerGibHours, value.readyAt,
    ];
    if (numbers.some((item) => !Number.isFinite(item) || Number(item) < 0)) return null;
    if (typeof value.admit !== "boolean") return null;
    return {
      version: PROOF_BUDGET_VERSION,
      utcMonth: value.utcMonth,
      jobsAdmitted: Number(value.jobsAdmitted),
      jobsInFlight: Number(value.jobsInFlight),
      estimatedRequests: Number(value.estimatedRequests),
      estimatedCpuMs: Number(value.estimatedCpuMs),
      estimatedClassA: Number(value.estimatedClassA),
      estimatedClassB: Number(value.estimatedClassB),
      estimatedPeakStorageBytes: Number(value.estimatedPeakStorageBytes),
      containerGibHours: Number(value.containerGibHours),
      readyAt: Number(value.readyAt),
      admit: value.admit,
    };
  } catch {
    return null;
  }
}

export async function readProofBudget(bucket: ProofR2Bucket, nowMs: number): Promise<ProofBudgetLedger | null> {
  const bytes = await bucket.get(PROOF_BUDGET_KEY);
  if (!bytes) return null;
  const parsed = parseLedger(Buffer.from(bytes).toString("utf8"));
  if (!parsed) return null;
  return rollProofBudgetMonth(parsed, nowMs);
}

export async function writeProofBudget(bucket: ProofR2Bucket, ledger: ProofBudgetLedger): Promise<void> {
  const body = Buffer.from(JSON.stringify(ledger), "utf8");
  await bucket.put(PROOF_BUDGET_KEY, body, {
    customMetadata: {
      proof_health: "budget",
      utc_month: ledger.utcMonth,
      ready_at: String(ledger.readyAt),
      admit: ledger.admit ? "true" : "false",
    },
  });
}

export async function refreshProofBudget(bucket: ProofR2Bucket, nowMs: number): Promise<ProofBudgetLedger> {
  const current = await readProofBudget(bucket, nowMs) ?? emptyProofBudget(nowMs);
  const evaluated = evaluateProofBudget(current, nowMs);
  await writeProofBudget(bucket, evaluated);
  return evaluated;
}

export async function admitProofBudget(bucket: ProofR2Bucket, nowMs: number): Promise<ProofBudgetLedger> {
  const current = await readProofBudget(bucket, nowMs);
  if (!current) {
    throw new ProofBudgetError("uploads_paused", 503, "Proof is temporarily unavailable for new uploads.");
  }
  const reserved = reserveProofBudget(current, nowMs);
  await writeProofBudget(bucket, reserved);
  return reserved;
}

export function proofBudgetIsFresh(ledger: ProofBudgetLedger | null, nowMs: number): boolean {
  if (!ledger) return false;
  if (!Number.isFinite(ledger.readyAt) || ledger.readyAt > nowMs) return false;
  return nowMs - ledger.readyAt <= PROOF_BUDGET_FRESHNESS_MS;
}

