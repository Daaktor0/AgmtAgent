/**
 * Server-derived Proof access (PWC-20).
 *
 * Owner and tenant come from the authenticated session context, never from
 * the client body. Foreign or missing runs are indistinguishable 404s.
 */
export const PROOF_AUTHORIZATION_VERSION = "proof-authorization-v1";
export const PROOF_RUN_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export type ProofAccountStatus = "active" | "disabled";
export type ProofSessionState = "valid" | "revoked" | "expired" | "missing";
export type ProofAction =
  | "create"
  | "source"
  | "status"
  | "list"
  | "retry"
  | "ticket"
  | "download"
  | "delete"
  | "feedback";

export type ProofActor = {
  userId: string;
  tenantId: string;
  emailVerified: boolean;
  accountStatus: ProofAccountStatus;
  sessionState: ProofSessionState;
};

export type ProofResource = {
  runId: string;
  tenantId: string;
  ownerUserId: string;
};

const VERIFIED_ACTIONS = new Set<ProofAction>(["create", "source", "retry", "ticket", "download"]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class ProofAuthorizationError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "ProofAuthorizationError";
    this.code = code;
    this.status = status;
  }
}

export function parseProofRunId(value: string | undefined | null): string {
  const runId = typeof value === "string" ? value.trim() : "";
  if (!PROOF_RUN_ID_PATTERN.test(runId)) {
    throw new ProofAuthorizationError("invalid_run_id", 400, "Run id is malformed");
  }
  return runId;
}

export function assertTrustedMutationOrigin(input: {
  method: string;
  origin: string | null;
  trustedOrigins: readonly string[];
}): void {
  if (!MUTATING_METHODS.has(input.method.toUpperCase())) return;
  const origin = input.origin?.trim() ?? "";
  if (!origin || !input.trustedOrigins.includes(origin)) {
    throw new ProofAuthorizationError("forbidden_origin", 403, "Cookie-authenticated mutations require a trusted origin");
  }
}

export function authorizeProofSession(actor: ProofActor): ProofActor {
  if (actor.sessionState === "missing" || actor.sessionState === "revoked" || actor.sessionState === "expired") {
    throw new ProofAuthorizationError("unauthorized", 401, "A valid session is required");
  }
  if (!actor.userId.trim() || !actor.tenantId.trim()) {
    throw new ProofAuthorizationError("unauthorized", 401, "A valid session is required");
  }
  if (actor.accountStatus !== "active") {
    throw new ProofAuthorizationError("disabled", 403, "Account is not active");
  }
  return actor;
}

export function authorizeProofAction(input: {
  actor: ProofActor;
  action: ProofAction;
  resource?: ProofResource | null;
  runId?: string;
}): { actor: ProofActor; resource: ProofResource | null } {
  const actor = authorizeProofSession(input.actor);
  if (VERIFIED_ACTIONS.has(input.action) && !actor.emailVerified) {
    throw new ProofAuthorizationError("unverified_email", 403, "Verify your email before this Proof action");
  }
  if (input.action === "list" || input.action === "create") {
    return { actor, resource: null };
  }
  const runId = parseProofRunId(input.runId);
  const resource = input.resource ?? null;
  if (
    !resource
    || resource.runId !== runId
    || resource.tenantId !== actor.tenantId
    || resource.ownerUserId !== actor.userId
  ) {
    throw new ProofAuthorizationError("not_found", 404, "This run isn’t available.");
  }
  return { actor, resource };
}
