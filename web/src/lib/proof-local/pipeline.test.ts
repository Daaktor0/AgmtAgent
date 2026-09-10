import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { DEMO_EXPECTED, launchFixture } from "../agmt/corpus/launch-fixtures.ts";
import { processProofLocal } from "./pipeline.ts";

test("local pipeline maps launch fixtures, writes tracked changes, and validates", async () => {
    const body = await processProofLocal(new Uint8Array(await launchFixture("body")));
    assert.equal(body.corrections, 2);
    assert.equal(body.comments, 2);
    assert.equal(body.clamavInBrowser, false);
    assert.equal(body.sdkInBrowser, false);
    const quotes = body.findings.map((finding) => `${finding.ruleId}:${finding.quote}`);
    for (const expected of DEMO_EXPECTED) {
      assert.ok(quotes.some((item) => item.startsWith(`${expected.ruleId}:${expected.quote}`)), expected.ruleId);
    }
    const zip = await JSZip.loadAsync(body.output);
    const xml = await zip.file("word/document.xml")!.async("string");
    assert.match(xml, /<w:ins\b/);
    assert.match(xml, /<w:del\b/);
    assert.match(xml, /<w:commentRangeStart\b/);
    assert.match(xml, /w:author="Agmt Proof"/);

    const split = await processProofLocal(new Uint8Array(await launchFixture("split_runs")));
    const typo = split.findings.find((finding) => finding.ruleId === "language.typo_allowlist");
    assert.equal(typo?.kind, "comment");
    assert.equal(split.corrections, 1);

    const partySource = new Uint8Array(await launchFixture("party_name"));
    const party = await processProofLocal(partySource);
    assert.equal(party.corrections, 0);
    assert.equal(party.comments, 0);
    assert.deepEqual(party.output, partySource);

    const prior = await processProofLocal(new Uint8Array(await launchFixture("prior_review")));
    const priorXml = await (await JSZip.loadAsync(prior.output)).file("word/document.xml")!.async("string");
    assert.match(priorXml, /Existing comment stays unchanged|Unrelated prior review/);
    assert.match(priorXml, /w:id="0"/);
});

test("local pipeline reports distinct admit/analyze/export/validate stages", async () => {
    const stages: string[] = [];
    await processProofLocal(new Uint8Array(await launchFixture("body")), {
      onStage: (stage) => stages.push(stage),
    });
    assert.deepEqual(stages, ["admitting", "analyzing", "exporting", "validating"]);
});

test("local pipeline honours cancellation between stages", async () => {
    const controller = new AbortController();
    controller.abort();
    const bytes = new Uint8Array(await launchFixture("body"));
    await assert.rejects(
      () => processProofLocal(bytes, { signal: controller.signal }),
      /cancelled/,
    );

    const mid = new AbortController();
    await assert.rejects(
      () => processProofLocal(bytes, {
        signal: mid.signal,
        onStage: (stage) => {
          if (stage === "exporting") mid.abort();
        },
      }),
      /cancelled/,
    );
});
