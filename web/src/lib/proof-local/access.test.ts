import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PROOF_LOCAL_NO_ACCOUNT } from "./copy.ts";
import { PROOF_REMOTE_MODE_ENABLED, remoteProofProcessingAllowed } from "./remote-mode.ts";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../../..");

function readWeb(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), "utf8");
}

test("founder exception: local Proof is usable without a session", () => {
  const local = readWeb("src/components/agmt/proof-local.tsx");
  const intro = readWeb("src/components/agmt/proof-intro.tsx");
  const copy = readWeb("src/lib/proof-local/copy.ts");
  assert.equal(
    PROOF_LOCAL_NO_ACCOUNT,
    "No account required. Your document is processed on this device and isn’t sent to Agmt.",
  );
  assert.match(copy, /PROOF_LOCAL_NO_ACCOUNT/);
  assert.match(intro, /PROOF_LOCAL_NO_ACCOUNT/);
  assert.match(local, /PROOF_LOCAL_NO_ACCOUNT/);
  assert.doesNotMatch(local, /useCurrentUserState|ProofAccessGate|authKind/);
  assert.doesNotMatch(local, /auth !== "verified"|auth === "verified"/);
  assert.match(local, /disabled=\{!file \|\| busy\}/);
  assert.match(local, /if \(!file\) return;/);
});

test("founder exception is recorded and remains local to browser-only Proof", () => {
  const agents = readWeb("AGENTS.md");
  assert.match(agents, /Founder exception \(temporary\)/);
  assert.match(agents, /browser-only local Proof/);
  assert.match(agents, /must not wait for `get-session`/);
  assert.match(agents, /does not authorise anonymous server storage/);
  assert.match(agents, /Keep authentication enabled by default for accounts/);
});

test("anonymous local Proof does not weaken server auth or enable remote mode", () => {
  const api = readWeb("src/routes/api/proof/$.ts");
  const middleware = readWeb("src/lib/auth/middleware.ts");
  const authorization = readWeb("src/lib/server/proof-authorization.ts");
  const session = readWeb("src/lib/server/session.ts");
  assert.match(api, /requireUserId/);
  assert.match(middleware, /requireUserId/);
  assert.match(authorization, /VERIFIED_ACTIONS/);
  assert.doesNotMatch(session, /openAnonymousTestSession|temporary_test_access/);
  assert.equal(PROOF_REMOTE_MODE_ENABLED, false);
  assert.equal(remoteProofProcessingAllowed(), false);
});
