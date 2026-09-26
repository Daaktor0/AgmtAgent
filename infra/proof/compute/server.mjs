#!/usr/bin/env node
/**
 * Isolated scan HTTP entry. No database, no R2 credentials, no model keys.
 * Freshclam runs at image build; this process does not contact the network.
 */
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.PORT ?? 8080);
const SIGNATURE_FILE = process.env.PROOF_SIGNATURE_BUILT_AT ?? "/proof/SIGNATURE_BUILT_AT";

function signatureAgeHours(now = Date.now()) {
  if (!existsSync(SIGNATURE_FILE)) return Number.POSITIVE_INFINITY;
  const built = Number(readFileSync(SIGNATURE_FILE, "utf8").trim());
  if (!Number.isFinite(built) || built <= 0) return Number.POSITIVE_INFINITY;
  return (now - built) / 3_600_000;
}

function receipt(status, sourceSha256, byteSize, extra = {}) {
  const version = spawnSync("clamscan", ["--version"], { encoding: "utf8" });
  return {
    version: "proof-scan-receipt-v1",
    sourceSha256,
    byteSize,
    engineVersion: (version.stdout ?? "clamscan").trim().slice(0, 120) || "clamscan",
    signatureVersion: existsSync(SIGNATURE_FILE) ? readFileSync(SIGNATURE_FILE, "utf8").trim() : "unknown",
    scannedAt: Date.now(),
    status,
    ...extra,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) {
        reject(new Error("source_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://scan.local");
    if (req.method === "GET" && url.pathname === "/health") {
      const which = spawnSync("clamscan", ["--version"], { encoding: "utf8" });
      const age = signatureAgeHours();
      const ready = which.status === 0 && age <= 24;
      json(res, ready ? 200 : 503, {
        ready,
        signatureAgeHours: Number.isFinite(age) ? age : null,
        engine: (which.stdout ?? "").trim().slice(0, 120),
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/scan") {
      const age = signatureAgeHours();
      if (age > 24) {
        const bytes = await readBody(req).catch(() => Buffer.alloc(0));
        json(res, 503, receipt("stale_signatures", createHash("sha256").update(bytes).digest("hex"), bytes.byteLength));
        return;
      }
      const bytes = await readBody(req);
      const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
      const path = join(tmpdir(), `proof-scan-${randomBytes(8).toString("hex")}`);
      writeFileSync(path, bytes);
      try {
        const which = spawnSync("clamscan", ["--version"], { encoding: "utf8" });
        if (which.status !== 0) {
          json(res, 503, receipt("scanner_unavailable", sourceSha256, bytes.byteLength));
          return;
        }
        const scanned = spawnSync("clamscan", ["--no-summary", "--stdout", "--infected", path], {
          encoding: "utf8",
          timeout: 60_000,
        });
        const infected = scanned.status === 1 || /FOUND/.test(scanned.stdout ?? "");
        const status = infected ? "infected" : scanned.status === 0 ? "clean" : "failed";
        json(res, status === "clean" ? 200 : 400, receipt(status, sourceSha256, bytes.byteLength));
      } finally {
        try { unlinkSync(path); } catch { /* tmpfs cleanup */ }
      }
      return;
    }
    json(res, 404, { error: "not_found" });
  } catch {
    json(res, 500, receipt("failed", "", 0));
  }
});

server.listen(PORT, "0.0.0.0");
