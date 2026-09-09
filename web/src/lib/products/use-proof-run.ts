/**
 * Local Proof selection, hash, create/source wiring (PWC-31).
 *
 * Persists only run ID, options and idempotency. Never stores file bytes,
 * filenames or content. Does not invent processing success when the transfer
 * broker is disconnected.
 */
import { parseProofErrorResponse, parseRunSummaryV2, type RunSummaryV2 } from "./api-contracts.ts";
import type { ProofLanguage, ProofProfile } from "./capabilities.ts";
import { rejectRegressiveSummary } from "./proof-state.ts";

export const PROOF_RUN_POINTER_KEY = "agmt.proof.run-pointer";
export const PROOF_IDEM_PREFIX = "proof";

export type ProofRunPointer = {
  runId: string;
  profile: ProofProfile;
  language: ProofLanguage;
  idempotencyKey: string;
  sourceSha256: string;
};

export function parseProofRunPointer(value: unknown): ProofRunPointer | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.runId !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(record.runId)) return null;
  if (record.profile !== "agreement" && record.profile !== "general") return null;
  if (record.language !== "en-GB" && record.language !== "en-US") return null;
  if (typeof record.idempotencyKey !== "string" || record.idempotencyKey.length > 128) return null;
  if (typeof record.sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.sourceSha256)) return null;
  if ("filename" in record || "bytes" in record || "name" in record) return null;
  return {
    runId: record.runId,
    profile: record.profile,
    language: record.language,
    idempotencyKey: record.idempotencyKey,
    sourceSha256: record.sourceSha256,
  };
}

export function loadProofRunPointer(storage: Pick<Storage, "getItem"> | null): ProofRunPointer | null {
  if (!storage) return null;
  try {
    return parseProofRunPointer(JSON.parse(storage.getItem(PROOF_RUN_POINTER_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export function saveProofRunPointer(storage: Pick<Storage, "setItem"> | null, pointer: ProofRunPointer): void {
  storage?.setItem(PROOF_RUN_POINTER_KEY, JSON.stringify(pointer));
}

export function clearProofRunPointer(storage: Pick<Storage, "removeItem"> | null): void {
  storage?.removeItem(PROOF_RUN_POINTER_KEY);
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

export function idempotencyKeyFor(sourceSha256: string, profile: ProofProfile, language: ProofLanguage): string {
  return `${PROOF_IDEM_PREFIX}-${sourceSha256.slice(0, 32)}-${profile}-${language}`;
}

export function mergePolledSummary(previous: RunSummaryV2 | null, incoming: unknown): RunSummaryV2 {
  const next = parseRunSummaryV2(incoming);
  return rejectRegressiveSummary(previous, next);
}

export type ProofClientError = {
  code: string;
  status: number;
  retryable: boolean;
  message: string;
};

export function errorFromResponse(status: number, body: unknown): ProofClientError {
  try {
    const parsed = parseProofErrorResponse(body);
    return {
      code: parsed.error.code,
      status,
      retryable: parsed.error.retryable,
      message: parsed.error.messageKey,
    };
  } catch {
    const record = body && typeof body === "object" ? body as { error?: unknown } : null;
    const code = typeof record?.error === "string" ? record.error : "proof_request_failed";
    return { code, status, retryable: status === 503, message: code };
  }
}

export const PROOF_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function sanitizeDownloadBasename(name: string | null | undefined): string {
  const base = (name ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").replace(/\.docx$/i, "").trim();
  if (!base) return "Agmt_Proofread.docx";
  return `${base.slice(0, 80)}_Proofread.docx`;
}

export type UploadProgress = { sent: number; total: number };

export function putSourceWithProgress(input: {
  url: string;
  bytes: ArrayBuffer;
  onProgress: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", input.url);
    xhr.responseType = "json";
    xhr.setRequestHeader("content-type", PROOF_DOCX_MIME);
    xhr.setRequestHeader("content-length", String(input.bytes.byteLength));
    xhr.upload.onprogress = (event) => {
      input.onProgress({ sent: event.loaded, total: event.total || input.bytes.byteLength });
    };
    xhr.onload = () => {
      resolve(new Response(JSON.stringify(xhr.response ?? {}), { status: xhr.status, headers: { "content-type": "application/json" } }));
    };
    xhr.onerror = () => reject(new Error("connection_lost"));
    xhr.onabort = () => reject(new DOMException("The upload was cancelled.", "AbortError"));
    input.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(input.bytes);
  });
}
