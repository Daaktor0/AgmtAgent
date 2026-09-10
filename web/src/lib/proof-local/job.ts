import type { ProofLanguage, ProofProfile } from "../products/capabilities.ts";
import { installDocumentExfiltrationGuard } from "./isolation.ts";
import { PROOF_LOCAL_MAX_PROCESSING_MS } from "./limits.ts";
import type { LocalProofResult, LocalProofStage } from "./pipeline.ts";
import type { ProofWorkerRequest, ProofWorkerResponse } from "./protocol.ts";

export type LocalProofJob = {
  cancel: () => void;
  done: Promise<LocalProofResult>;
};

export type ProofWorkerLike = {
  postMessage: (message: ProofWorkerRequest, transfer?: Transferable[]) => void;
  terminate: () => void;
  onmessage: ((event: { data: ProofWorkerResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
};

function newId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Browser worker job controller. The engine itself lives in processProofLocal
 * and can be called from Node or a future explicit server/R2 adapter.
 */
export function runProofWorkerJob(worker: ProofWorkerLike, input: {
  bytes: Uint8Array;
  profile: ProofProfile;
  language: ProofLanguage;
  onStage?: (stage: LocalProofStage) => void;
}): LocalProofJob {
  const id = newId();
  const copy = input.bytes.slice();
  const restoreFetch = installDocumentExfiltrationGuard(copy);
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fail: (error: Error) => void = () => {};

  const finish = () => {
    if (timer != null) globalThis.clearTimeout(timer);
    restoreFetch();
    worker.terminate();
  };

  const done = new Promise<LocalProofResult>((resolve, reject) => {
    fail = (error: Error) => {
      if (settled) return;
      settled = true;
      finish();
      reject(error);
    };
    worker.onmessage = (event: { data: ProofWorkerResponse }) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === "progress") {
        input.onStage?.(message.stage);
        return;
      }
      if (message.type === "cancelled") {
        fail(Object.assign(new Error("cancelled"), { name: "AbortError" }));
        return;
      }
      if (message.type === "error") {
        fail(new Error(message.code));
        return;
      }
      if (message.type === "done") {
        if (settled) return;
        settled = true;
        finish();
        resolve({
          ...message.summary,
          output: new Uint8Array(message.output),
        });
      }
    };
    worker.onerror = (event) => {
      fail(new Error(event.message || "proof_failed"));
    };
    timer = globalThis.setTimeout(() => {
      fail(new Error("proof_timeout"));
    }, PROOF_LOCAL_MAX_PROCESSING_MS);
    const buffer = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
    const request: ProofWorkerRequest = {
      type: "process",
      id,
      bytes: buffer,
      profile: input.profile,
      language: input.language,
    };
    worker.postMessage(request, [buffer]);
  });

  return {
    done,
    cancel() {
      const request: ProofWorkerRequest = { type: "cancel", id };
      try { worker.postMessage(request); } catch { /* terminated */ }
      fail(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    },
  };
}
