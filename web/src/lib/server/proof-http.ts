/**
 * Proof HTTP surface (PWC-19/20).
 *
 * Handlers, persistence and the transfer broker are injected. A missing
 * broker is not a completed upload journey. Admission remains fail-closed.
 */
import { randomBytes } from "node:crypto";
import { LAUNCH_RULE_SET_VERSION } from "../agmt/proof/registry.ts";
import {
  PROOF_LANGUAGES,
  PROOF_MAX_SOURCE_BYTES,
  PROOF_PROFILES,
  PROOF_SUPPORT_MATRIX_VERSION,
  proofCapabilitiesPath,
  proofRouteRequiresUploadAdmission,
} from "../products/capabilities.ts";
import { ProofErrorResponseSchema } from "../products/api-contracts.ts";
import type { Sql } from "../db-transaction.ts";
import {
  createProductRun,
  getOwnedProductRun,
  listOwnedProductRuns,
  type ProductRunRow,
} from "./product-runs.ts";
import { proofDeadlines } from "./retention.ts";
import {
  ProofAuthorizationError,
  authorizeProofAction,
  assertTrustedMutationOrigin,
  type ProofActor,
  type ProofAction,
} from "./proof-authorization.ts";
import {
  ProofUploadError,
  assertSourceHeaders,
  consumeProofSourceStream,
  legacyProofUploadClosed,
  parseCreateProofRunRequest,
  runSummaryFromProductRun,
  sourcePutAccepted,
  PROOF_DOCX_MIME,
} from "./proof-upload.ts";
import { ProofAdmissionError, countActiveRuns, reserveProofAdmission } from "./proof-admission.ts";
import { emitProofEvent, sizeBucketFor } from "./proof-events.ts";
import { ProofFeedbackError, admitProofFeedback, memoryFeedbackStore } from "./proof-feedback.ts";

const PARSER_VERSION = "proof-docx-v2";
const EXPORTER_VERSION = "proof-ooxml-v1";
const noStore = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

export type ProofSourceTransfer = {
  putSource(input: { run: ProductRunRow; bytes: Uint8Array; sha256: string }): Promise<void>;
};

export type ProofDownloadTicket = {
  token: string;
  runId: string;
  ownerUserId: string;
  tenantId: string;
  expiresAt: number;
};

export type ProofRunCatalog = {
  create(input: {
    actor: ProofActor;
    sizeBytes: number;
    sha256: string;
    profile: "agreement" | "general";
    language: "en-GB" | "en-US";
    idempotencyKey: string;
    now: number;
  }): Promise<{ created: boolean; run: ProductRunRow }>;
  get(actor: ProofActor, runId: string): Promise<ProductRunRow | null>;
  list(actor: ProofActor): Promise<ProductRunRow[]>;
  save(run: ProductRunRow): Promise<void>;
  outputBytes(actor: ProofActor, runId: string): Promise<Uint8Array | null>;
  issueTicket(input: ProofDownloadTicket): Promise<void>;
  takeTicket(token: string): Promise<ProofDownloadTicket | null>;
};

export type ProofHttpDeps = {
  now: () => number;
  actor: ProofActor | null;
  trustedOrigins: readonly string[];
  acceptingUploads: boolean;
  catalog: ProofRunCatalog;
  transfer: ProofSourceTransfer | null;
  quota?: {
    ownerUploadsUtcDay: number;
    globalUploadsUtcDay: number;
    globalComputeAttempts: number;
  };
  feedback?: ReturnType<typeof memoryFeedbackStore>;
};

const defaultFeedback = memoryFeedbackStore();

function catalogKey(run: Pick<ProductRunRow, "tenantId" | "ownerUserId" | "runId">): string {
  return `${run.tenantId}:${run.ownerUserId}:${run.runId}`;
}

export class MemoryProofRunCatalog implements ProofRunCatalog {
  readonly runs = new Map<string, ProductRunRow>();
  readonly outputs = new Map<string, Uint8Array>();
  readonly tickets = new Map<string, ProofDownloadTicket>();

  async create(input: Parameters<ProofRunCatalog["create"]>[0]) {
    const existing = [...this.runs.values()].find(
      (run) => run.tenantId === input.actor.tenantId
        && run.ownerUserId === input.actor.userId
        && run.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      if (existing.sourceSize !== input.sizeBytes || existing.sourceSha256 !== input.sha256) {
        throw new ProofUploadError("idempotency_conflict", 409, "Idempotency key is bound to different Proof inputs");
      }
      return { created: false, run: existing };
    }
    const run: ProductRunRow = {
      runId: `run_${randomBytes(8).toString("hex")}`,
      tenantId: input.actor.tenantId,
      ownerUserId: input.actor.userId,
      productId: "proof",
      retentionPolicy: "temporary_2h",
      status: "uploading",
      deadlines: proofDeadlines(input.now),
      cancellationGeneration: 0,
      attemptCount: 0,
      parserVersion: PARSER_VERSION,
      ruleSetVersion: LAUNCH_RULE_SET_VERSION,
      exporterVersion: EXPORTER_VERSION,
      idempotencyKey: input.idempotencyKey,
      sourceSize: input.sizeBytes,
      sourceSha256: input.sha256,
      outputArtifactId: null,
      correctionCount: 0,
      commentCount: 0,
      coverageStatus: null,
      errorCode: null,
      deletedAt: null,
      deletionVerifiedAt: null,
      profile: input.profile,
      language: input.language,
      noticeCount: 0,
      leaseToken: null,
    };
    this.runs.set(catalogKey(run), run);
    return { created: true, run };
  }

  async get(actor: ProofActor, runId: string) {
    return this.runs.get(`${actor.tenantId}:${actor.userId}:${runId}`) ?? null;
  }

  async list(actor: ProofActor) {
    return [...this.runs.values()].filter((run) => run.tenantId === actor.tenantId && run.ownerUserId === actor.userId);
  }

  async save(run: ProductRunRow) {
    this.runs.set(catalogKey(run), run);
  }

  async outputBytes(actor: ProofActor, runId: string) {
    const run = await this.get(actor, runId);
    if (!run || run.status !== "ready") return null;
    return this.outputs.get(catalogKey(run)) ?? null;
  }

  async issueTicket(ticket: ProofDownloadTicket) {
    this.tickets.set(ticket.token, ticket);
  }

  async takeTicket(token: string) {
    const ticket = this.tickets.get(token) ?? null;
    if (ticket) this.tickets.delete(token);
    return ticket;
  }
}

export function createSqlProofRunCatalog(sql: Sql, tickets = new Map<string, ProofDownloadTicket>()): ProofRunCatalog {
  return {
    async create(input) {
      const listed = await listOwnedProductRuns(sql, { tenantId: input.actor.tenantId, ownerUserId: input.actor.userId });
      const existing = listed.find((run) => run.idempotencyKey === input.idempotencyKey);
      if (existing) {
        if (existing.sourceSize !== input.sizeBytes || existing.sourceSha256 !== input.sha256) {
          throw new ProofUploadError("idempotency_conflict", 409, "Idempotency key is bound to different Proof inputs");
        }
        return { created: false, run: existing };
      }
      const run = await createProductRun(sql, {
        tenantId: input.actor.tenantId,
        ownerUserId: input.actor.userId,
        productId: "proof",
        idempotencyKey: input.idempotencyKey,
        parserVersion: PARSER_VERSION,
        ruleSetVersion: LAUNCH_RULE_SET_VERSION,
        exporterVersion: EXPORTER_VERSION,
        sourceSize: input.sizeBytes,
        sourceSha256: input.sha256,
        profile: input.profile,
        language: input.language,
      }, input.now);
      return { created: true, run };
    },
    get: (actor, runId) => getOwnedProductRun(sql, { tenantId: actor.tenantId, ownerUserId: actor.userId, runId }),
    list: (actor) => listOwnedProductRuns(sql, { tenantId: actor.tenantId, ownerUserId: actor.userId }),
    async save(run) {
      await sql.query(
        "update product_run set status = $1, deleted_at = case when $1 in ('deleting','deleted') then coalesce(deleted_at, now()) else deleted_at end, cancellation_generation = $2, updated_at = now() where tenant_id = $3 and owner_user_id = $4 and run_id = $5",
        [run.status, run.cancellationGeneration, run.tenantId, run.ownerUserId, run.runId],
      );
    },
    async outputBytes() {
      return null;
    },
    async issueTicket(ticket) {
      tickets.set(ticket.token, ticket);
    },
    async takeTicket(token) {
      const ticket = tickets.get(token) ?? null;
      if (ticket) tickets.delete(token);
      return ticket;
    },
  };
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: noStore });
}

function errorBody(code: string, status: number, now: number, retryable = false): Response {
  return json(ProofErrorResponseSchema.parse({
    error: { code, messageKey: code, retryable, supportId: randomBytes(8).toString("hex") },
    serverNow: now,
  }), status);
}

function pathOf(request: Request): string[] {
  return new URL(request.url).pathname.replace(/^\/api\/proof\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
}

function readIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!value || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    throw new ProofUploadError("invalid_upload_request", 400, "Idempotency-Key is required");
  }
  return value;
}

function actionFor(method: string, path: readonly string[]): ProofAction | null {
  if (method === "POST" && path.length === 1 && path[0] === "runs") return "create";
  if (method === "PUT" && path.length === 3 && path[0] === "runs" && path[2] === "source") return "source";
  if (method === "GET" && path.length === 2 && path[0] === "runs") return "status";
  if (method === "GET" && path.length === 1 && path[0] === "runs") return "list";
  if (method === "POST" && path.length === 3 && path[0] === "runs" && path[2] === "retry") return "retry";
  if (method === "POST" && path.length === 3 && path[0] === "runs" && path[2] === "download-ticket") return "ticket";
  if (method === "POST" && path.length === 3 && path[0] === "runs" && path[2] === "download") return "download";
  if (method === "GET" && path.length === 2 && path[0] === "download") return "download";
  if (method === "DELETE" && path.length === 2 && (path[0] === "runs" || path[0] === "run")) return "delete";
  if (method === "POST" && path.length === 3 && path[0] === "runs" && path[2] === "feedback") return "feedback";
  return null;
}

function lookupRunId(path: readonly string[]): string | undefined {
  if (path[0] === "runs" && path[1]) return path[1];
  if (path[0] === "run" && path[1]) return path[1];
  if (path[0] === "download" && path[1]) return path[1];
  return undefined;
}

async function* requestBytes(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return;
      if (next.value) yield next.value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function handleProofRequest(request: Request, deps: ProofHttpDeps): Promise<Response> {
  const now = deps.now();
  const path = pathOf(request);
  try {
    if (proofCapabilitiesPath(path, request.method)) {
      return json({
        apiVersion: 2,
        acceptingUploads: deps.acceptingUploads,
        maxSourceBytes: PROOF_MAX_SOURCE_BYTES,
        profiles: PROOF_PROFILES,
        languages: PROOF_LANGUAGES,
        ruleSetVersion: LAUNCH_RULE_SET_VERSION,
        supportMatrixVersion: PROOF_SUPPORT_MATRIX_VERSION,
      }, 200);
    }

    if (proofRouteRequiresUploadAdmission(request.method, path) && !deps.acceptingUploads) {
      return json({ error: "uploads_paused" }, 503);
    }

    if (!deps.actor) return json({ error: "unauthorized" }, 401);
    assertTrustedMutationOrigin({
      method: request.method,
      origin: request.headers.get("origin"),
      trustedOrigins: deps.trustedOrigins,
    });

    if (request.method === "POST" && path[0] === "upload") {
      const closed = legacyProofUploadClosed(now);
      return json(closed.body, closed.status);
    }

    const action = actionFor(request.method, path);
    if (!action) return json({ error: "not_found" }, 404);

    const runId = lookupRunId(path);
    const stored = runId ? await deps.catalog.get(deps.actor, runId) : null;
    const authorized = authorizeProofAction({
      actor: deps.actor,
      action,
      runId: action === "list" || action === "create" ? undefined : runId,
      resource: stored
        ? { runId: stored.runId, tenantId: stored.tenantId, ownerUserId: stored.ownerUserId }
        : null,
    });

    if (action === "create") {
      const body = parseCreateProofRunRequest(await request.json());
      const key = readIdempotencyKey(request);
      const listed = await deps.catalog.list(authorized.actor);
      reserveProofAdmission({
        readiness: {
          productId: "proof",
          uploadsSwitch: true,
          purgeReadyAt: now,
          scannerReadyAt: now,
          validatorReadyAt: now,
          now,
        },
        quota: {
          ...countActiveRuns(listed.map((run) => run.status)),
          ownerUploadsUtcDay: deps.quota?.ownerUploadsUtcDay ?? listed.length,
          globalUploadsUtcDay: deps.quota?.globalUploadsUtcDay ?? listed.length,
          globalComputeAttempts: deps.quota?.globalComputeAttempts ?? 0,
        },
        nowMs: now,
      });
      const created = await deps.catalog.create({
        actor: authorized.actor,
        sizeBytes: body.sizeBytes,
        sha256: body.sha256,
        profile: body.profile,
        language: body.language,
        idempotencyKey: key,
        now,
      });
      emitProofEvent({
        version: "proof-event-v1",
        name: "run_admitted",
        token: randomBytes(8).toString("hex"),
        stage: "uploading",
        errorCode: null,
        sizeBucket: sizeBucketFor(body.sizeBytes),
        durationBucket: null,
        count: 1,
      }, () => undefined);
      return json(runSummaryFromProductRun(created.run, now), created.created ? 201 : 200);
    }

    if (action === "source") {
      if (!stored) return errorBody("not_found", 404, now);
      if (!deps.transfer) return errorBody("processing_unavailable", 503, now, true);
      const headers = assertSourceHeaders({
        contentType: request.headers.get("content-type"),
        contentLength: request.headers.get("content-length"),
        declaredSize: stored.sourceSize ?? 0,
      });
      if (!request.body) throw new ProofUploadError("invalid_upload_request", 400, "A request body is required");
      const consumed = await consumeProofSourceStream({
        stream: requestBytes(request.body),
        expectedBytes: headers.contentLength,
        expectedSha256: stored.sourceSha256 ?? "",
        now: deps.now,
        startedAt: now,
      });
      await deps.transfer.putSource({ run: stored, bytes: consumed.bytes, sha256: consumed.sha256 });
      const scanning = { ...stored, status: "scanning" as const };
      await deps.catalog.save(scanning);
      const accepted = sourcePutAccepted(runSummaryFromProductRun(scanning, deps.now()));
      return json(accepted.summary, accepted.status);
    }

    if (action === "list") {
      const rows = await deps.catalog.list(authorized.actor);
      return json(rows.slice(0, 20).map((run) => runSummaryFromProductRun(run, now)), 200);
    }

    if (action === "status") {
      return json(runSummaryFromProductRun(stored!, now), 200);
    }

    if (action === "retry") {
      if (stored!.status !== "failed") return errorBody("retry_ineligible", 409, now);
      return json(runSummaryFromProductRun(stored!, now), 202);
    }

    if (action === "ticket") {
      if (stored!.status !== "ready") return errorBody("not_found", 404, now);
      const token = randomBytes(16).toString("hex");
      const expiresAt = Math.min(now + 60_000, stored!.deadlines.accessDeadline);
      await deps.catalog.issueTicket({
        token,
        runId: stored!.runId,
        ownerUserId: authorized.actor.userId,
        tenantId: authorized.actor.tenantId,
        expiresAt,
      });
      return json({ token, expiresAt }, 200);
    }

    if (action === "download") {
      if (request.method === "POST") {
        const header = request.headers.get("x-proof-download-ticket");
        const ticket = header ? await deps.catalog.takeTicket(header) : null;
        if (!ticket || ticket.expiresAt <= now || ticket.ownerUserId !== authorized.actor.userId || ticket.tenantId !== authorized.actor.tenantId) {
          return errorBody("not_found", 404, now);
        }
      }
      const bytes = await deps.catalog.outputBytes(authorized.actor, stored!.runId);
      if (!bytes) return json({ error: "proof_not_available" }, 403);
      return new Response(Buffer.from(bytes), {
        status: 200,
        headers: {
          ...noStore,
          "content-type": PROOF_DOCX_MIME,
          "content-disposition": 'attachment; filename="agmt-proof.docx"',
        },
      });
    }

    if (action === "delete") {
      if (stored!.status === "deleted") return json(runSummaryFromProductRun(stored!, now), 200);
      const deleting = {
        ...stored!,
        status: "deleting" as const,
        deletedAt: now,
        cancellationGeneration: stored!.cancellationGeneration + 1,
      };
      await deps.catalog.save(deleting);
      return json(runSummaryFromProductRun(deleting, now), 202);
    }

    if (action === "feedback") {
      if (!stored) return errorBody("not_found", 404, now);
      const raw = await request.text();
      admitProofFeedback({
        store: deps.feedback ?? defaultFeedback,
        runId: stored.runId,
        ownerUserId: authorized.actor.userId,
        runGone: stored.status === "deleted" && stored.deletionVerifiedAt != null && now - stored.deletionVerifiedAt > 24 * 60 * 60 * 1000,
        nowMs: now,
        rawBody: raw,
      });
      return new Response(null, { status: 204, headers: noStore });
    }

    return json({ error: "not_found" }, 404);
  } catch (error) {
    return proofHttpError(error, now);
  }
}

export function proofHttpError(error: unknown, now = Date.now()): Response {
  if (error instanceof ProofAuthorizationError) {
    if (error.status === 401) return json({ error: "unauthorized" }, 401);
    if (error.status === 404) return json({ error: "not_found" }, 404);
    return json({ error: error.code }, error.status);
  }
  if (error instanceof ProofUploadError) return errorBody(error.code, error.status, now);
  if (error instanceof ProofAdmissionError) {
    const response = errorBody(error.code, error.status, now, error.status === 503);
    if (error.retryAfter != null) response.headers.set("retry-after", String(error.retryAfter));
    return response;
  }
  if (error instanceof ProofFeedbackError) return errorBody(error.code, error.status, now, error.status === 429);
  return json({ error: "proof_request_failed" }, 400);
}
