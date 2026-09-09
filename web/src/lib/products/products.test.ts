import assert from "node:assert/strict";
import { test } from "node:test";
import { PRODUCTS, executableProduct, safeProofReturn } from "./registry.ts";
import { presentProofRun, selectedFileError } from "./proof-state.ts";
import { productHandler } from "../server/product-handlers.ts";
import { PROOF_UI_FIXTURES } from "./api-contracts.ts";

test("planned, unknown and disabled products cannot reach a processing handler", () => {
  assert.equal(executableProduct("proof"), "proof");
  assert.equal(typeof productHandler("proof", true), "function");
  assert.throws(() => productHandler("proof", false), /product_disabled/);
  for (const id of ["review", "signature-pack", "executed-copy", "other", null, { id: "proof" }]) assert.throws(() => productHandler(id, true), /product_unavailable/);
  assert.ok(PRODUCTS.filter((p) => p.availability === "planned").every((p) => p.route === null));
  for (const bad of ["https://example.com", "//example.com", "/\\example.com", "/proof?next=evil", "javascript:alert(1)", "/proof?run=short", undefined]) assert.equal(safeProofReturn(bad), "/");
  assert.equal(safeProofReturn("/proof"), "/proof");
  assert.equal(safeProofReturn("/proof?run=run_2f8c1a9b0d4e6f70"), "/proof?run=run_2f8c1a9b0d4e6f70");
});

test("typed run states show download only for ready and deny access at original deadline", () => {
  const verified = { auth: "verified" as const, uploadsPaused: false };
  for (const state of ["uploading", "scanning", "queued", "processing", "exporting", "ready_findings", "unsupported", "temporary_failure", "deleting", "deleted"] as const) {
    const fixture = PROOF_UI_FIXTURES.find((item) => item.state === state);
    assert.ok(fixture);
    const view = presentProofRun(fixture.run, verified);
    assert.equal(view.actions.download, state === "ready_findings");
    assert.equal(view.actions.delete, !["uploading", "deleting", "deleted"].includes(state));
  }
  const limited = presentProofRun(PROOF_UI_FIXTURES.find((item) => item.state === "limited")!.run, verified);
  assert.match(limited.heading, /limited coverage/);
  const expired = presentProofRun(PROOF_UI_FIXTURES.find((item) => item.state === "expired_not_verified")!.run, verified);
  assert.match(expired.heading, /expired/);
  assert.equal(expired.actions.download, false);
  assert.equal(selectedFileError({ name: "Agreement.docx", size: 25 * 1024 * 1024 }), null);
  for (const f of [{ name: "a.pdf", size: 1 }, { name: "a.docx", size: 0 }, { name: "a.docx", size: 25 * 1024 * 1024 + 1 }]) assert.ok(selectedFileError(f));
});
