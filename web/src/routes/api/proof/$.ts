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

async function liveAcceptingUploads(now: number): Promise<boolean> {
  const uploadsSwitch = parseProofUploadsSwitch(serverEnv("PROOF_UPLOADS_ENABLED"));
  const bucket = liveProofR2Bucket();
  const health = bucket ? await readProofHealth(bucket) : { purgeReadyAt: null, scannerReadyAt: null, validatorReadyAt: null };
  return proofAcceptingUploads({
    productId: "proof",
    uploadsSwitch,
    purgeReadyAt: health.purgeReadyAt,
    scannerReadyAt: health.scannerReadyAt,
    validatorReadyAt: health.validatorReadyAt,
    now,
  });
}

async function handler(request: Request): Promise<Response> {
  try {
    const path = parts(request);
    const now = Date.now();
    if (proofCapabilitiesPath(path, request.method)) {
      const acceptingUploads = await liveAcceptingUploads(now);
      return Response.json({ ...getProofCapabilities(now), acceptingUploads }, { headers: noStore });
    }
    const acceptingUploads = await liveAcceptingUploads(now);
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
      });
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const Route = createFileRoute("/api/proof/$")({ server: { handlers: { GET: ({ request }) => handler(request), POST: ({ request }) => handler(request), PUT: ({ request }) => handler(request), DELETE: ({ request }) => handler(request) } } });
