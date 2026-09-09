import { createFileRoute } from "@tanstack/react-router";
import { requireUserId } from "@/lib/auth/verify.server";
import { withAuthenticatedDatabaseContext } from "@/lib/auth/runtime-context.server";
import { proofAcceptingUploads, proofCapabilitiesPath, parseProofUploadsSwitch } from "@/lib/products/capabilities";
import { ensureAccount } from "@/lib/server/account";
import { getSql } from "@/lib/db";
import { getProofCapabilities } from "@/lib/server/proof-service";
import { createSqlProofRunCatalog, handleProofRequest, proofHttpError } from "@/lib/server/proof-http";
import { currentDatabaseContext } from "@/lib/db-context.server";
import { serverEnv } from "@/lib/runtime-env.server";
import { liveProofR2Bucket } from "@/lib/server/proof-r2";
import { readProofHealth } from "@/lib/server/proof-health";
import { admitProofBudget, proofBudgetIsFresh, readProofBudget } from "@/lib/server/proof-budget";
import { createLiveProofRuntime, dispatchOwnedProofDeletion, dispatchOwnedProofPipeline } from "@/lib/server/proof-runtime";

function parts(request: Request): string[] {
  return new URL(request.url).pathname.replace(/^\/api\/proof\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
}

function errorResponse(error: unknown): Response {
  const statusFromError = error && typeof error === "object" && "status" in error && typeof error.status === "number"
    ? error.status
    : null;
  if (statusFromError === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
  return proofHttpError(error);
}

const noStore = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const TRUSTED_ORIGINS = ["https://app.agmt.legal", "http://localhost:8080", "http://127.0.0.1:8080"];

function scheduleWork(work: Promise<unknown>): void {
  const runtime = globalThis as typeof globalThis & {
    waitUntil?: (promise: Promise<unknown>) => void;
  };
  if (typeof runtime.waitUntil === "function") {
    runtime.waitUntil(work);
    return;
  }
  work.catch(() => undefined);
}

async function liveGate(now: number) {
  const uploadsSwitch = parseProofUploadsSwitch(serverEnv("PROOF_UPLOADS_ENABLED"));
  const bucket = liveProofR2Bucket();
  const health = bucket ? await readProofHealth(bucket) : { purgeReadyAt: null, scannerReadyAt: null, validatorReadyAt: null };
  const budget = bucket ? await readProofBudget(bucket, now) : null;
  const acceptingUploads = proofAcceptingUploads({
    productId: "proof",
    uploadsSwitch,
    purgeReadyAt: health.purgeReadyAt,
    scannerReadyAt: health.scannerReadyAt,
    validatorReadyAt: health.validatorReadyAt,
    budgetReadyAt: budget && proofBudgetIsFresh(budget, now) ? budget.readyAt : null,
    budgetAllowsAdmission: Boolean(budget?.admit),
    now,
  });
  return { bucket, budget, acceptingUploads };
}

async function handler(request: Request): Promise<Response> {
  try {
    const path = parts(request);
    const now = Date.now();
    const gate = await liveGate(now);
    if (proofCapabilitiesPath(path, request.method)) {
      return Response.json({ ...getProofCapabilities(now), acceptingUploads: gate.acceptingUploads }, { headers: noStore });
    }
    const acceptingUploads = gate.acceptingUploads;
    const userId = await requireUserId();
    return withAuthenticatedDatabaseContext(userId, async ({ tenantId }) => {
      const account = await ensureAccount(userId);
      const sql = await getSql();
      const actor = {
        userId,
        tenantId: currentDatabaseContext()?.tenantId ?? tenantId,
        emailVerified: Boolean(account.emailVerifiedAt),
        accountStatus: account.status === "active" ? "active" as const : "disabled" as const,
        sessionState: "valid" as const,
      };
      const catalog = createSqlProofRunCatalog(sql);
      const runtime = createLiveProofRuntime(sql);
      let quota = {
        ownerUploadsUtcDay: gate.budget?.jobsAdmitted ?? 0,
        globalUploadsUtcDay: gate.budget?.jobsAdmitted ?? 0,
        globalUploadsUtcMonth: gate.budget?.jobsAdmitted ?? 0,
        globalComputeAttempts: gate.budget?.jobsInFlight ?? 0,
      };
      try {
        const rows = await sql.query<{
          owner_uploads_utc_day: number;
          global_uploads_utc_day: number;
          global_uploads_utc_month: number;
          global_compute_attempts: number;
        }>(
          "select owner_uploads_utc_day, global_uploads_utc_day, global_uploads_utc_month, global_compute_attempts from agmt_private.proof_quota_snapshot($1, $2, to_timestamp($3::double precision / 1000.0))",
          [actor.tenantId, actor.userId, now],
        );
        const row = rows[0];
        if (row) {
          quota = {
            ownerUploadsUtcDay: Number(row.owner_uploads_utc_day) || 0,
            globalUploadsUtcDay: Number(row.global_uploads_utc_day) || 0,
            globalUploadsUtcMonth: Number(row.global_uploads_utc_month) || 0,
            globalComputeAttempts: Number(row.global_compute_attempts) || 0,
          };
        }
      } catch {
        /* 0011 is not applied yet; R2 budget counts remain the cap. */
      }
      return handleProofRequest(request, {
        now: Date.now,
        actor,
        trustedOrigins: TRUSTED_ORIGINS,
        acceptingUploads,
        downloadSecret: serverEnv("PROOF_DOWNLOAD_SECRET") ?? serverEnv("BETTER_AUTH_SECRET"),
        onSourceAccepted(run) {
          if (!runtime) return;
          scheduleWork(dispatchOwnedProofPipeline(sql, run, runtime).then(() => undefined));
        },
        catalog: {
          ...catalog,
          async outputBytes(owner, runId) {
            if (!runtime) return null;
            const run = await catalog.get(owner, runId);
            if (!run || run.status !== "ready" || now >= run.deadlines.accessDeadline) return null;
            const writers = await runtime.transfer.listWriters(runId);
            const output = writers.find((writer) => writer.kind === "marked_docx" && writer.writeStatus === "settled");
            if (!output) return null;
            return runtime.objects.get({
              key: output.key,
              expectedSha256: output.expectedSha256,
              expectedSize: output.expectedSize,
            });
          },
          async save(run) {
            if (run.status === "deleting") {
              if (runtime) {
                await dispatchOwnedProofDeletion(sql, run, runtime);
                return;
              }
              await catalog.save(run);
              return;
            }
            await catalog.save(run);
          },
        },
        transfer: runtime?.sourceTransfer ?? null,
        quota,
        async onRunAdmitted() {
          if (!gate.bucket) return;
          await admitProofBudget(gate.bucket, Date.now());
        },
      });
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const Route = createFileRoute("/api/proof/$")({ server: { handlers: { GET: ({ request }) => handler(request), POST: ({ request }) => handler(request), PUT: ({ request }) => handler(request), DELETE: ({ request }) => handler(request) } } });
