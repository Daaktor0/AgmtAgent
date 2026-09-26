import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { extractDocx } from "../../docx-v2.ts";
import { analyzeProof } from "../../proof/launch.ts";
import type { ProofSource } from "../../source-map.ts";
import {
  ENGINE_BASELINE_MISSES,
  expectedFindingsFor,
  expectedKey,
  quoteOffsets,
} from "./expected.ts";
import {
  POSITIVE_SPECS,
  PWC_CORPUS_GENERATOR_SEED,
  PWC_CORPUS_GENERATOR_VERSION,
  PWC_SYNTHETIC_AUTHOR,
  PWC_SYNTHETIC_REVIEWER,
  allSpecs,
  assertTargetQuoteInSpec,
  cleanTwinSpec,
  generateCorpus,
  generatePackage,
  type GeneratedPackage,
  type PackageSpec,
} from "./generate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8")) as {
  generatorSeed: string;
  generatorVersion: string;
  packages: Array<{
    id: string;
    kind: "positive" | "clean_twin";
    family: string;
    profile: string;
    language: string;
    sha256: string;
    byteSize: number;
    supported: boolean;
    expectedFindingIds: string[];
  }>;
};

const IDENTITY_FORBIDDEN = [
  /@gmail\./i,
  /@agmt\.legal/i,
  /abhinav/i,
  /daaktor/i,
  /client[_-]?file/i,
];

function packageKind(spec: PackageSpec): "positive" | "clean_twin" {
  return spec.id.endsWith("_clean") ? "clean_twin" : "positive";
}

async function sourceOf(bytes: Buffer): Promise<ProofSource> {
  let source: ProofSource | undefined;
  await extractDocx(bytes, (captured) => {
    source = captured;
  });
  if (!source) throw new Error("proof source was not captured");
  return source;
}

function targetPresent(spec: PackageSpec): boolean {
  const haystack = [
    ...spec.blocks.map((block) => {
      if (block.type === "p" || block.type === "table" || block.type === "commented") return block.text;
      if (block.type === "split") return block.parts.join("");
      return block.prefix;
    }),
    spec.header ?? "",
  ].join("\n");
  if (spec.targetKind === "typo") return new RegExp(`\\b${spec.targetQuote}\\b`).test(haystack);
  if (spec.targetKind === "duplicate_word") {
    const word = spec.targetQuote.trim();
    return new RegExp(`\\b${word}[ \\t]+${word}\\b`).test(haystack);
  }
  return haystack.includes(spec.targetQuote);
}

test("PWC-03 corpus has 24 positive packages and 24 clean twins", () => {
  assert.equal(POSITIVE_SPECS.length, 24);
  assert.equal(allSpecs().length, 48);
  assert.equal(new Set(POSITIVE_SPECS.map((spec) => spec.id)).size, 24);
  const families = new Set(POSITIVE_SPECS.map((spec) => spec.family));
  for (const family of ["sha", "ssa", "spa", "nda", "services", "licence", "employment", "loan", "lease", "amendment", "schedule", "board_paper", "policy", "report", "letter"]) {
    assert.ok(families.has(family), family);
  }
});

test("PWC-03 expected quotes match authored paragraphs before packaging", () => {
  for (const spec of POSITIVE_SPECS) {
    assertTargetQuoteInSpec(spec);
    assert.equal(targetPresent(spec), true, spec.id);
    const clean = cleanTwinSpec(spec);
    if (spec.targetKind === "duplicate_number" || spec.targetKind === "duplicate_def") {
      const originalTarget = spec.blocks.find((block) => "target" in block && block.target);
      const cleanTarget = clean.blocks.find((block) => "target" in block && block.target);
      assert.ok(originalTarget && cleanTarget, spec.id);
      assert.notEqual(JSON.stringify(cleanTarget), JSON.stringify(originalTarget), clean.id);
    } else {
      assert.equal(targetPresent(clean), false, clean.id);
    }
    for (const action of spec.expected) {
      const paragraph = spec.blocks.map((block) => {
        if (block.type === "p" || block.type === "table" || block.type === "commented") return block.text;
        if (block.type === "split") return block.parts.join("");
        return `${block.prefix}${block.ins}`;
      })[action.paragraphIndex];
      const { start, end } = quoteOffsets(paragraph, action);
      assert.equal(paragraph.slice(start, end), action.quote);
    }
  }
});

test("PWC-03 generator is reproducible and matches the frozen manifest", async () => {
  const first = await generateCorpus();
  const second = await generateCorpus();
  assert.equal(first.length, 48);
  assert.equal(manifest.generatorSeed, PWC_CORPUS_GENERATOR_SEED);
  assert.equal(manifest.generatorVersion, PWC_CORPUS_GENERATOR_VERSION);
  assert.equal(manifest.packages.length, 48);
  for (let index = 0; index < first.length; index++) {
    assert.equal(first[index].sha256, second[index].sha256, first[index].spec.id);
    const entry = manifest.packages[index];
    assert.equal(entry.id, first[index].spec.id);
    assert.equal(entry.kind, first[index].kind);
    assert.equal(entry.sha256, first[index].sha256, entry.id);
    assert.equal(entry.byteSize, first[index].byteSize);
  }
});

test("PWC-03 expected quote matches the original source node", async () => {
  for (const spec of POSITIVE_SPECS) {
    const generated = await generatePackage(spec);
    const source = await sourceOf(generated.bytes);
    const findings = expectedFindingsFor(spec, "positive", generated.sha256);
    for (const finding of findings) {
      if (finding.quote == null || finding.paragraphIndex == null || finding.textStart == null || finding.textEnd == null) continue;
      const quote = finding.quote;
      const textStart = finding.textStart;
      const textEnd = finding.textEnd;
      const paragraph = source.paragraphs[finding.paragraphIndex];
      assert.ok(paragraph, `${spec.id} paragraph ${finding.paragraphIndex}`);
      assert.equal(paragraph.text.slice(textStart, textEnd), quote);
      const covering = paragraph.nodes.filter((node) => node.start < textEnd && node.end > textStart);
      assert.ok(covering.length > 0, `${spec.id} has no source node for ${quote}`);
      const reconstructed = covering
        .map((node) => node.text.slice(Math.max(0, textStart - node.start), Math.min(node.text.length, textEnd - node.start)))
        .join("");
      assert.equal(reconstructed, quote);
    }
    const xml = generated.bytes.toString("utf8");
    assert.match(xml, new RegExp(PWC_SYNTHETIC_AUTHOR));
    for (const forbidden of IDENTITY_FORBIDDEN) {
      assert.equal(forbidden.test(xml), false, `${spec.id} ${forbidden}`);
    }
  }
});

test("PWC-03 clean twins contain no target error", async () => {
  for (const spec of POSITIVE_SPECS) {
    const clean = cleanTwinSpec(spec);
    const generated = await generatePackage(clean, "clean_twin");
    const source = await sourceOf(generated.bytes);
    if (spec.targetKind === "duplicate_number" || spec.targetKind === "duplicate_def") {
      const fires = (await analyzeProof(generated.bytes)).plan.findings.filter((finding) => finding.ruleId === spec.targetRule);
      assert.equal(fires.length, 0, clean.id);
      continue;
    }
    const haystack = `${source.paragraphs.map((paragraph) => paragraph.text).join("\n")}\n${clean.header ?? ""}`;
    if (spec.targetKind === "typo") {
      assert.equal(new RegExp(`\\b${spec.targetQuote}\\b`).test(haystack), false, clean.id);
    } else if (spec.targetKind === "duplicate_word") {
      const word = spec.targetQuote.trim();
      assert.equal(new RegExp(`\\b${word}[ \\t]+${word}\\b`).test(haystack), false, clean.id);
    } else {
      assert.equal(haystack.includes(spec.targetQuote), false, clean.id);
    }
  }
});

test("PWC-03 current engine is evaluated against frozen expected actions; misses stay labelled", async () => {
  const misses: string[] = [];
  const cleanFires: string[] = [];
  for (const spec of POSITIVE_SPECS) {
    const positive = await generatePackage(spec);
    const clean = await generatePackage(cleanTwinSpec(spec), "clean_twin");
    const positiveResult = await analyzeProof(positive.bytes);
    const cleanResult = await analyzeProof(clean.bytes);
    assert.equal(positiveResult.llmCalls, 0);
    assert.equal(cleanResult.llmCalls, 0);

    for (const finding of expectedFindingsFor(spec, "positive", positive.sha256)) {
      if (finding.quote == null || finding.ruleId == null) continue;
      const hit = positiveResult.plan.findings.find((actual) =>
        actual.ruleId === finding.ruleId
        && actual.exactQuote === finding.quote
        && actual.primarySpan.textStart === finding.textStart
        && actual.primarySpan.textEnd === finding.textEnd
        && actual.replacement === finding.replacement
      );
      if (!hit) misses.push(expectedKey(finding));
    }

    if (spec.targetRule) {
      const fires = cleanResult.plan.findings.filter((actual) => {
        if (actual.ruleId !== spec.targetRule) return false;
        if (spec.targetKind === "typo") return actual.exactQuote === spec.targetQuote;
        if (spec.targetKind === "duplicate_word") return actual.exactQuote === spec.targetQuote;
        return actual.exactQuote === spec.targetQuote;
      });
      for (const fire of fires) cleanFires.push(`${spec.id}_clean::${fire.ruleId}::${fire.exactQuote}`);
    }
  }

  assert.deepEqual(cleanFires, [], "clean twins must not fire the target rule");
  const labelled = Object.values(ENGINE_BASELINE_MISSES).flat();
  assert.deepEqual(misses, labelled, "engine misses drifted; label them in ENGINE_BASELINE_MISSES, do not rewrite expected actions");
});

test("PWC-10 employment_typo_split keeps authored correction open; detection, anchoring and output-action are separate", async () => {
  const spec = POSITIVE_SPECS.find((item) => item.id === "employment_typo_split");
  assert.ok(spec);
  const generated = await generatePackage(spec);
  const expected = expectedFindingsFor(spec, "positive", generated.sha256).find((finding) => finding.quote === "recieve");
  assert.ok(expected);
  assert.equal(expected.action, "track_replace");
  const analysis = await analyzeProof(generated.bytes);
  const detected = analysis.plan.findings.find((finding) => finding.ruleId === "language.typo_allowlist" && finding.exactQuote === "recieve");
  assert.ok(detected, "detection: the quote is still found");
  assert.equal(detected.primarySpan.textStart, expected.textStart, "anchoring: span start");
  assert.equal(detected.primarySpan.textEnd, expected.textEnd, "anchoring: span end");
  assert.equal(detected.kind, "comment", "output-action: mixed rPr is not a safe tracked change");
  assert.equal(detected.replacement, null);
  assert.equal(
    ENGINE_BASELINE_MISSES["pwc-08-mixed-format-comment-only"]?.includes("employment_typo_split::language.typo_allowlist::recieve"),
    true,
  );
});


test("PWC-03 packages stay synthetic and family-separated", async () => {
  const generated: GeneratedPackage[] = [];
  for (const spec of allSpecs()) generated.push(await generatePackage(spec, packageKind(spec)));
  const authors = generated.flatMap((item) => [PWC_SYNTHETIC_AUTHOR, item.spec.comments?.[0]?.author ?? ""]).join(" ");
  assert.match(authors, /Synthetic/);
  assert.equal(/Microsoft User|Author1|John Smith/i.test(authors + PWC_SYNTHETIC_REVIEWER), false);
  const families = generated.filter((item) => item.kind === "positive").map((item) => item.spec.family);
  assert.equal(new Set(families).size >= 15, true);
});
