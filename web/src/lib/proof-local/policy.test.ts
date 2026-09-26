import assert from "node:assert/strict";
import { test } from "node:test";
import { EXTRACTED_TEXT_LIMIT } from "../agmt/projection.ts";
import {
  PROOF_LOCAL_POLICY_DESKTOP,
  PROOF_LOCAL_POLICY_LAB,
  PROOF_LOCAL_POLICY_MOBILE,
  PROOF_LOCAL_POLICY_VERSION,
  selectProofCapacityPolicy,
} from "./policy.ts";

test("missing deviceMemory does not force a rejection-only policy", () => {
  const selected = selectProofCapacityPolicy({});
  assert.equal(selected.class, "desktop");
  assert.equal(selected.maxSourceBytes, PROOF_LOCAL_POLICY_DESKTOP.maxSourceBytes);
});

test("deviceMemory and coarse-pointer-like hints do not select mobile by themselves", () => {
  assert.equal(selectProofCapacityPolicy({ deviceMemoryGiB: 2 }).class, "desktop");
  assert.equal(selectProofCapacityPolicy({ deviceMemoryGiB: 8 }).class, "desktop");
  assert.equal(selectProofCapacityPolicy({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36" }).class, "desktop");
  assert.equal(selectProofCapacityPolicy({ prefersMobile: true }).class, "mobile");
  assert.equal(selectProofCapacityPolicy({ userAgentMobile: true }).class, "mobile");
  assert.equal(selectProofCapacityPolicy({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }).class, "mobile");
});

test("lab ceiling stays above published policy and is not the UI cap", () => {
  assert.ok(PROOF_LOCAL_POLICY_LAB.maxSourceBytes > PROOF_LOCAL_POLICY_DESKTOP.maxSourceBytes);
  assert.ok(PROOF_LOCAL_POLICY_LAB.maxSourceBytes >= 150 * 1024 * 1024);
  assert.equal(PROOF_LOCAL_POLICY_DESKTOP.label, "100 MiB");
  assert.equal(PROOF_LOCAL_POLICY_MOBILE.label, "8 MiB");
  assert.ok(PROOF_LOCAL_POLICY_MOBILE.maxSourceBytes < PROOF_LOCAL_POLICY_DESKTOP.maxSourceBytes);
  assert.ok(PROOF_LOCAL_POLICY_DESKTOP.zip.MAX_EXPANDED_BYTES >= PROOF_LOCAL_POLICY_DESKTOP.maxSourceBytes);
  assert.ok(PROOF_LOCAL_POLICY_DESKTOP.maxDocumentXmlBytes >= 8 * 1024 * 1024);
  assert.ok(PROOF_LOCAL_POLICY_DESKTOP.maxDocumentXmlBytes > 1 * 1024 * 1024);
  assert.ok(PROOF_LOCAL_POLICY_DESKTOP.maxProcessingMs >= 90_000);
  assert.equal(PROOF_LOCAL_POLICY_DESKTOP.zip.MAX_COMPRESSION_RATIO, 20);
  assert.equal(PROOF_LOCAL_POLICY_DESKTOP.maxExtractedCodePoints, EXTRACTED_TEXT_LIMIT);
  assert.equal(PROOF_LOCAL_POLICY_VERSION, "proof-local-limits-v3");
});
