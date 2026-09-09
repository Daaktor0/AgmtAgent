import assert from "node:assert/strict";
import { test } from "node:test";
import { mayAdvanceAfterScan, unavailableScanReceipt } from "./proof-scan-receipt.ts";

test("PWC-22 local scan receipt never treats a missing scanner as clean", () => {
  const receipt = unavailableScanReceipt({ sourceSha256: "a".repeat(64), byteSize: 12, now: 1 });
  assert.equal(receipt.status, "scanner_unavailable");
  assert.equal(mayAdvanceAfterScan(receipt), false);
  assert.equal(mayAdvanceAfterScan(null), false);
  assert.equal(mayAdvanceAfterScan({ ...receipt, status: "clean" }), true);
});
