import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "proof-production-journey.mjs"), "utf8");

test("production journey waits for Proof controls and states, not networkidle", () => {
  assert.doesNotMatch(source, /waitUntil:\s*["']networkidle["']/);
  assert.doesNotMatch(source, /waitForLoadState\(\s*["']networkidle["']/);
  assert.match(source, /getByLabel\("Choose a Word document"\)/);
  assert.match(source, /getByRole\("button", \{ name: "Proofread document" \}\)/);
  assert.match(source, /Processing happens on this device/);
  assert.match(source, /Your proofread document is ready/);
  assert.match(source, /Checking was cancelled/);
  assert.match(source, /This file exceeds the 1 MiB limit/);
  assert.match(source, /domcontentloaded/);
});
