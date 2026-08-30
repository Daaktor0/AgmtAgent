import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("web builds do not execute database migrations", () => {
  assert.equal(packageJson.scripts.build, "node scripts/with-app-env.mjs vite build");
  assert.equal(packageJson.scripts["db:migrate:release"], "node scripts/migrate.mjs");
  assert.doesNotMatch(packageJson.scripts.build, /migrat/i);
});
