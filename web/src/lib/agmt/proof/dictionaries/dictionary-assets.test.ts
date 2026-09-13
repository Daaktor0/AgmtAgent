import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import nspell from "nspell";
import { buildDocx } from "../../docx.ts";
import { processProofLocal } from "../../../proof-local/pipeline.ts";
import { TYPO_ALLOWLIST } from "../typo-allowlist.ts";
import { hunspellFiles as nodeFiles } from "./load.ts";
import { hunspellFiles as stubFiles } from "./load.stub.ts";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../../../../../");

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("SSR stub throws; copied Hunspell lists are the pinned SCOWL dictionaries", () => {
  assert.throws(() => stubFiles("en-GB"), /incomplete_spelling_dictionary/);
  assert.throws(() => stubFiles("en-US"), /incomplete_spelling_dictionary/);
  const vite = readFileSync(join(webRoot, "vite.config.ts"), "utf8");
  assert.match(vite, /options\.ssr[\s\S]*load\.stub\.ts/);
  assert.match(vite, /load\.browser\.ts/);
  const browserLoad = readFileSync(join(here, "load.browser.ts"), "utf8");
  assert.match(browserLoad, /en-GB\.aff\?raw/);
  assert.match(browserLoad, /en-GB\.dic\?raw/);
  assert.match(browserLoad, /en\.aff\?raw/);
  assert.match(browserLoad, /en\.dic\?raw/);
  assert.doesNotMatch(browserLoad, /incomplete_spelling_dictionary|fileURLToPath|node:fs/);
  const deps = readFileSync(join(webRoot, "../infra/proof/dependencies.md"), "utf8");
  const expected = {
    "en-GB.aff": "8ae1f19d4840d957728ad90555d5a8dff6cc5c046279c95ff0c00fc0a0136c7b",
    "en-GB.dic": "869fe17ba4ee4b5401c60a666ee2d6a3dcc237f460b7294435df1cc6a799aa57",
    "en.aff": "8ae1f19d4840d957728ad90555d5a8dff6cc5c046279c95ff0c00fc0a0136c7b",
    "en.dic": "f0b1a234bd178bdd01875b2a392a9647f888b8fe879f79c52aae62c2759b3647",
  };
  for (const [name, digest] of Object.entries(expected)) {
    const bytes = readFileSync(join(here, name));
    assert.equal(sha256(bytes), digest, name);
    assert.match(deps, new RegExp(digest));
  }
  assert.match(deps, /nspell \| 2\.1\.5 \| MIT/);
  assert.match(deps, /dictionary-en-gb \| 3\.0\.0/);
  assert.match(deps, /dictionary-en \| 4\.0\.0/);
});

test("goverment and mispelled are dictionary misses, not allowlist entries", () => {
  assert.equal("goverment" in TYPO_ALLOWLIST, false);
  assert.equal("mispelled" in TYPO_ALLOWLIST, false);
  const gb = nspell(nodeFiles("en-GB").aff, nodeFiles("en-GB").dic);
  const us = nspell(nodeFiles("en-US").aff, nodeFiles("en-US").dic);
  assert.equal(gb.correct("goverment"), false);
  assert.equal(gb.correct("government"), true);
  assert.equal(gb.correct("mispelled"), false);
  assert.equal(us.correct("goverment"), false);
  assert.equal(gb.correct("colour"), true);
  assert.equal(us.correct("color"), true);
  assert.equal(gb.correct("color"), false);
});

test("browser entry looks up held-out misspellings outside the typo allowlist", async () => {
  const heldOut = ["calender", "yeild", "questionaire", "oppurtunity", "harrassment"];
  for (const word of heldOut) {
    assert.equal(word in TYPO_ALLOWLIST, false, word);
  }
  const source = await buildDocx(heldOut.map((word) => `Please send the ${word} notice in writing.`));
  const result = await processProofLocal(new Uint8Array(source));
  const quotes = result.findings.filter((finding) => finding.ruleId === "spelling.dictionary").map((finding) => finding.quote);
  for (const word of heldOut) {
    assert.ok(quotes.includes(word), `${word} missing from ${quotes.join("|")}`);
  }
  const expected: Readonly<Record<string, string | null>> = {
    calender: "calendar",
    yeild: null,
    questionaire: "questionnaire",
    oppurtunity: "opportunity",
    harrassment: "harassment",
  };
  for (const finding of result.findings.filter((item) => item.ruleId === "spelling.dictionary")) {
    const replacement = expected[finding.quote];
    assert.equal(finding.kind, replacement ? "correction" : "comment", finding.quote);
    assert.equal(finding.replacement, replacement, finding.quote);
  }
});
