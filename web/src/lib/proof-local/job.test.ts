import assert from "node:assert/strict";
import { test } from "node:test";
import { runProofWorkerJob, type ProofWorkerLike } from "./job.ts";
import type { ProofWorkerRequest, ProofWorkerResponse } from "./protocol.ts";

function fakeWorker(): ProofWorkerLike & {
  terminated: boolean;
  messages: ProofWorkerRequest[];
  emit(data: ProofWorkerResponse): void;
} {
  const worker: ProofWorkerLike & {
    terminated: boolean;
    messages: ProofWorkerRequest[];
    emit(data: ProofWorkerResponse): void;
  } = {
    terminated: false,
    messages: [],
    onmessage: null,
    onerror: null,
    postMessage(message) {
      this.messages.push(message);
    },
    terminate() {
      this.terminated = true;
    },
    emit(data) {
      this.onmessage?.({ data });
    },
  };
  return worker;
}

test("cancel rejects the job and terminates the worker instead of leaving the promise hanging", async () => {
  const worker = fakeWorker();
  const job = runProofWorkerJob(worker, {
    bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    profile: "agreement",
    language: "en-GB",
  });
  assert.equal(worker.messages[0]?.type, "process");
  job.cancel();
  await assert.rejects(job.done, (error: Error) => error.name === "AbortError" && error.message === "cancelled");
  assert.equal(worker.terminated, true);
  assert.equal(worker.messages.at(-1)?.type, "cancel");
});

test("a cancelled worker message after cancel does not reject twice", async () => {
  const worker = fakeWorker();
  const job = runProofWorkerJob(worker, {
    bytes: new Uint8Array([0x50, 0x4b]),
    profile: "agreement",
    language: "en-GB",
  });
  const processId = worker.messages[0] && worker.messages[0].type === "process" ? worker.messages[0].id : "";
  job.cancel();
  await assert.rejects(job.done, /cancelled/);
  worker.emit({ type: "cancelled", id: processId });
});
