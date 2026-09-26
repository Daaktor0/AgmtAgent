import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PROOF_REMOTE_MODE_ENABLED, remoteProofProcessingAllowed } from "./remote-mode.ts";

test("remote/R2 processing stays disabled and does not ship credentials", async () => {
  assert.equal(PROOF_REMOTE_MODE_ENABLED, false);
  assert.equal(remoteProofProcessingAllowed({ selectedByUser: true, privacyCopyVersion: "test" }), false);
  const source = await readFile(new URL("./remote-mode.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /AGMT_OBJECTS|R2_SECRET|aws_secret|api[_-]?key/i);
  assert.match(source, /processProofLocal/);
});
