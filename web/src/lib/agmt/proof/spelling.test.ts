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
