import assert from "node:assert/strict";
import { test } from "node:test";
import { containsEicar, EICAR_SIGNATURE, unprovisionedAntivirus } from "./proof-antivirus.ts";

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
