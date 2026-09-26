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

test("fresh: schedule locator does not prove a term is defined or that the schedule exists", async () => {
  const bytes = await buildDocx([
    "This agreement is between Riverton Logistics Limited (the Supplier) and the Customer.",
    '"Services" means the services described in this agreement.',
    "The Customer shall pay the Settlement Figure stated in Schedule 3 within ten business days.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  const undefinedUse = analysis.plan.findings.find((finding) => finding.ruleId === "definitions.undefined_use" && finding.exactQuote === "Settlement Figure");
  const missingSchedule = analysis.plan.findings.find((finding) => finding.ruleId === "references.missing_target" && finding.exactQuote === "Schedule 3");
  assert.ok(undefinedUse, "title case plus a schedule locator is not proof of a definition");
  assert.match(undefinedUse!.comment, /Review question/);
  assert.ok(missingSchedule, "citing Schedule 3 does not prove the schedule exists");
  assert.match(missingSchedule!.comment, /no schedule heading appears in the checked text/);
});

test("fresh: defined schedule figure stays silent on the term when the schedule heading exists", async () => {
  const bytes = await buildDocx([
    "This agreement is between Riverton Logistics Limited (the Supplier) and the Customer.",
    '"Settlement Figure" means the amount in Schedule 3.',
    "The Customer shall pay the Settlement Figure stated in Schedule 3 within ten business days.",
    "SCHEDULE 3",
    "The Settlement Figure is 10.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  assert.equal(analysis.plan.findings.some((finding) => finding.ruleId === "definitions.undefined_use" && finding.exactQuote === "Settlement Figure"), false);
  assert.equal(analysis.plan.findings.some((finding) => finding.ruleId === "references.missing_target" && finding.exactQuote === "Schedule 3"), false);
});

test("fresh: Service Levels set out in an existing clause is still an undefined-term review question", async () => {
  const bytes = await buildDocx([
    "1. The Supplier shall perform the services.",
    "The Supplier shall keep the Service Levels set out in Clause 1.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  assert.ok(analysis.plan.findings.some((finding) => finding.ruleId === "definitions.undefined_use" && finding.exactQuote === "Service Levels"));
});

test("fresh: inherited original-agreement term in a restated clause is not undefined", async () => {
  const bytes = await buildDocx([
    "This Deed of Amendment is made between Pinecroft Holdings Limited (the Company) and the Investor.",
    "Clause 9.3 of the Original Agreement is deleted and replaced with the following.",
    "9.3 The Investor shall subscribe for the Shares in cash on the Payment Date.",
    "Except as amended by this Deed, the Original Agreement remains in full force.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  assert.equal(analysis.plan.findings.some((finding) => finding.ruleId === "definitions.undefined_use" && finding.exactQuote === "Payment Date"), false);
  assert.equal(analysis.plan.findings.some((finding) => finding.ruleId === "references.missing_target"), false);
});

test("fresh: bulk-incorporated original-agreement terms are not undefined", async () => {
  const bytes = await buildDocx([
    "This Deed of Amendment is made between the Company and the Investor.",
    "Unless otherwise defined in this Deed, terms defined in the Original Agreement have the same meaning.",
    "The Investor shall pay the Completion Amount on the date of this Deed.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  assert.equal(analysis.plan.findings.some((finding) => finding.ruleId === "definitions.undefined_use" && finding.exactQuote === "Completion Amount"), false);
});

test("fresh: express as-defined-in use is inherited, not missing", async () => {
  const bytes = await buildDocx([
    "This agreement is between the Company and the Investor.",
    "The Company shall pay the Purchase Price as defined in the Share Purchase Agreement.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  assert.equal(analysis.plan.findings.some((finding) => finding.ruleId === "definitions.undefined_use" && finding.exactQuote === "Purchase Price"), false);
});

test("fresh: imported quoted definition then use is not undefined", async () => {
  const bytes = await buildDocx([
    "This Deed of Amendment is made between the Company and the Investor.",
    '"Completion Date" has the meaning given in the Original Agreement.',
    "The parties shall complete on the Completion Date.",
    "Except as amended by this Deed, the Original Agreement remains in full force.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  assert.equal(analysis.plan.findings.some((finding) => finding.ruleId === "definitions.undefined_use" && finding.exactQuote === "Completion Date"), false);
});

test("fresh: genuine missing definition in a standalone agreement still comments", async () => {
  const bytes = await buildDocx([
    "This agreement is between Riverton Logistics Limited (the Supplier) and the Customer.",
    "The Supplier shall keep the Service Levels for the duration of this agreement.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  assert.ok(analysis.plan.findings.some((finding) => finding.ruleId === "definitions.undefined_use" && finding.exactQuote === "Service Levels"));
});

test("fresh: new undefined term in an amendment's own (non-restated) prose is a qualified review question", async () => {
  const bytes = await buildDocx([
    "This Deed of Amendment is made between the Company and the Investor.",
    "The Company shall maintain the Option Pool for the employees identified by the board.",
    "Except as amended by this Deed, the Original Agreement remains in full force.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  const finding = analysis.plan.findings.find((item) => item.ruleId === "definitions.undefined_use" && item.exactQuote === "Option Pool");
  assert.ok(finding);
  assert.match(finding!.comment, /If it is a term of the Original Agreement/);
});

test("fresh: valid external original-agreement reference is not missing", async () => {
  const bytes = await buildDocx([
    "This Deed of Amendment is made between the Company and the Investor.",
    "Clause 12 of the Original Agreement is not amended.",
    "Except as amended by this Deed, the Original Agreement remains in full force.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  assert.equal(analysis.plan.findings.some((finding) => finding.ruleId === "references.missing_target" && finding.exactQuote.includes("Clause 12")), false);
});

test("fresh: broken internal clause still comments when other clauses exist", async () => {
  const bytes = await buildDocx([
    "1. First operative clause.",
    "2. Second operative clause.",
    "The Company shall act under Clause 80.1 of this agreement.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  const finding = analysis.plan.findings.find((item) => item.ruleId === "references.missing_target" && item.exactQuote === "Clause 80.1");
  assert.ok(finding);
  assert.match(finding!.comment, /was not found among the numbered clauses in the checked text/);
  assert.doesNotMatch(finding!.comment, /If this file is meant to include/);
});

test("fresh: clause citation with no numbered clauses is qualified, not a proven miss", async () => {
  const bytes = await buildDocx([
    "The Seller shall deliver the notice under Clause 8 by Friday.",
    "The Buyer shall acknowledge receipt in writing.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  const finding = analysis.plan.findings.find((item) => item.ruleId === "references.missing_target" && item.exactQuote === "Clause 8");
  assert.ok(finding);
  assert.match(finding!.comment, /no numbered clause appears in the checked text/);
});

test("fresh: schedule heading present is not a missing schedule", async () => {
  const bytes = await buildDocx([
    "1. The Company shall act under Schedule 1.",
    "SCHEDULE 1",
    "The list of assets.",
  ]);
  const analysis = await analyzeProof(bytes, { profile: "agreement", language: "en-GB" });
  assert.equal(analysis.plan.findings.some((finding) => finding.ruleId === "references.missing_target" && finding.exactQuote === "Schedule 1"), false);
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
