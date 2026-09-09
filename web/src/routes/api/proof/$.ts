import { createFileRoute } from "@tanstack/react-router";
import { requireUserId } from "@/lib/auth/verify.server";
import { withAuthenticatedDatabaseContext } from "@/lib/auth/runtime-context.server";
import { proofCapabilitiesPath } from "@/lib/products/capabilities";
import { ensureAccount } from "@/lib/server/account";
import { getSql } from "@/lib/db";
import { deleteProofRun, getProofCapabilities, proofDownload, proofUploadAdmissionResponse } from "@/lib/server/proof-service";
import { createSqlProofRunCatalog, handleProofRequest, proofHttpError } from "@/lib/server/proof-http";
import { currentDatabaseContext } from "@/lib/db-context.server";

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

async function handler(request: Request): Promise<Response> {
  try {
    const path = parts(request);
    if (proofCapabilitiesPath(path, request.method)) {
      return Response.json(getProofCapabilities(), { headers: noStore });
    }
    const paused = proofUploadAdmissionResponse();
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
      return handleProofRequest(request, {
        now: Date.now,
        actor,
        trustedOrigins: TRUSTED_ORIGINS,
        acceptingUploads: paused == null,
        catalog: {
          ...catalog,
          async outputBytes(owner, runId) {
            try {
              return await proofDownload(owner.userId, runId);
            } catch {
              return null;
            }
          },
          async save(run) {
            if (run.status === "deleting") {
              await deleteProofRun(run.ownerUserId, run.runId);
              return;
            }
            await catalog.save(run);
          },
        },
        // Live R2 transfer broker is not provisioned. Source PUT must not pretend otherwise.
        transfer: null,
      });
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const Route = createFileRoute("/api/proof/$")({ server: { handlers: { GET: ({ request }) => handler(request), POST: ({ request }) => handler(request), PUT: ({ request }) => handler(request), DELETE: ({ request }) => handler(request) } } });
