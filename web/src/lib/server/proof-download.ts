/**
 * Revocable Proof download tickets (PWC-28 local contract).
 *
 * Live publication, independent purge and R2 streaming remain outstanding.
 * This module does not mark PWC-28 complete.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const PROOF_DOWNLOAD_TICKET_TTL_MS = 60_000;
export const PROOF_DOWNLOAD_GENERIC_NAME = "agmt-proof.docx";

export type ProofDownloadClaims = {
  runId: string;
  ownerUserId: string;
  tenantId: string;
  generation: number;
  outputArtifactId: string;
  expiresAt: number;
};

export class ProofDownloadError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "ProofDownloadError";
    this.code = code;
    this.status = status;
  }
}

function payload(claims: ProofDownloadClaims): string {
  return [
    claims.runId,
    claims.ownerUserId,
    claims.tenantId,
    String(claims.generation),
    claims.outputArtifactId,
    String(claims.expiresAt),
  ].join("|");
}

export function signProofDownloadTicket(claims: ProofDownloadClaims, secret: string): string {
  if (!secret || secret.length < 16) throw new ProofDownloadError("misconfigured_download", 500, "Download signing key is missing");
  const body = Buffer.from(payload(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyProofDownloadTicket(token: string, secret: string, now: number, expected: ProofDownloadClaims): ProofDownloadClaims {
  const parts = token.split(".");
  if (parts.length !== 2) throw new ProofDownloadError("not_found", 404, "Download ticket is invalid");
  const [body, signature] = parts;
  const expectedSignature = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ProofDownloadError("not_found", 404, "Download ticket is invalid");
  }
  let claims: ProofDownloadClaims;
  try {
    const decoded = Buffer.from(body, "base64url").toString("utf8").split("|");
    claims = {
      runId: decoded[0] ?? "",
      ownerUserId: decoded[1] ?? "",
      tenantId: decoded[2] ?? "",
      generation: Number(decoded[3]),
      outputArtifactId: decoded[4] ?? "",
      expiresAt: Number(decoded[5]),
    };
  } catch {
    throw new ProofDownloadError("not_found", 404, "Download ticket is invalid");
  }
  if (claims.expiresAt <= now) throw new ProofDownloadError("not_found", 404, "Download ticket has expired");
  if (claims.runId !== expected.runId || claims.ownerUserId !== expected.ownerUserId || claims.tenantId !== expected.tenantId) {
    throw new ProofDownloadError("not_found", 404, "Download ticket is invalid");
  }
  if (claims.generation !== expected.generation || claims.outputArtifactId !== expected.outputArtifactId) {
    throw new ProofDownloadError("not_found", 404, "Download ticket is no longer valid");
  }
  return claims;
}

export function ticketExpiry(now: number, accessDeadline: number): number {
  return Math.min(now + PROOF_DOWNLOAD_TICKET_TTL_MS, accessDeadline);
}

export function unsafeProofRedirect(value: string): boolean {
  return !/^\/proof(?:\?run=[A-Za-z0-9_-]{16,64})?$/.test(value);
}
