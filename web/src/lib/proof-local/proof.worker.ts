/// <reference lib="webworker" />
import { ensureBrowserBuffer } from "../platform/buffer.ts";
import { installProofWorkerIsolation } from "./isolation.ts";
import { processProofLocal } from "./pipeline.ts";
import type { ProofWorkerRequest, ProofWorkerResponse } from "./protocol.ts";

ensureBrowserBuffer();
const isolation = installProofWorkerIsolation();

const worker = self as DedicatedWorkerGlobalScope;
let current: AbortController | null = null;
let currentId: string | null = null;

function post(message: ProofWorkerResponse, transfer: Transferable[] = []): void {
  worker.postMessage(message, transfer);
}

worker.addEventListener("message", async (event: MessageEvent<ProofWorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") {
    if (currentId === message.id) {
      current?.abort();
      post({ type: "cancelled", id: message.id });
    }
    return;
  }
  if (message.type !== "process") return;
  current?.abort();
  current = new AbortController();
  currentId = message.id;
  const signal = current.signal;
  try {
    const bytes = new Uint8Array(message.bytes);
    const result = await processProofLocal(bytes, {
      profile: message.profile,
      language: message.language,
      signal,
      onStage: (stage) => {
        if (isolation.networkAttempts.length) throw new Error("network_forbidden");
        post({ type: "progress", id: message.id, stage });
      },
    });
    if (signal.aborted) {
      post({ type: "cancelled", id: message.id });
      return;
    }
    if (isolation.networkAttempts.length || isolation.storageWrites.length) {
      throw new Error("isolation_violated");
    }
    const copy = new Uint8Array(result.output.byteLength);
    copy.set(result.output);
    const { output: _omit, ...summary } = result;
    post({ type: "done", id: message.id, output: copy.buffer, summary }, [copy.buffer]);
  } catch (error) {
    if (signal.aborted || (error instanceof Error && (error.message === "cancelled" || error.name === "AbortError"))) {
      post({ type: "cancelled", id: message.id });
      return;
    }
    post({ type: "error", id: message.id, code: error instanceof Error ? error.message : "proof_failed" });
  } finally {
    if (currentId === message.id) {
      current = null;
      currentId = null;
    }
  }
});
