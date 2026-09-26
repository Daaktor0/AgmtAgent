import assert from "node:assert/strict";
import { test } from "node:test";
import { createConnection } from "node:net";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { analyzeProof, validateLaunchFinding } from "./launch.ts";
import { launchFixture, DEMO_EXPECTED } from "../corpus/launch-fixtures.ts";
import { buildDocx } from "../docx.ts";
import { LAUNCH_RULE_SPECS } from "./registry.ts";

test("all four demonstration variants produce exactly two corrections and two anchored comments, without network", async (t) => {
  let calls = 0;
  const forbidden = () => { calls++; throw new Error("network_forbidden"); };
  t.mock.method(globalThis, "fetch", forbidden);
  t.mock.method(net, "connect", forbidden);
  t.mock.method(net, "createConnection", forbidden);
  t.mock.method(http, "request", forbidden);
  t.mock.method(https, "request", forbidden);
  void createConnection;
  for (const kind of ["body", "split_runs", "table", "prior_review"] as const) {
    const result = await analyzeProof(await launchFixture(kind));
    assert.equal(result.coverage, "complete");
    assert.equal(result.plan.findings.length, 4);
    assert.equal(result.executions.length, LAUNCH_RULE_SPECS.length);
    assert.equal(result.plan.findings.filter((f) => f.kind === "correction").length, kind === "split_runs" ? 1 : 2);
    for (const e of DEMO_EXPECTED) {
      const f = result.plan.findings.find((f) => f.ruleId === e.ruleId)!;
      assert.ok(f, e.ruleId);
      assert.equal(f.exactQuote, e.quote);
      assert.equal(f.primarySpan.textStart, e.start); assert.equal(f.primarySpan.textEnd, e.end);
      if (kind === "split_runs" && e.ruleId === "language.typo_allowlist") {
        assert.equal(f.kind, "comment");
        assert.equal(f.replacement, null);
      } else {
        assert.equal(f.replacement, e.replacement);
      }
      validateLaunchFinding(result, f);
      assert.throws(() => validateLaunchFinding(result, { ...f, comment: "forged claim" }), /invalid_rule_evidence/);
    }
  }
  assert.equal(calls, 0);
});

test("negative traps: party name, valid repetition, quotes, URLs, statute, brackets and restarted scopes", async () => {
  assert.deepEqual((await analyzeProof(await launchFixture("party_name"))).plan.findings, []);
  const r = await analyzeProof(await buildDocx([
    '1. The Company confirms that that notice is valid and it had had enough time.',
    '2. The Company shall use "recieve" and the URL https://example.com/recieve and recieve@example.com.',
    '3. Section 42 of the Companies Act, 2013 applies; [12] and [optional wording] are valid.',
    '4. The Company shall act under Clause 1.',
    '5. "Notice" means a written notice.',
    'SCHEDULE 1', '1. "Notice" means a written notice.',
    'SCHEDULE 2', '1. The Company shall deliver the Notice.',
  ]));
  assert.deepEqual(r.plan.findings, []);
});

test("duplicate definitions and literal numbers anchor the second occurrence and relate the first", async () => {
  const r = await analyzeProof(await buildDocx(['8.2 "Notice" means a letter.', '8.2 "Notice" means an email.']));
  assert.deepEqual(r.plan.findings.map((f) => f.ruleId).sort(), ['definitions.duplicate', 'references.duplicate_number']);
  for (const f of r.plan.findings) {
    assert.equal(f.kind, "comment"); assert.equal(f.relatedSpans.length, 1);
    assert.notDeepEqual(f.primarySpan.paragraphPath, f.relatedSpans[0].paragraphPath);
    validateLaunchFinding(r, f);
  }
});

test("duplicate-word v2 deletes the second token including tab separators, and skips non-English", async () => {
  const tab = await analyzeProof(await buildDocx(["The Company shall pay the\tthe interest."]));
  const duplicate = tab.plan.findings.find((finding) => finding.ruleId === "language.duplicate_word");
  assert.equal(duplicate?.exactQuote, "the");
  assert.equal(duplicate?.replacement, "");
  assert.equal(duplicate?.primarySpan.textStart, "The Company shall pay the\t".length);
  const { docxWithLang } = await import("../corpus/pwc/beta-rule-cases.ts");
  const french = await analyzeProof(await docxWithLang("The Company shall recieve the notice.", "fr-FR"));
  assert.equal(french.plan.findings.some((finding) => finding.exactQuote === "recieve"), false);
});

test("all allowlist replacements work only in eligible prose and more than 500 findings fails", async () => {
  const r = await analyzeProof(await buildDocx(['The Company shall recieve teh seperate notice after the event has occured.']));
  assert.equal(r.plan.findings.filter((f) => f.kind === "correction").length, 4);
  const bad = await analyzeProof(await buildDocx(Array.from({ length: 501 }, () => 'The Company shall recieve notice.')));
  assert.ok(bad.plan.findings.length <= 100);
  assert.equal(bad.coverage, "limited");
  assert.ok(bad.gaps.includes("rule_budget"));
});
