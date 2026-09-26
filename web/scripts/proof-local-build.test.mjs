import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(webRoot, ".output/public/assets");

test("deployed client build keeps Proof processing in a worker without ClamAV or envelope crypto", () => {
  if (!existsSync(assets)) {
    assert.ok(true, "no cloudflare build in this run");
    return;
  }
  const files = readdirSync(assets);
  const worker = files.find((name) => name.startsWith("proof.worker-") && name.endsWith(".js"));
  const copy = files.find((name) => name.startsWith("copy-") && name.endsWith(".js"));
  assert.ok(worker, "proof worker asset missing");
  const workerJs = readFileSync(join(assets, worker), "utf8");
  assert.match(workerJs, /cannot_run_in_browser/);
  assert.match(workerJs, /network_forbidden/);
  assert.doesNotMatch(workerJs, /createCipheriv/);
  assert.doesNotMatch(workerJs, /hstgr\.cloud/);
  assert.doesNotMatch(workerJs, /ClamAV/);
  assert.doesNotMatch(workerJs, /runtime-env\.server/);
  if (copy) {
    const copyJs = readFileSync(join(assets, copy), "utf8");
    assert.match(copyJs, /Choose a Word document/);
    assert.match(copyJs, /processed on this device/);
    assert.doesNotMatch(copyJs, /within two hours of upload/);
  }
});
