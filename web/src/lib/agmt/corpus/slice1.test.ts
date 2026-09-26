import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECKS, registrySha } from "../proof/registry.ts";
import { CORPUS, CORPUS_SIZE } from "./agreements.ts";
import { coverageGaps, evalFixture, NOT_A_DEFECT_IS_TICKET_ONLY } from "./runner.ts";
import { voteNotADefectDoesNotSuppress } from "./ticket.ts";

/** Bump only after replaying the full corpus. */
const PINNED_REGISTRY_SHA = "d5fb2e13fe06523062128db47e6f7bf85d74575d092f076853eea7d7b12be57b";

test("corpus has 12–13 labelled agreements", () => {
  assert.ok(CORPUS_SIZE >= 12 && CORPUS_SIZE <= 13, `got ${CORPUS_SIZE}`);
});

test("every v1 check has a must-find and an exception fixture", async () => {
  const verdicts = [];
  for (const f of CORPUS) verdicts.push(await evalFixture(f));
  const gaps = coverageGaps(verdicts, CORPUS);
  assert.deepEqual(gaps, []);
});

test("must-find / trap / not-a-defect gates", async () => {
  const failures: string[] = [];
  for (const f of CORPUS) {
    const v = await evalFixture(f);
    if (v.ok) continue;
    for (const l of v.missedMustFind) {
      failures.push(`${f.id}: missed must-find ${l.checkId} ${l.needle ?? ""}`);
    }
    for (const t of v.trapFires) {
      failures.push(`${f.id}: trap fired ${t.label.checkId} ${t.label.needle ?? ""} → ${t.quote}`);
    }
    for (const t of v.notADefectFires) {
      failures.push(`${f.id}: not-a-defect fired ${t.label.checkId} ${t.label.needle ?? ""} → ${t.quote}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("registry snapshot — bump only after a full corpus replay", () => {
  assert.equal(registrySha(), PINNED_REGISTRY_SHA);
  assert.equal(CHECKS.length, 12);
});

test("not-a-defect vote creates a ticket only", () => {
  assert.equal(NOT_A_DEFECT_IS_TICKET_ONLY, true);
  assert.equal(voteNotADefectDoesNotSuppress("missing_capability"), true);
  assert.equal(voteNotADefectDoesNotSuppress("not_a_defect"), false);
});
