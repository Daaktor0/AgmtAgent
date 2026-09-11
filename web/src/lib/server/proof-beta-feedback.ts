/**
 * Invited-cohort Proof feedback. Explicit user send only.
 * Observability stores bounded structured fields: category, optional closed
 * reason code, and explicitly consented technical metadata. No free text,
 * filenames, excerpts, findings or document content.
 */
import { createHash } from "node:crypto";
import {
  PROOF_BETA_FEEDBACK_VERSION,
  ProofBetaFeedbackRequestSchema,
  type ProofBetaFeedbackRequest,
} from "../proof-local/beta-feedback.ts";

export const PROOF_BETA_FEEDBACK_MAX_PER_IP_DAY = 20;
export const PROOF_BETA_FEEDBACK_MAX_BYTES = 1024;
const TRUSTED_ORIGINS = ["https://app.agmt.legal", "http://localhost:8080", "http://127.0.0.1:8080"];

export class ProofBetaFeedbackError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "ProofBetaFeedbackError";
    this.code = code;
    this.status = status;
  }
}

const counts = new Map<string, number>();

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function originOk(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin && TRUSTED_ORIGINS.includes(origin)) return true;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return TRUSTED_ORIGINS.includes(new URL(referer).origin);
  } catch {
    return false;
  }
}

function ipKey(request: Request, now: number): string {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `${utcDay(now)}:${createHash("sha256").update(ip).digest("hex").slice(0, 16)}`;
}

export function proofBetaFeedbackLogLine(body: ProofBetaFeedbackRequest, now: number): string {
  return JSON.stringify({
    type: "PROOF_BETA_FEEDBACK",
    version: PROOF_BETA_FEEDBACK_VERSION,
    category: body.category,
    reasonCode: body.reasonCode,
    includeTechnical: body.includeTechnical,
    appVersion: body.appVersion,
    browser: body.browser,
    at: new Date(now).toISOString(),
  });
}

export async function handleProofBetaFeedback(request: Request, now = Date.now()): Promise<Response> {
  const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers });
  }
  if (!originOk(request)) {
    return Response.json({ error: "invalid_origin" }, { status: 403, headers });
  }
  const raw = await request.text();
  if (raw.length > PROOF_BETA_FEEDBACK_MAX_BYTES) {
    throw new ProofBetaFeedbackError("payload_too_large", 400, "Feedback is too long");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ProofBetaFeedbackError("invalid_feedback", 400, "Feedback JSON is invalid");
  }
  const result = ProofBetaFeedbackRequestSchema.safeParse(parsed);
  if (!result.success) throw new ProofBetaFeedbackError("invalid_feedback", 400, "Feedback fields are invalid");
  const body: ProofBetaFeedbackRequest = result.data;
  const key = ipKey(request, now);
  const used = counts.get(key) ?? 0;
  if (used >= PROOF_BETA_FEEDBACK_MAX_PER_IP_DAY) {
    throw new ProofBetaFeedbackError("quota_exceeded", 429, "Today’s feedback limit is reached");
  }
  counts.set(key, used + 1);
  console.info(proofBetaFeedbackLogLine(body, now));
  return Response.json({ ok: true, version: PROOF_BETA_FEEDBACK_VERSION }, { headers });
}
