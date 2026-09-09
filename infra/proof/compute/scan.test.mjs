import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scan = fileURLToPath(new URL("./scan.mjs", import.meta.url));

test("PWC-22 scan entry emits scanner_unavailable when ClamAV is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "proof-scan-"));
  const file = join(dir, "sample.bin");
  writeFileSync(file, "PK\u0003\u0004synthetic");
  const result = spawnSync(process.execPath, [scan, file], {
    encoding: "utf8",
    env: { ...process.env, CLAMSCAN_BIN: join(dir, "missing-clamscan") },
  });
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "scanner_unavailable");
  assert.notEqual(receipt.status, "clean");
  assert.equal(result.status, 3);
});
