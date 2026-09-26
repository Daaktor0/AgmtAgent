import assert from "node:assert/strict";
import { test } from "node:test";
import { INDEX_QUALITY_VERSION, INDEX_WEIGHTS } from "../config.ts";
import { ingestBuffer } from "../pipeline.ts";
import { buildDocx } from "../docx.ts";
import { assertLineOwnership } from "../provision-tree.ts";
import { reviewGate } from "../review-gate.ts";
import { INDEX_CORPUS } from "./index-quality-fixtures.ts";

test("index quality version and weights are pinned", () => {
  assert.equal(INDEX_QUALITY_VERSION, "iq-v2");
  assert.equal(INDEX_WEIGHTS.classifiedCoverage, 0.4);
  assert.equal(INDEX_WEIGHTS.outlineContinuity, 0.25);
  assert.equal(INDEX_WEIGHTS.numberingConsistency, 0.15);
  assert.equal(INDEX_WEIGHTS.definitionMapping, 0.1);
  assert.equal(INDEX_WEIGHTS.tableCompleteness, 0.1);
  const sum = Object.values(INDEX_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(sum * 100) / 100, 1);
});

test("index golden set: ownership, labels, review gate, no false refuse", async () => {
  const failures: string[] = [];
  for (const f of INDEX_CORPUS) {
    const bytes = await buildDocx(f.paragraphs, { pages: 3, ...f.docx });
    const r = await ingestBuffer(bytes);
    if (r.refused) {
      failures.push(`${f.id}: refused ${r.code} (expected Proof to run)`);
      continue;
    }
    const ownership = assertLineOwnership(r.sourceProvisions, r.extracted.blocks);
    if (ownership.length) failures.push(`${f.id}: ownership ${ownership.join("; ")}`);

    const q = r.quality;
    if (q.usableOutline !== f.expect.usableOutline) {
      failures.push(`${f.id}: usableOutline ${q.usableOutline} ≠ ${f.expect.usableOutline}`);
    }
    if (q.materialUnclassified !== f.expect.materialUnclassified) {
      failures.push(`${f.id}: materialUnclassified ${q.materialUnclassified} ≠ ${f.expect.materialUnclassified}`);
    }
    const qualities = Array.isArray(f.expect.sourceQuality) ? f.expect.sourceQuality : [f.expect.sourceQuality];
    if (!qualities.includes(q.sourceQuality)) {
      failures.push(`${f.id}: sourceQuality ${q.sourceQuality} not in ${qualities.join("|")}`);
    }
    if (f.expect.classifiedShareMin != null && q.classifiedShare < f.expect.classifiedShareMin) {
      failures.push(`${f.id}: classifiedShare ${q.classifiedShare} < ${f.expect.classifiedShareMin}`);
    }
    if (f.expect.classifiedShareMax != null && q.classifiedShare > f.expect.classifiedShareMax) {
      failures.push(`${f.id}: classifiedShare ${q.classifiedShare} > ${f.expect.classifiedShareMax}`);
    }

    const gate = reviewGate({
      quality: q,
      instrument: r.instrument,
      representedParty: "company",
      stage: "signing",
      reviewShipped: false,
    });
    const codes = Array.isArray(f.expect.reviewCode) ? f.expect.reviewCode : [f.expect.reviewCode];
    if (!codes.includes(gate.code)) {
      failures.push(`${f.id}: review code ${gate.code} not in ${codes.join("|")} (${gate.reason})`);
    }
    if (f.expect.reviewCoverage === "blocked" && gate.coverage !== "blocked") {
      failures.push(`${f.id}: review coverage ${gate.coverage} ≠ blocked`);
    }
    if (f.expect.reviewCoverage === "blocked") assert.equal(gate.reviewAllowed, false);
  }
  assert.deepEqual(failures, []);
});

test("schedule-local Affiliate does not overwrite the body definition", async () => {
  const f = INDEX_CORPUS.find((x) => x.id === "idx-04-schedule-local-term");
  assert.ok(f);
  const bytes = await buildDocx(f!.paragraphs, { pages: 3 });
  const r = await ingestBuffer(bytes);
  assert.equal(r.refused, false);
  if (r.refused) return;

  const affiliates = r.definitions.filter((d) => d.normalisedTerm === "affiliate");
  assert.ok(affiliates.length >= 2, `expected body + schedule Affiliate, got ${affiliates.length}`);
  const body = affiliates.find((d) => d.scopeType === "definitions" || d.scopeType === "main_body");
  const local = affiliates.find((d) => d.scopeType === "schedule");
  assert.ok(body, "missing body Affiliate");
  assert.ok(local, "missing schedule-local Affiliate");
  assert.notEqual(body!.definitionId, local!.definitionId);
  assert.match(body!.scopeId, /definitions|main/);
  assert.match(local!.scopeId, /schedule/i);

  const bodyProv = r.sourceProvisions.find((p) => p.provisionId === body!.definingProvisionId);
  const localProv = r.sourceProvisions.find((p) => p.provisionId === local!.definingProvisionId);
  assert.ok(bodyProv && /controls the Company/i.test(bodyProv.canonicalText));
  assert.ok(localProv && /Helios Holdings/i.test(localProv.canonicalText));

  const bodyUses = r.uses.filter((u) => u.definitionId === body!.definitionId);
  const localUses = r.uses.filter((u) => u.definitionId === local!.definitionId);
  assert.ok(bodyUses.length >= 1, "body Affiliate must have operating uses");
  assert.ok(localUses.length >= 1, "schedule Affiliate must have local uses");

  const localUseProvs = localUses.map((u) => r.sourceProvisions.find((p) => p.provisionId === u.provisionId));
  assert.ok(localUseProvs.every((p) => p && p.scopeType === "schedule"));
  const bodyClaimedSchedule = bodyUses.some((u) => {
    const p = r.sourceProvisions.find((x) => x.provisionId === u.provisionId);
    return p?.scopeType === "schedule";
  });
  assert.equal(bodyClaimedSchedule, false, "body Affiliate must not silently qualify schedule uses");
});

test("header, table and signature leaves are owned", async () => {
  const f = INDEX_CORPUS.find((x) => x.id === "idx-05-headers-tables-sigs");
  assert.ok(f);
  const bytes = await buildDocx(f!.paragraphs, { pages: 3, ...f!.docx });
  const r = await ingestBuffer(bytes);
  assert.equal(r.refused, false);
  if (r.refused) return;
  assert.deepEqual(assertLineOwnership(r.sourceProvisions, r.extracted.blocks), []);
  const header = r.sourceProvisions.find((p) => p.ownsText && /execution copy/i.test(p.canonicalText));
  assert.ok(header, "header text must be a leaf");
  const table = r.sourceProvisions.find((p) => p.ownsText && /INR 10,000,000/.test(p.canonicalText) && p.blockIndex != null);
  assert.ok(table || r.extracted.blocks.some((b) => b.isTable), "table cells must extract");
  const sig = r.sourceProvisions.find((p) => p.nodeType === "signature_block");
  assert.ok(sig, "signature block leaf");
});

test("material unclassified is incomplete_source, not a refuse", async () => {
  const f = INDEX_CORPUS.find((x) => x.id === "idx-02-unclassified-header");
  assert.ok(f);
  const bytes = await buildDocx(f!.paragraphs, { pages: 3, ...f!.docx });
  const r = await ingestBuffer(bytes);
  assert.equal(r.refused, false);
  if (r.refused) return;
  assert.equal(r.quality.usableOutline, true);
  assert.equal(r.quality.materialUnclassified, true);
  const gate = reviewGate({
    quality: r.quality,
    instrument: "sha",
    representedParty: "company",
    stage: "signing",
    reviewShipped: true,
  });
  assert.equal(gate.reviewAllowed, true);
  assert.equal(gate.coverage, "incomplete_source");
  assert.equal(gate.code, "incomplete_source");
});

test("no usable outline blocks Review even if Proof ran", async () => {
  const f = INDEX_CORPUS.find((x) => x.id === "idx-03-no-outline");
  assert.ok(f);
  const bytes = await buildDocx(f!.paragraphs);
  const r = await ingestBuffer(bytes);
  assert.equal(r.refused, false);
  if (r.refused) return;
  assert.equal(r.quality.usableOutline, false);
  const gate = reviewGate({
    quality: r.quality,
    instrument: r.instrument,
    representedParty: "company",
    stage: "signing",
    reviewShipped: true,
  });
  assert.equal(gate.reviewAllowed, false);
  assert.equal(gate.coverage, "blocked");
  assert.equal(gate.code, "no_usable_outline");
});
