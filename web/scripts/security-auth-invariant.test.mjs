import { access, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

const sessionSource = await readFile(
  new URL("../src/lib/server/session.ts", import.meta.url),
  "utf8",
);
const authSource = await readFile(
  new URL("../src/lib/auth/server.ts", import.meta.url),
  "utf8",
);
const loginSource = await readFile(
  new URL("../src/routes/login.tsx", import.meta.url),
  "utf8",
);

test("production auth has no anonymous test-session path", () => {
  assert.doesNotMatch(sessionSource, /openAnonymousTestSession/);
  assert.doesNotMatch(sessionSource, /temporary_test_access/);
  assert.doesNotMatch(sessionSource, /test\.agmt\.local/);
  assert.doesNotMatch(loginSource, /test workspace/i);
});

test("deployed auth does not derive or bake credentials", () => {
  assert.match(authSource, /BETTER_AUTH_SECRET/);
  assert.match(authSource, /GROK_AUTH_CLIENT_SECRET/);
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
