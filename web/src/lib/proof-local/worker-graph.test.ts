import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isForbiddenProofWorkerImport,
  isProofWorkerImporter,
  rememberProofWorkerModule,
} from "./worker-graph.ts";

test("worker graph includes proof-local and remembered engine modules, not unrelated agmt files", () => {
  const graph = new Set<string>();
  assert.equal(isProofWorkerImporter("web/src/lib/proof-local/proof.worker.ts", graph), true);
  assert.equal(isProofWorkerImporter("web/src/lib/proof-local/pipeline.ts", graph), true);
  assert.equal(isProofWorkerImporter("web/src/lib/agmt/export/docx.ts", graph), false);
  rememberProofWorkerModule("web\\src\\lib\\agmt\\export\\docx.ts", graph);
  assert.equal(isProofWorkerImporter("web/src/lib/agmt/export/docx.ts", graph), true);
  assert.equal(isProofWorkerImporter("web/src/lib/agmt/crypto.ts", graph), false);
});

test("server-only modules stay forbidden in the worker graph", () => {
  assert.equal(isForbiddenProofWorkerImport("node:fs"), true);
  assert.equal(isForbiddenProofWorkerImport("../server/proof-antivirus.ts"), true);
  assert.equal(isForbiddenProofWorkerImport("../runtime-env.server.ts"), true);
  assert.equal(isForbiddenProofWorkerImport("../agmt/export/docx.ts"), false);
});
