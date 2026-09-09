import assert from "node:assert/strict";
import { test } from "node:test";
import {
  containsEicar,
  EICAR_SIGNATURE,
  PROOF_HOSTINGER_COMPUTE_ALLOWED,
  clamavHttpAntivirus,
  proofScanEndpointAllowed,
  resolveProofAntivirus,
  unprovisionedAntivirus,
} from "./proof-antivirus.ts";

test("PWC-22 EICAR is infected and missing ClamAV is never clean", async () => {
  const av = unprovisionedAntivirus();
  const clean = await av.scan({ bytes: Buffer.from("PK\u0003\u0004"), sourceSha256: "a".repeat(64), byteSize: 4, now: 1 });
  assert.equal(clean.status, "scanner_unavailable");
  assert.equal(await av.healthy(1), false);
  const eicar = Buffer.from(EICAR_SIGNATURE);
  assert.equal(containsEicar(eicar), true);
  const infected = await av.scan({ bytes: eicar, sourceSha256: "b".repeat(64), byteSize: eicar.byteLength, now: 1 });
  assert.equal(infected.status, "infected");
});

test("shared Hostinger VPS is never an allowed scan endpoint", async () => {
  assert.equal(PROOF_HOSTINGER_COMPUTE_ALLOWED, false);
  assert.equal(proofScanEndpointAllowed("https://scan.example.test/"), true);
  assert.equal(proofScanEndpointAllowed("https://srv1086106.hstgr.cloud/scan"), false);
  assert.equal(proofScanEndpointAllowed("http://31.97.230.149:8080"), false);
  assert.equal(proofScanEndpointAllowed("https://n8n-3ygp.srv1086106.hstgr.cloud/"), false);
  assert.equal(proofScanEndpointAllowed("http://[2a02:4780:12:9454::1]/scan"), false);
  assert.equal(proofScanEndpointAllowed("not-a-url"), false);

  let fetches = 0;
  const fetchImpl: typeof fetch = async () => {
    fetches += 1;
    return new Response("should-not-run", { status: 500 });
  };
  const blocked = resolveProofAntivirus("https://hermes-agent-fqx5.srv1086106.hstgr.cloud/scan", fetchImpl);
  const scanned = await blocked.scan({
    bytes: Buffer.from("PK\u0003\u0004"),
    sourceSha256: "c".repeat(64),
    byteSize: 4,
    now: 1,
  });
  assert.equal(scanned.status, "scanner_unavailable");
  assert.equal(await blocked.healthy(1), false);
  assert.equal(fetches, 0);
  const direct = clamavHttpAntivirus("http://31.97.230.149:32768", fetchImpl);
  assert.equal((await direct.scan({ bytes: Buffer.from("PK"), sourceSha256: "d".repeat(64), byteSize: 2, now: 1 })).status, "scanner_unavailable");
  assert.equal(fetches, 0);

  const allowed = resolveProofAntivirus("https://scan.example.test", async () => Response.json({ ready: true, signatureAgeHours: 1 }));
  assert.equal(await allowed.healthy(1), true);
});
