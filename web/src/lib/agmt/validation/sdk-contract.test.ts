import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SDK_PACKAGE_LICENSE,
  SDK_PACKAGE_VERSION,
  SDK_TARGET_OFFICE,
  parseSdkValidationResult,
  sdkRuntimeUnavailable,
} from "./sdk-contract.ts";

test("PWC-12 SDK results are closed enums and hashes; diagnostics are rejected", () => {
  assert.equal(SDK_PACKAGE_VERSION, "3.5.1");
  assert.equal(SDK_PACKAGE_LICENSE, "MIT");
  const ok = parseSdkValidationResult({
    version: "proof-sdk-validator-v1",
    valid: true,
    code: "ok",
    errorCount: 0,
    sourceSha256: "a".repeat(64),
    outputSha256: "b".repeat(64),
    target: SDK_TARGET_OFFICE,
  });
  assert.equal(ok.valid, true);
  assert.throws(() => parseSdkValidationResult({ ...ok, diagnostics: "schema boom" }));
  assert.throws(() => parseSdkValidationResult({ ...ok, valid: false, code: "ok" }));
  const unavailable = sdkRuntimeUnavailable({
    sourceSha256: "a".repeat(64),
    outputSha256: "b".repeat(64),
    target: SDK_TARGET_OFFICE,
  });
  assert.equal(unavailable.code, "runtime_unavailable");
  assert.equal(unavailable.valid, false);
});
