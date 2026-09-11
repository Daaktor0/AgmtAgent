/**
 * Fresh independently labelled cases for engine changes after the first-run
 * beta eval. Not the original 20 held-out documents and not packed PEE cases.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDocx } from "../../docx.ts";
import { analyzeProof } from "../../proof/launch.ts";
import { processProofLocal } from "../../../proof-local/pipeline.ts";
import { BETA_EVAL_REWRITTEN_REGRESSION } from "./rewritten-regression.ts";

test("fresh: amendment restatement of Clause 9.3 is not duplicate numbering", async () => {
  const bytes = await buildDocx([
    "This Deed of Amendment is made between Pinecroft Holdings Limited (the Company) and the Investor.",
    "Clause 9.3 of the Original Agreement is deleted and replaced with the following.",
    "9.3 The Investor shall subscribe for the Shares in cash on the date of this Deed.",
    "Except as amended by this Deed, the Original Agreement remains in full force.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  assert.equal(analysis.plan.findings.some((finding) => finding.ruleId === "references.duplicate_number"), false);
  assert.equal(analysis.indexes.scopes.entries.filter((entry) => entry.label === "9.3").length, 1);
});

test("fresh: genuine duplicate 6.2 still comments", async () => {
  const bytes = await buildDocx([
    "6.2 The Company shall keep the register at the registered office.",
    "6.2 The Investor shall pay the subscription monies on Completion.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  assert.ok(analysis.plan.findings.some((finding) => finding.ruleId === "references.duplicate_number" && finding.exactQuote === "6.2"));
});

test("fresh: title-case amount located in a schedule is not an undefined term", async () => {
  const bytes = await buildDocx([
    "This agreement is between Riverton Logistics Limited (the Supplier) and the Customer.",
    '"Services" means the services described in this agreement.',
    "The Customer shall pay the Settlement Figure stated in Schedule 3 within ten business days.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  assert.equal(analysis.plan.findings.some((finding) => finding.ruleId === "definitions.undefined_use" && finding.exactQuote === "Settlement Figure"), false);
});

test("fresh: rewritten first-run documents are regression cases, not held-out evidence", async () => {
  for (const doc of BETA_EVAL_REWRITTEN_REGRESSION) {
    const result = await processProofLocal(new Uint8Array(await buildDocx(doc.paragraphs)), {
      language: doc.language,
      profile: doc.kind === "prose" || doc.kind === "letter" ? "general" : "agreement",
    });
    const quotes = new Set(result.findings.map((finding) => `${finding.ruleId}|${finding.quote}`));
    for (const expected of doc.expected) {
      assert.equal(quotes.has(`${expected.ruleId}|${expected.quote}`), true, `${doc.id} missing ${expected.ruleId}`);
    }
  }
});
