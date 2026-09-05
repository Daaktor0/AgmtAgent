import assert from "node:assert/strict";
import { test } from "node:test";
import { proofDeadlines, assertProofDeadlines, canStartProofAttempt, canPublishProof, downloadGrantSeconds, uploadGrantOpen, purgeDue } from "./retention.ts";

test("immutable upload clock crosses UTC day/year without adding retention on retry", () => {
  const start = Date.parse("2026-12-31T23:59:30.123Z");
  const d = proofDeadlines(start);
  assert.equal(new Date(d.retentionDeadline).toISOString(), "2027-01-01T01:59:30.123Z");
  assert.equal(d.accessDeadline - start, 6_900_000);
  assert.equal(d.processingDeadline - start, 6_600_000);
  assert.equal(d.uploadGrantDeadline - start, 900_000);
  const restored = JSON.parse(JSON.stringify(d));
  for (const elapsed of [0, 300_000, 6_000_000]) {
    canStartProofAttempt(restored, start + elapsed);
    downloadGrantSeconds(restored, start + elapsed);
    assert.deepEqual(restored, d);
  }
  assert.throws(() => { (d as { accessDeadline: number }).accessDeadline++; }, TypeError);
});

test("at each exact cutoff deny grants/publication and begin purge early", () => {
  const d = proofDeadlines(1_000_000);
  assert.equal(uploadGrantOpen(d, d.uploadGrantDeadline - 1), true);
  assert.equal(uploadGrantOpen(d, d.uploadGrantDeadline), false);
  assert.equal(canStartProofAttempt(d, d.processingDeadline - 360_001), true);
  assert.equal(canStartProofAttempt(d, d.processingDeadline - 360_000), false);
  assert.equal(canPublishProof(d, d.processingDeadline - 1), true);
  assert.equal(canPublishProof(d, d.processingDeadline), false);
  assert.equal(downloadGrantSeconds(d, d.accessDeadline - 60_001), 60);
  assert.equal(downloadGrantSeconds(d, d.accessDeadline - 59_999), 59);
  assert.equal(downloadGrantSeconds(d, d.accessDeadline - 999), 0);
  assert.equal(downloadGrantSeconds(d, d.accessDeadline), 0);
  assert.equal(purgeDue(d, d.accessDeadline - 1), false);
  assert.equal(purgeDue(d, d.accessDeadline), true);
  assert.equal(purgeDue(d, d.retentionDeadline), true);
  assert.equal(canPublishProof(d, d.retentionDeadline), false);
});

test("reject forged/restored extended deadlines and invalid clocks", () => {
  const d = proofDeadlines(1_000_000);
  for (const key of Object.keys(d)) {
    assert.throws(() => assertProofDeadlines({ ...d, [key]: d[key as keyof typeof d] + 1 }), /invalid_run_deadlines/);
  }
  for (const bad of [NaN, Infinity, -1, 1.1, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => proofDeadlines(bad), /invalid_server_clock/);
    assert.throws(() => downloadGrantSeconds(d, bad), /invalid_server_clock/);
  }
  assert.equal(canStartProofAttempt(d, d.uploadStartedAt - 1), false);
  assert.equal(downloadGrantSeconds(d, d.uploadStartedAt - 1), 0);
});
