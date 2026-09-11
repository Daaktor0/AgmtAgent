/**
 * Representative beta evaluation. Labels in labels.ts were written first.
 * This is not packed PEE unit-test evidence and not the original user document.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocx } from "../src/lib/agmt/docx.ts";
import { BETA_EVAL_DOCS, type BetaEvalExpected } from "../src/lib/agmt/corpus/beta-eval/labels.ts";
import { processProofLocal } from "../src/lib/proof-local/pipeline.ts";
import { exportProofDocx } from "../src/lib/agmt/export/docx.ts";
import JSZip from "jszip";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "tmp-proof-beta-eval");

type Row = {
  id: string;
  kind: string;
  clean: boolean;
  expected: BetaEvalExpected[];
  actual: Array<{ ruleId: string; kind: string; quote: string }>;
  tp: number;
  fp: Array<{ ruleId: string; kind: string; quote: string }>;
  fn: BetaEvalExpected[];
  coverage: string;
  corrections: number;
  comments: number;
  notices: number;
  headerUnchangedIfUnused: boolean | null;
  blocked: string[];
};

function keyOf(item: { ruleId: string; kind: string; quote: string }): string {
  return `${item.ruleId}|${item.kind}|${item.quote}`;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const rows: Row[] = [];
  const perRule = new Map<string, { tp: number; fp: number; fn: number }>();
  const bump = (ruleId: string, field: "tp" | "fp" | "fn") => {
    const current = perRule.get(ruleId) ?? { tp: 0, fp: 0, fn: 0 };
    current[field] += 1;
    perRule.set(ruleId, current);
  };

  for (const doc of BETA_EVAL_DOCS) {
    const source = await buildDocx(doc.paragraphs, doc.header ? { header: doc.header } : undefined);
    const result = await processProofLocal(new Uint8Array(source), { language: doc.language, profile: doc.kind === "prose" || doc.kind === "letter" ? "general" : "agreement" });
    const actual = result.findings.map((finding) => ({ ruleId: finding.ruleId, kind: finding.kind, quote: finding.quote }));
    const expectedKeys = new Map(doc.expected.map((item) => [keyOf(item), item]));
    const actualKeys = new Set(actual.map(keyOf));
    const tp = doc.expected.filter((item) => actualKeys.has(keyOf(item))).length;
    const fn = doc.expected.filter((item) => !actualKeys.has(keyOf(item)));
    const fp = actual.filter((item) => !expectedKeys.has(keyOf(item)));
    for (const item of doc.expected) bump(item.ruleId, actualKeys.has(keyOf(item)) ? "tp" : "fn");
    for (const item of fp) bump(item.ruleId, "fp");

    const blocked: string[] = [];
    if (fp.some((item) => item.kind === "correction")) blocked.push("unexpected_correction");
    const exported = await exportProofDocx(Buffer.from(source), new Date("2026-09-11T00:00:00Z"));
    const zip = await JSZip.loadAsync(exported.bytes);
    const documentXml = await zip.file("word/document.xml")!.async("string");
    if (/<(w:del|w:ins)\b/.test(documentXml) && result.corrections === 0 && result.notices === 0) {
      blocked.push("unplanned_body_revision");
    }
    writeFileSync(join(outDir, `${doc.id}.docx`), Buffer.from(result.output));

    rows.push({
      id: doc.id,
      kind: doc.kind,
      clean: doc.clean,
      expected: doc.expected,
      actual,
      tp,
      fp,
      fn,
      coverage: result.coverage,
      corrections: result.corrections,
      comments: result.comments,
      notices: result.notices,
      headerUnchangedIfUnused: null,
      blocked,
    });
  }

  const report = {
    labelledBeforeExecution: true,
    originalUserExample: "not reproduced",
    documentCount: rows.length,
    cleanCount: rows.filter((row) => row.clean).length,
    dirtyCount: rows.filter((row) => !row.clean).length,
    blocked: rows.filter((row) => row.blocked.length),
    perRule: Object.fromEntries(perRule),
    documents: rows,
  };
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    documents: rows.length,
    clean: report.cleanCount,
    dirty: report.dirtyCount,
    blocked: report.blocked.map((row) => row.id),
    perRule: report.perRule,
    misses: rows.filter((row) => row.fn.length || row.fp.length).map((row) => ({
      id: row.id,
      fp: row.fp,
      fn: row.fn,
    })),
  }, null, 2));
}

await main();
