#!/usr/bin/env node
/**
 * Isolated scan entry (PWC-22). Fail closed when ClamAV is missing.
 * Structural ZIP inspection is not a clean antivirus receipt.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function receipt(status, sourceSha256, byteSize) {
  return {
    version: "proof-scan-receipt-v1",
    sourceSha256,
    byteSize,
    engineVersion: process.env.PROOF_SCAN_ENGINE ?? "unprovisioned",
    signatureVersion: process.env.PROOF_SCAN_SIGNATURES ?? "unprovisioned",
    scannedAt: Date.now(),
    status,
  };
}

const path = process.argv[2];
if (!path) {
  process.stdout.write(JSON.stringify(receipt("failed", "", 0)) + "\n");
  process.exit(2);
}

const bytes = readFileSync(path);
const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
const clam = process.env.CLAMSCAN_BIN ?? "clamscan";
const which = spawnSync(clam, ["--version"], { encoding: "utf8" });
if (which.status !== 0) {
  process.stdout.write(JSON.stringify(receipt("scanner_unavailable", sourceSha256, bytes.byteLength)) + "\n");
  process.exit(3);
}

const scanned = spawnSync(clam, ["--no-summary", "--stdout", path], { encoding: "utf8", timeout: 60_000 });
const infected = scanned.status === 1 || /FOUND/.test(scanned.stdout ?? "");
const status = infected ? "infected" : scanned.status === 0 ? "clean" : "failed";
process.stdout.write(JSON.stringify(receipt(status, sourceSha256, bytes.byteLength)) + "\n");
process.exit(status === "clean" ? 0 : 4);
