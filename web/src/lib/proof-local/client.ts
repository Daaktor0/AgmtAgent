import type { ProofLanguage, ProofProfile } from "../products/capabilities.ts";
import { installDocumentExfiltrationGuard } from "./isolation.ts";
import { PROOF_LOCAL_MAX_PROCESSING_MS } from "./limits.ts";
import type { LocalProofResult, LocalProofStage } from "./pipeline.ts";
import type { ProofWorkerRequest, ProofWorkerResponse } from "./protocol.ts";
import ProofWorker from "./proof.worker.ts?worker";

export type LocalProofJob = {
  cancel: () => void;
  done: Promise<LocalProofResult>;
};

function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function processProofInWorker(input: {
  bytes: Uint8Array;
  profile: ProofProfile;
  language: ProofLanguage;
  onStage?: (stage: LocalProofStage) => void;
}): LocalProofJob {
  const worker = new ProofWorker();
  const id = newId();
  const copy = input.bytes.slice();
  const restoreFetch = installDocumentExfiltrationGuard(copy);
  let settled = false;
  let timer: number | undefined;

  const finish = () => {
    if (timer != null) window.clearTimeout(timer);
    restoreFetch();
    worker.terminate();
  };

  const done = new Promise<LocalProofResult>((resolve, reject) => {
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      finish();
      reject(error);
    };
    worker.onmessage = (event: MessageEvent<ProofWorkerResponse>) => {
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
    timer = window.setTimeout(() => {
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
      if (!settled) {
        settled = true;
        finish();
      }
    },
  };
}
