import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDocx } from "../docx.ts";
import { analyzeProof } from "./launch.ts";
import { hunspellFiles } from "./dictionaries/load.ts";
import nspell from "nspell";

test("pinned dictionaries load and distinguish an ordinary misspelling from a correct word", () => {
  const gb = nspell(hunspellFiles("en-GB").aff, hunspellFiles("en-GB").dic);
  assert.equal(gb.correct("government"), true);
  assert.equal(gb.correct("goverment"), false);
  assert.equal(gb.correct("colour"), true);
  const us = nspell(hunspellFiles("en-US").aff, hunspellFiles("en-US").dic);
  assert.equal(us.correct("color"), true);
  assert.equal(us.correct("goverment"), false);
});

test("dictionary spelling comments on lowercase misses and does not autocorrect", async () => {
  const result = await analyzeProof(await buildDocx([
    "The Company shall goverment the process in writing.",
    "The Company shall have mispelled the defined term in this clause.",
  ]));
  const government = result.plan.findings.find((finding) => finding.exactQuote === "goverment");
  const misspelled = result.plan.findings.find((finding) => finding.exactQuote === "mispelled");
  assert.equal(government?.ruleId, "spelling.dictionary");
  assert.equal(government?.kind, "comment");
  assert.equal(government?.replacement, null);
  assert.equal(misspelled?.ruleId, "spelling.dictionary");
  assert.equal(misspelled?.kind, "comment");
});

test("sentence-initial misspellings are commented; name sequences and language variants are not", async () => {
  const initial = await analyzeProof(await buildDocx(["Goverment shall deliver the notice in writing."]));
  assert.equal(initial.plan.findings.some((finding) => finding.exactQuote === "Goverment" && finding.kind === "comment"), true);

  const names = await analyzeProof(await buildDocx(["Northwind Traders Limited shall keep the Confidential Information."]));
  assert.equal(names.plan.findings.some((finding) => finding.ruleId === "spelling.dictionary" && /Northwind|Traders/.test(finding.exactQuote)), false);

  const gb = await analyzeProof(await buildDocx(["The Company shall organise the colour notice in writing."]), { language: "en-GB" });
  assert.equal(gb.plan.findings.some((finding) => finding.ruleId === "spelling.dictionary"), false);

  const usColour = await analyzeProof(await buildDocx(["The Company shall organize the color notice in writing."]), { language: "en-US" });
  assert.equal(usColour.plan.findings.some((finding) => finding.ruleId === "spelling.dictionary"), false);

  const gbColor = await analyzeProof(await buildDocx(["The Company shall organize the color notice in writing."]), { language: "en-GB" });
  assert.ok(gbColor.plan.findings.some((finding) => finding.ruleId === "spelling.dictionary" && finding.exactQuote === "color"));
});

test("a defined term repeated ten times is still excluded by the definition index", async () => {
  const result = await analyzeProof(await buildDocx([
    '"Zyxxco" means a defined party in this agreement.',
    ...Array.from({ length: 10 }, (_, index) => `The Company shall send the Zyxxco notice in writing ${index}.`),
  ]));
  assert.equal(result.plan.findings.some((finding) => finding.ruleId === "spelling.dictionary" && /Zyxxco/i.test(finding.exactQuote)), false);
});

test("a misspelling is still detected at one, two, three and ten occurrences", async () => {
  const word = "enviroment";
  for (const count of [1, 2, 3, 10]) {
    const paragraphs = Array.from({ length: count }, (_, index) => `Please send the ${word} notice in writing ${index}.`);
    const result = await analyzeProof(await buildDocx(paragraphs));
    const hits = result.plan.findings.filter((finding) => finding.ruleId === "spelling.dictionary" && finding.exactQuote === word);
    assert.equal(hits.length, 1, `count=${count}`);
    assert.equal(hits[0]?.kind, "comment");
    assert.equal(hits[0]?.relatedSpans.length, count - 1);
    if (count === 1) {
      assert.equal(/also appears/.test(hits[0]?.comment ?? ""), false);
    } else {
      assert.match(hits[0]?.comment ?? "", new RegExp(`also appears ${count - 1} more`));
    }
  }
});

test("quoted defined labels and short literals stay silent; quoted prose is commented", async () => {
  const literal = await analyzeProof(await buildDocx(['The Company shall use "goverment" only as a quoted example.']));
  assert.equal(literal.plan.findings.some((finding) => finding.exactQuote === "goverment"), false);

  const label = await analyzeProof(await buildDocx([
    '"Confidential Information" means the information described in this clause.',
    "The Company shall keep the Confidential Information in writing.",
  ]));
  assert.equal(label.plan.findings.some((finding) => finding.ruleId === "spelling.dictionary"), false);

  const prose = await analyzeProof(await buildDocx([
    'The letter states "The Supplier shall deliver the maintainance schedule in writing."',
  ]));
  const hit = prose.plan.findings.find((finding) => finding.exactQuote === "maintainance");
  assert.equal(hit?.ruleId, "spelling.dictionary");
  assert.equal(hit?.kind, "comment");
});

test("missing dictionary assets are incomplete, never a silent clean result", async () => {
  const { executeLaunchRules } = await import("./rule-runtime.ts");
  const result = await analyzeProof(await buildDocx(["The Company shall deliver the notice in writing."]));
  const failed = executeLaunchRules({
    source: result.source,
    extracted: result.extracted,
    sourceSha256: result.sourceSha256,
    indexes: result.indexes,
  }, {
    runRule: (_ctx, spec) => {
      if (spec.id === "spelling.dictionary") throw new Error("incomplete_spelling_dictionary");
      return [];
    },
  });
  const spelling = failed.executions.find((execution) => execution.ruleId === "spelling.dictionary");
  assert.equal(spelling?.outcome, "suppressed");
  assert.equal(spelling?.code, "incomplete_scope");
  assert.equal(failed.clean, false);
  assert.ok(failed.coverageReasons.includes("incomplete_scope"));
});
