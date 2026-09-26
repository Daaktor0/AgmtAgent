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
  assert.match(source, /This file exceeds the \\d\+ MiB\(\?: size\)\? limit/);
  assert.match(source, /domcontentloaded/);
  assert.match(source, /AGMT_PROOF_INTERACTIVE === "1"/);
  assert.doesNotMatch(source, /interactive: process.env.AGMT_PROOF_INTERACTIVE === "1" \|\|/);
  assert.match(source, /testingPlatformInjections/);
  assert.match(source, /signed_out_page_only_processing_not_observed/);
  assert.match(source, /rev-parse", "origin\/main"/);
  assert.match(source, /\.trim\(\)\.replace\(\/\^\["'\]\|\["'\]\$\/g/);
  assert.match(source, /sign_in_rejected/);
  assert.match(source, /waitLoginFormInteractive/);
  assert.match(source, /sign-in/);
});
