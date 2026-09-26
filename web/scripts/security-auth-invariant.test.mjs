import { access, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

const authSource = await readFile(
  new URL("../src/lib/auth/server.ts", import.meta.url),
  "utf8",
);
const signInSource = await readFile(
  new URL("../src/components/execute/access-gate.tsx", import.meta.url),
  "utf8",
);
const resendSource = await readFile(
  new URL("../src/lib/auth/resend.server.ts", import.meta.url),
  "utf8",
);

test("deployed auth does not derive or bake credentials", () => {
  assert.match(authSource, /BETTER_AUTH_SECRET/);
  assert.match(authSource, /sendVerificationEmail/);
  assert.match(resendSource, /RESEND_API_KEY/);
  assert.match(resendSource, /api\.resend\.com\/emails/);
  assert.doesNotMatch(authSource, /genericOAuth|GROK_AUTH|GROK_PROVIDERS/);
  assert.doesNotMatch(signInSource, /Google|Continue with|oauth2|magic/i);
  assert.doesNotMatch(authSource, /previewSecret|derived.*secret|test-access/i);
});

for (const relativePath of [
  "../src/lib/auth/gate-session.server.ts",
  "../src/lib/auth/preview.ts",
  "../src/lib/fn/test-access.ts",
]) {
  test(`legacy auth source is absent: ${relativePath}`, async () => {
    await assert.rejects(access(new URL(relativePath, import.meta.url)));
  });
}
