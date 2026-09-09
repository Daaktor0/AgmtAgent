import assert from "node:assert/strict";
import { test } from "node:test";
import { createConnection } from "node:net";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { analyzeProof } from "./launch.ts";
import { launchFixture } from "../corpus/launch-fixtures.ts";
import { CHECKS, LAUNCH_RULE_SPECS, LAUNCH_RULE_BY_ID } from "./registry.ts";
import { executeLaunchRules } from "./rule-runtime.ts";
import { canPromote, ruleMetric } from "../corpus/pwc/metrics.ts";

test("PWC-14 six launch rules have evaluation receipts; experimental CHECKS stay off", () => {
  assert.equal(LAUNCH_RULE_SPECS.length, 6);
  assert.equal(LAUNCH_RULE_SPECS.every((spec) => spec.defaultEnabled && spec.evaluationReceiptHash.length === 64), true);
  assert.equal(CHECKS.some((spec) => LAUNCH_RULE_SPECS.some((launch) => launch.id === spec.checkId)), false);
  assert.equal(LAUNCH_RULE_BY_ID["language.typo_allowlist"].actionPolicy, "correction");
});

test("PWC-14 missing capability, unknown version and budget are not clean zeros", async () => {
  const analysis = await analyzeProof(await launchFixture("body"));
  const ctx = { source: analysis.source, extracted: analysis.extracted, sourceSha256: analysis.sourceSha256 };
  const missing = executeLaunchRules(ctx, {
    specs: [{ ...LAUNCH_RULE_BY_ID["references.missing_target"], requiresCapabilities: ["numbering"] }],
    capabilities: new Set(),
  });
  assert.equal(missing.executions[0]?.outcome, "suppressed");
  assert.equal(missing.executions[0]?.code, "missing_capability");
  assert.equal(missing.clean, false);

  const unknown = executeLaunchRules(ctx, {
    specs: [{ ...LAUNCH_RULE_BY_ID["language.typo_allowlist"], version: 2 as 1 }],
  });
  assert.equal(unknown.executions[0]?.outcome, "failed");
  assert.equal(unknown.executions[0]?.code, "unknown_rule_version");
  assert.equal(unknown.clean, false);

  const budget = executeLaunchRules(ctx, {
    specs: [{ ...LAUNCH_RULE_BY_ID["language.typo_allowlist"], maxCandidates: 0 }],
  });
  assert.equal(budget.executions[0]?.outcome, "suppressed");
  assert.equal(budget.executions[0]?.code, "rule_budget");
  assert.equal(budget.clean, false);

  const thrown = executeLaunchRules(ctx, {
    specs: [LAUNCH_RULE_BY_ID["language.typo_allowlist"]],
    runRule: () => {
      throw new Error("rule_boom");
    },
  });
  assert.equal(thrown.executions[0]?.outcome, "failed");
  assert.equal(thrown.clean, false);
  assert.equal(thrown.findings.length, 0);
});

test("PWC-14 frozen launch rules are deterministic and make no network calls", async (t) => {
  let calls = 0;
  const forbidden = () => {
    calls++;
    throw new Error("network_forbidden");
  };
  t.mock.method(globalThis, "fetch", forbidden);
  t.mock.method(net, "connect", forbidden);
  t.mock.method(net, "createConnection", forbidden);
  t.mock.method(http, "request", forbidden);
  t.mock.method(https, "request", forbidden);
  void createConnection;
  const analysis = await analyzeProof(await launchFixture("body"));
  const ctx = { source: analysis.source, extracted: analysis.extracted, sourceSha256: analysis.sourceSha256 };
  const first = executeLaunchRules(ctx, { profile: "agreement", language: "en-GB", capabilities: new Set(["numbering"]) });
  const second = executeLaunchRules(ctx, { profile: "agreement", language: "en-GB", capabilities: new Set(["numbering"]) });
  assert.deepEqual(first.findings.map((finding) => finding.id), second.findings.map((finding) => finding.id));
  assert.deepEqual(first.executions.map((execution) => execution.ruleId), LAUNCH_RULE_SPECS.map((spec) => spec.id));
  assert.equal(calls, 0);
});

test("PWC-14 zero denominators are not evaluated and cannot promote", () => {
  const empty = ruleMetric({ ruleId: "language.spelling_candidate", truePositive: 0, falsePositive: 0, falseNegative: 0 });
  assert.equal(empty.status, "not_evaluated");
  assert.equal(empty.precision, null);
  assert.equal(canPromote(empty, { precision: 0.98, recall: 0.9, minSamples: 100 }), false);
  const measured = ruleMetric({ ruleId: "language.typo_allowlist", truePositive: 10, falsePositive: 0, falseNegative: 1 });
  assert.equal(measured.status, "evaluated");
  assert.equal(canPromote(measured, { precision: 0.98, recall: 0.9, minSamples: 100 }), false);
});
