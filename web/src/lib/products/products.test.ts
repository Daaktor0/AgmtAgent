import assert from "node:assert/strict";
import { test } from "node:test";
import { PRODUCTS, executableProduct, safeProofReturn } from "./registry.ts";
import { proofView, selectedFileError } from "./proof-state.ts";
import { productHandler } from "../server/product-handlers.ts";
import { proofDeadlines } from "../server/retention.ts";
import type { RunStatus, RunSummary } from "./contracts.ts";

test("planned, unknown and disabled products cannot reach a processing handler", () => {
  assert.equal(executableProduct("proof"), "proof");
  assert.equal(typeof productHandler("proof", true), "function");
  assert.throws(() => productHandler("proof", false), /product_disabled/);
  for (const id of ["review", "signature-pack", "executed-copy", "other", null, { id: "proof" }]) assert.throws(() => productHandler(id, true), /product_unavailable/);
  assert.ok(PRODUCTS.filter((p) => p.availability === "planned").every((p) => p.route === null));
  for (const bad of ["https://example.com", "//example.com", "/\\example.com", "/proof?next=evil", "javascript:alert(1)", undefined]) assert.equal(safeProofReturn(bad), "/");
  assert.equal(safeProofReturn("/proof"), "/proof");
});

test("typed run states show download only for ready and deny access at original deadline", () => {
  const run: RunSummary = { runId: "synthetic", productId: "proof", status: "ready", deadlines: proofDeadlines(1000), serverNow: 2000, correctionCount: 2, commentCount: 2, coverage: "complete", deletionVerifiedAt: null };
  for (const status of ["uploading", "scanning", "queued", "processing", "exporting", "ready", "rejected", "failed", "deleting", "deleted"] as RunStatus[]) {
    const view = proofView({ ...run, status }, 2000);
    assert.equal(view.download, status === "ready");
    assert.equal(view.delete, !["deleting", "deleted"].includes(status));
  }
  assert.match(proofView({ ...run, coverage: "limited" }, 2000).message, /incomplete/);
  assert.match(proofView(run, run.deadlines.accessDeadline).message, /no longer available/);
  assert.equal(proofView(run, run.deadlines.accessDeadline).download, false);
  assert.equal(selectedFileError({ name: "Agreement.docx", size: 25 * 1024 * 1024 }), null);
  for (const f of [{ name: "a.pdf", size: 1 }, { name: "a.docx", size: 0 }, { name: "a.docx", size: 25 * 1024 * 1024 + 1 }]) assert.ok(selectedFileError(f));
});
