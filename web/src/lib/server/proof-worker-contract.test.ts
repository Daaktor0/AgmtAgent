import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PROOF_WORKER_ENVELOPE_BYTES,
  PROOF_WORKER_ENVELOPE_VERSION,
  ProofWorkerContractError,
  buildProofWorkerEnvelope,
  validateProofWorkerEnvelope,
} from "./proof-worker-contract.ts";
import { parseRunSummaryV2, PROOF_UI_FIXTURES } from "../products/api-contracts.ts";
import { proofDeadlines } from "./retention.ts";

const envelopeInput = {
  runToken: "ab".repeat(16),
  tenantContextRef: "tctx_7k9m2p4q6s8u0w1y",
  attempt: 1,
  generation: 0,
  parserVersion: "proof-docx-v2",
  ruleSetVersion: "proof-launch-v1",
  exporterVersion: "proof-ooxml-v1",
  validatorVersion: "openxml-sdk-3",
  computeImageId: "proof-compute-sha-test",
};

const CANARY = "CONFIDENTIAL_CLIENT_SNIPPET Agreement.docx https://r2.example/source.docx";

test("PWC-02 metadata-only proof worker envelope round-trips under 2 KiB", () => {
  const envelope = buildProofWorkerEnvelope(envelopeInput);
  assert.equal(envelope.version, PROOF_WORKER_ENVELOPE_VERSION);
  const encoded = JSON.stringify(envelope);
  assert.ok(Buffer.byteLength(encoded, "utf8") <= MAX_PROOF_WORKER_ENVELOPE_BYTES);
  assert.deepEqual(validateProofWorkerEnvelope(JSON.parse(encoded)), envelope);
  assert.doesNotMatch(encoded, /filename|bytes|findings|snippet|https:\/\/|Agreement\.docx|CONFIDENTIAL/);
});

test("PWC-02 worker envelope rejects content canaries, URLs, tenant-supplied fields and oversize payloads", () => {
  assert.throws(() => validateProofWorkerEnvelope({ version: 1, ...envelopeInput, bytes: CANARY }), ProofWorkerContractError);
  assert.throws(() => validateProofWorkerEnvelope({ version: 1, ...envelopeInput, sourceUrl: "https://r2.example/source.docx" }), ProofWorkerContractError);
  assert.throws(() => validateProofWorkerEnvelope({ version: 1, ...envelopeInput, filename: "Agreement.docx" }), ProofWorkerContractError);
  assert.throws(() => validateProofWorkerEnvelope({ version: 1, ...envelopeInput, tenantId: "client-tenant" }), ProofWorkerContractError);
  assert.throws(() => validateProofWorkerEnvelope({ version: 1, ...envelopeInput, findings: [{ quote: CANARY }] }), ProofWorkerContractError);
  assert.throws(() => validateProofWorkerEnvelope({ version: 1, ...envelopeInput, attempt: 4 }), ProofWorkerContractError);
  assert.throws(() => validateProofWorkerEnvelope({ version: 2, ...envelopeInput }), ProofWorkerContractError);
  const huge = { version: 1, ...envelopeInput, computeImageId: "x".repeat(3000) };
  assert.throws(() => validateProofWorkerEnvelope(huge), ProofWorkerContractError);
});

test("PWC-02 queue adapter fixture never leaks a content canary through API summary JSON", () => {
  const envelope = buildProofWorkerEnvelope(envelopeInput);
  const ready = PROOF_UI_FIXTURES.find((f) => f.state === "ready_findings")!.run!;
  const apiJson = JSON.stringify({ envelope, summary: parseRunSummaryV2(ready), deadlines: proofDeadlines(1_800_000_000_000) });
  assert.doesNotMatch(apiJson, /CONFIDENTIAL|Agreement\.docx|r2\.example|exactQuote|w:t|tenant-from-client/);
  assert.match(apiJson, /"version":1/);
  assert.match(apiJson, /"apiVersion":2/);
});
