import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { INDEX_CASES, indexCaseBytes, numberedListBytes } from "../../corpus/pwc/index-cases.ts";
import { launchFixture, DEMO_EXPECTED } from "../../corpus/launch-fixtures.ts";
import { analyzeProof } from "../launch.ts";
import { buildProofIndexes } from "./build.ts";
import { resolveNumber } from "./scopes.ts";
import { canonicalJson } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));

test("PEE-02 indexes are deterministic in-process and across processes", async () => {
  const bytes = await indexCaseBytes("range_and_coordinated");
  const first = await analyzeProof(bytes);
  const second = await analyzeProof(bytes);
  assert.equal(first.indexes.digest, second.indexes.digest);
  assert.equal(canonicalJson(first.indexes), canonicalJson(second.indexes));
  const rebuilt = buildProofIndexes(first.source, first.extracted);
  assert.equal(rebuilt.digest, first.indexes.digest);

  const dir = mkdtempSync(join(tmpdir(), "pee02-index-"));
  const fixture = join(dir, "case.docx");
  writeFileSync(fixture, bytes);
  const script = join(here, "digest-once.ts");
  const run = () => spawnSync(process.execPath, ["--experimental-strip-types", script, fixture], {
    encoding: "utf8",
    cwd: join(here, "../../../../../"),
  });
  const childA = run();
  const childB = run();
  assert.equal(childA.status, 0, childA.stderr);
  assert.equal(childB.status, 0, childB.stderr);
  assert.equal(childA.stdout, first.indexes.digest);
  assert.equal(childB.stdout, first.indexes.digest);
});

test("PEE-02 labelled cases distinguish found, missing, imported, range, external and figures", async () => {
  for (const spec of INDEX_CASES) {
    const analysis = await analyzeProof(await indexCaseBytes(spec.id));
    const { indexes } = analysis;
    const clause = indexes.scopes.entries.filter((entry) => entry.namespace === "clause");
    for (const expected of spec.expected.clauseLabels) {
      assert.ok(
        clause.some((entry) => entry.label === expected.label && entry.scope.startsWith(expected.scopePrefix)),
        `${spec.id} missing clause ${expected.scopePrefix}:${expected.label}`,
      );
    }
    for (const label of spec.expected.scheduleLabels) {
      assert.ok(indexes.scopes.entries.some((entry) => entry.namespace === "schedule" && entry.label === label), `${spec.id} schedule ${label}`);
    }
    for (const missing of spec.expected.missing) {
      const resolved = resolveNumber(indexes.scopes, { scope: missing.scopePrefix === "main_body" ? "main_body" : clause.find((entry) => entry.scope.startsWith(missing.scopePrefix))?.scope ?? missing.scopePrefix, namespace: "clause", label: missing.label });
      assert.equal(resolved.status, "missing", `${spec.id} expected missing ${missing.label}`);
    }
    for (const term of spec.expected.importedTerms) {
      assert.ok(indexes.definitions.entries.some((entry) => entry.term === term && entry.imported), `${spec.id} imported ${term}`);
    }
    for (const term of spec.expected.localTerms) {
      assert.ok(indexes.definitions.entries.some((entry) => entry.term === term && !entry.imported), `${spec.id} local ${term}`);
    }
    if (spec.expected.range) {
      const range = indexes.references.entries.find((entry) => entry.form === "range" && entry.raw.includes(spec.expected.range!.rawIncludes.replace(/^Clauses?\s+/i, "")));
      assert.ok(range, `${spec.id} range`);
      assert.deepEqual(range!.endpoints.map((end) => end.label), spec.expected.range.endpoints);
    }
    if (spec.expected.coordinated) {
      const coordinated = indexes.references.entries.find((entry) => entry.form === "coordinated");
      assert.ok(coordinated, `${spec.id} coordinated`);
      assert.deepEqual(coordinated!.endpoints.map((end) => end.label), spec.expected.coordinated.endpoints);
    }
    for (const raw of spec.expected.externalRawIncludes ?? []) {
      assert.ok(indexes.references.entries.some((entry) => entry.external && entry.raw.includes(raw)), `${spec.id} external ${raw}`);
    }
    for (const raw of spec.expected.relativeRawIncludes ?? []) {
      assert.ok(indexes.references.entries.some((entry) => entry.form === "relative" && entry.raw.includes(raw)), `${spec.id} relative ${raw}`);
    }
    for (const name of spec.expected.parties ?? []) {
      assert.ok(indexes.parties.entries.some((entry) => entry.shortName === name), `${spec.id} party ${name}`);
    }
    for (const raw of spec.expected.ambiguousDates ?? []) {
      assert.ok(indexes.figures.entries.some((entry) => entry.kind === "date" && entry.parse === "ambiguous" && entry.raw === raw), `${spec.id} ambiguous ${raw}`);
    }
    for (const raw of spec.expected.parsedDates ?? []) {
      assert.ok(indexes.figures.entries.some((entry) => entry.kind === "date" && entry.parse === "parsed" && entry.raw === raw), `${spec.id} parsed ${raw}`);
    }
    for (const raw of spec.expected.amounts ?? []) {
      assert.ok(indexes.figures.entries.some((entry) => entry.kind === "amount" && entry.raw.includes(raw.replace(/\s/g, "")) || entry.raw === raw), `${spec.id} amount ${raw}`);
    }
    for (const raw of spec.expected.percentages ?? []) {
      assert.ok(indexes.figures.entries.some((entry) => entry.kind === "percentage" && entry.raw.replace(/\s/g, "") === raw), `${spec.id} percent ${raw}`);
    }
    if (spec.id === "cross_scope_same_number") {
      const missing = resolveNumber(indexes.scopes, { scope: "main_body", namespace: "clause", label: "3" });
      assert.equal(missing.status, "missing");
      assert.equal(missing.otherScopeHits.length >= 1, true);
    }
    if (spec.id === "schedule_restart") {
      const main = resolveNumber(indexes.scopes, { scope: "main_body", namespace: "clause", label: "1" });
      const scheduleScope = indexes.scopes.entries.find((entry) => entry.namespace === "clause" && entry.scope.startsWith("schedule:1"))!.scope;
      const schedule = resolveNumber(indexes.scopes, { scope: scheduleScope, namespace: "clause", label: "1" });
      assert.equal(main.status, "resolved");
      assert.equal(schedule.status, "resolved");
      assert.notEqual(main.matches[0]!.span.paragraphPath.join("."), schedule.matches[0]!.span.paragraphPath.join("."));
    }
  }
});

test("PEE-02 duplicate labels in one scope are ambiguous, never a boolean guess", async () => {
  const analysis = await analyzeProof(await (await import("../../docx.ts")).buildDocx([
    "1. First operative clause.",
    "1. Repeated operative clause.",
  ]));
  const resolved = resolveNumber(analysis.indexes.scopes, { scope: "main_body", namespace: "clause", label: "1" });
  assert.equal(resolved.status, "ambiguous");
  assert.equal(resolved.matches.length, 2);
});

test("PEE-02 native numbering labels enter the scoped inventory", async () => {
  const analysis = await analyzeProof(await numberedListBytes());
  const labels = analysis.indexes.scopes.entries.filter((entry) => entry.source === "numbering").map((entry) => entry.label);
  assert.deepEqual(labels, ["1", "2"]);
  assert.equal(resolveNumber(analysis.indexes.scopes, { scope: "main_body", namespace: "clause", label: "1" }).status, "resolved");
});

test("PEE-02 does not add markup or change launch findings", async () => {
  for (const kind of ["body", "split_runs", "table", "prior_review"] as const) {
    const result = await analyzeProof(await launchFixture(kind));
    assert.equal(result.plan.findings.length, 4);
    for (const expected of DEMO_EXPECTED) {
      const finding = result.plan.findings.find((item) => item.ruleId === expected.ruleId);
      assert.equal(finding?.exactQuote, expected.quote);
    }
    assert.equal(result.indexes.version, "proof-index-v1");
    assert.equal(result.indexes.digest.length, 64);
  }
  const party = await analyzeProof(await launchFixture("party_name"));
  assert.deepEqual(party.plan.findings, []);
  assert.ok(party.indexes.parties.entries.some((entry) => entry.shortName === "Recieve"));
});
