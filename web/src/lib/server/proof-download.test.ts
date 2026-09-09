import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ProofDownloadError,
  signProofDownloadTicket,
  ticketExpiry,
  unsafeProofRedirect,
  verifyProofDownloadTicket,
} from "./proof-download.ts";

const SECRET = "local-test-download-secret";
const NOW = 1_800_000_000_000;
const claims = {
  runId: "run_2f8c1a9b0d4e6f70",
  ownerUserId: "owner-a",
  tenantId: "tenant-1",
  generation: 3,
  outputArtifactId: "art_output_1",
  expiresAt: NOW + 60_000,
};

test("PWC-28 local tickets reject tamper, replay-after-expiry, old generation and unsafe redirects", () => {
  const token = signProofDownloadTicket(claims, SECRET);
  assert.equal(verifyProofDownloadTicket(token, SECRET, NOW, claims).runId, claims.runId);
  assert.throws(() => verifyProofDownloadTicket(token.slice(0, -2) + "zz", SECRET, NOW, claims), ProofDownloadError);
  assert.throws(() => verifyProofDownloadTicket(token, SECRET, claims.expiresAt, claims), ProofDownloadError);
  assert.throws(() => verifyProofDownloadTicket(token, SECRET, NOW, { ...claims, generation: 4 }), ProofDownloadError);
  assert.equal(ticketExpiry(NOW, NOW + 10_000), NOW + 10_000);
  assert.equal(unsafeProofRedirect("https://example.com"), true);
  assert.equal(unsafeProofRedirect("/proof?run=run_2f8c1a9b0d4e6f70"), false);
});
