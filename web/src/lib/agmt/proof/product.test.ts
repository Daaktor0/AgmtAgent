import assert from "node:assert/strict";
import test from "node:test";
import type { ProofHitDraft } from "../types.ts";
import { CHECKS } from "./registry.ts";
import { deriveProofProductSummary } from "./product.ts";
import type { ProofResult } from "./runner.ts";

function result(overrides: Partial<ProofResult> = {}): ProofResult {
  return {
    hits: [],
    suppressions: [],
    executions: CHECKS.map((check) => ({
      checkId: check.checkId,
      checkVersion: check.version,
      status: "completed" as const,
      outcome: "completed_zero_findings" as const,
      missing: [],
      hitCount: 0,
      errorCode: null,
    })),
    registrySha: "registry",
    llmCalls: 0,
    ...overrides,
  };
}

function hit(): ProofHitDraft {
  return {
    checkId: "structure.broken_xref",
    checkVersion: 1,
    severity: "high",
    certainty: "exact",
    provisionId: "p1",
    quoteStart: 0,
    quoteEnd: 4,
    detailCode: "broken_xref",
    detailArgs: { target: "8.2" },
  };
}

test("clean is allowed only when every pinned rule completed", () => {
  const summary = deriveProofProductSummary(result());
  assert.equal(summary.state, "clear_for_this_version");
  assert.equal(summary.canClaimClear, true);
  assert.equal(summary.completedRuleCount, CHECKS.length);
});

test("a finding produces attention required, not a clean result", () => {
  const finding = hit();
  const executions = result().executions.map((execution) =>
    execution.checkId === finding.checkId
      ? { ...execution, outcome: "completed_with_findings" as const, hitCount: 1 }
      : execution,
  );
  const summary = deriveProofProductSummary(result({ hits: [finding], executions }));
  assert.equal(summary.state, "attention_required");
  assert.equal(summary.groups.must_fix.length, 1);
});

test("suppressed rules force incomplete even with zero findings", () => {
  const executions = result().executions.map((execution, index) =>
    index === 0
      ? {
          ...execution,
          status: "suppressed" as const,
          outcome: "suppressed" as const,
          missing: ["comments"],
        }
      : execution,
  );
  const summary = deriveProofProductSummary(result({ executions }));
  assert.equal(summary.state, "incomplete");
  assert.equal(summary.canClaimClear, false);
});

test("invalid evidence forces incomplete and is never counted as visible", () => {
  const finding = hit();
  const summary = deriveProofProductSummary(result({ hits: [finding] }), {
    invalidEvidenceCount: 1,
    visibleHits: [],
  });
  assert.equal(summary.state, "incomplete");
  assert.equal(summary.activeFindingCount, 0);
  assert.equal(summary.invalidEvidenceCount, 1);
});
