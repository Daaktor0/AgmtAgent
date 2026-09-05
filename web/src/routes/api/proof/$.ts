import { createFileRoute } from "@tanstack/react-router";
import { requireUserId } from "@/lib/auth/verify.server";
import { withAuthenticatedDatabaseContext } from "@/lib/auth/runtime-context.server";
import { authenticatedProofUpload, deleteProofRun, proofDownload } from "@/lib/server/proof-service";

function parts(request: Request): string[] {
  return new URL(request.url).pathname.replace(/^\/api\/proof\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
}

function errorResponse(error: unknown): Response {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : error instanceof Error ? error.message : "proof_request_failed";
  const known = new Set([
    "unverified_email", "disabled", "proof_not_available", "proof_object_missing",
    "processing_deadline_reached", "upload_grant_closed", "source_too_large",
    "unsupported_content_type", "invalid_docx", "unsafe_docx", "proof_failed",
  ]);
  const safeCode = known.has(code) ? code : "proof_request_failed";
  const status = safeCode === "source_too_large" ? 413
    : safeCode === "unsupported_content_type" ? 415
      : ["unverified_email", "disabled", "proof_not_available", "proof_object_missing"].includes(safeCode) ? 403
        : 400;
  return Response.json({ error: safeCode }, { status });
}

async function handler(request: Request): Promise<Response> {
  try {
    const userId = await requireUserId();
    return withAuthenticatedDatabaseContext(userId, async () => {
      const path = parts(request);
      if (request.method === "POST" && path[0] === "upload") {
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (declared > 25 * 1024 * 1024) return Response.json({ error: "source_too_large" }, { status: 413 });
        const bytes = Buffer.from(await request.arrayBuffer());
        const key = request.headers.get("idempotency-key") ?? `proof-${crypto.randomUUID()}`;
        const result = await authenticatedProofUpload(userId, bytes, key, request.headers.get("content-type") ?? undefined);
        return Response.json(result, { status: result.status === "rejected" || result.status === "failed" ? 422 : 200 });
      }
      if (request.method === "GET" && path[0] === "download" && path[1]) {
        const bytes = await proofDownload(userId, path[1]);
        return new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="agmt-proof.docx"`, "cache-control": "no-store" } });
      }
      if (request.method === "DELETE" && path[0] === "run" && path[1]) {
        await deleteProofRun(userId, path[1]);
        return Response.json({ ok: true });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const Route = createFileRoute("/api/proof/$")({ server: { handlers: { GET: ({ request }) => handler(request), POST: ({ request }) => handler(request), DELETE: ({ request }) => handler(request) } } });
