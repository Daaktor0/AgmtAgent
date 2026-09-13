import assert from "node:assert/strict";
import { test } from "node:test";
import { runProofWorkerJob, type ProofWorkerLike } from "./job.ts";
import { PROOF_LOCAL_MAX_PROCESSING_MS } from "./limits.ts";
import { PROOF_LOCAL_POLICY_VERSION } from "./policy.ts";
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

function processIdOf(worker: { messages: ProofWorkerRequest[] }): string {
  const first = worker.messages[0];
  return first && first.type === "process" ? first.id : "";
}

function doneResponse(id: string): ProofWorkerResponse {
  return {
    type: "done",
    id,
    output: new Uint8Array([1, 2, 3]).buffer,
    summary: {
      sourceBytes: 4,
      outputBytes: 3,
      corrections: 1,
      comments: 0,
      notices: 0,
      coverage: "complete",
      coverageLines: [],
      findings: [{ ruleId: "language.typo_allowlist", kind: "correction", quote: "teh", replacement: "the" }],
      requestedProfile: "agreement",
      appliedProfile: "agreement",
      profileReason: null,
      ruleSetVersion: "proof-launch-v1",
      spellingActionPolicyVersion: "proof-spelling-action-v1",
      admit: {
        model: "proof-browser-local-v1",
        version: PROOF_LOCAL_POLICY_VERSION,
        clamav: "cannot_run_in_browser",
        status: "structurally_admitted",
        reason: "local_zip_xml_active_content_and_eicar_only",
        byteSize: 4,
        capacityClass: "desktop",
      },
      sdkInBrowser: false,
      wordInBrowser: false,
      clamavInBrowser: false,
    },
  };
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

test("cancel during a silent synchronous stage still settles by terminating the worker", async () => {
  const worker = fakeWorker();
  const job = runProofWorkerJob(worker, {
    bytes: new Uint8Array([0x50, 0x4b]),
    profile: "agreement",
    language: "en-GB",
  });
  // The fake worker never handles "cancel" — the same situation as a worker
  // blocked inside analyzeProof/exportProofDocx. Host terminate must settle it.
  job.cancel();
  await assert.rejects(job.done, /cancelled/);
  assert.equal(worker.terminated, true);
  assert.equal(worker.onmessage, null);
});

test("a late done message after cancel does not resolve or become downloadable", async () => {
  const worker = fakeWorker();
  const job = runProofWorkerJob(worker, {
    bytes: new Uint8Array([0x50, 0x4b]),
    profile: "agreement",
    language: "en-GB",
  });
  const id = processIdOf(worker);
  let resolved = false;
  const pending = job.done.then((result) => {
    resolved = true;
    return result;
  });
  job.cancel();
  worker.emit(doneResponse(id));
  await assert.rejects(pending, /cancelled/);
  assert.equal(resolved, false);
});

test("a cancelled worker message after cancel does not reject twice", async () => {
  const worker = fakeWorker();
  const job = runProofWorkerJob(worker, {
    bytes: new Uint8Array([0x50, 0x4b]),
    profile: "agreement",
    language: "en-GB",
  });
  job.cancel();
  await assert.rejects(job.done, /cancelled/);
  worker.emit({ type: "cancelled", id: processIdOf(worker) });
});

test("timeout terminates the worker and rejects with proof_timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const worker = fakeWorker();
  const job = runProofWorkerJob(worker, {
    bytes: new Uint8Array([0x50, 0x4b]),
    profile: "agreement",
    language: "en-GB",
  });
  t.mock.timers.tick(PROOF_LOCAL_MAX_PROCESSING_MS);
  await assert.rejects(job.done, (error: Error) => error.message === "proof_timeout");
  assert.equal(worker.terminated, true);
});

test("cancel then a second job on a fresh worker can succeed", async () => {
  const first = fakeWorker();
  const cancelled = runProofWorkerJob(first, {
    bytes: new Uint8Array([0x50, 0x4b]),
    profile: "agreement",
    language: "en-GB",
  });
  cancelled.cancel();
  await assert.rejects(cancelled.done, /cancelled/);
  assert.equal(first.terminated, true);

  const second = fakeWorker();
  const next = runProofWorkerJob(second, {
    bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    profile: "agreement",
    language: "en-GB",
  });
  second.emit(doneResponse(processIdOf(second)));
  const result = await next.done;
  assert.equal(result.corrections, 1);
  assert.equal(result.output.byteLength, 3);
  assert.equal(first.terminated, true);
  assert.notEqual(first, second);
});
