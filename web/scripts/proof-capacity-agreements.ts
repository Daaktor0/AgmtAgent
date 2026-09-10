/**
 * Representative complete-agreement measurement. Records ZIP / XML / extracted
 * text separately. Lab and published desktop policies are both applied so the
 * admit gate can be named. Not a published claim by itself.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGREEMENT_PAGE_TARGETS,
  classifyCapacityFailure,
  completeAgreementFixture,
  packageCapacitySnapshot,
  type AgreementKind,
} from "../src/lib/agmt/corpus/agreement-fixtures.ts";
import { processProofLocal } from "../src/lib/proof-local/pipeline.ts";
import { PROOF_LOCAL_POLICY_DESKTOP, PROOF_LOCAL_POLICY_LAB } from "../src/lib/proof-local/policy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const kinds: AgreementKind[] = ["clean", "labelled"];
const pages = process.env.PROOF_AGREEMENT_PAGES
  ? process.env.PROOF_AGREEMENT_PAGES.split(",").map((value) => Number(value) as 25 | 75 | 150 | 300)
  : [...AGREEMENT_PAGE_TARGETS];

type Row = {
  pages: number;
  kind: AgreementKind;
  sourceZipBytes: number;
  expandedBytes: number;
  documentXmlBytes: number;
  totalXmlBytes: number;
  extractedCodePoints: number | null;
  extractedGate: string;
  xmlAdmitGate: string;
  paragraphCount: number;
  tableCount: number;
  revisionCount: number;
  commentAnchorCount: number;
  elapsedMs: number;
  rssDelta: number;
  outcome: string;
  failureClass: string | null;
  corrections?: number;
  comments?: number;
  coverage?: string;
};

const rows: Row[] = [];

for (const pageCount of pages) {
  for (const kind of kinds) {
    globalThis.gc?.();
    const rssBefore = process.memoryUsage().rss;
    const started = Date.now();
    const fixture = await completeAgreementFixture(pageCount, kind);
    const snap = packageCapacitySnapshot(fixture.bytes, PROOF_LOCAL_POLICY_DESKTOP);
    const row: Row = {
      pages: pageCount,
      kind,
      sourceZipBytes: snap.sourceZipBytes,
      expandedBytes: snap.expandedBytes,
      documentXmlBytes: snap.documentXmlBytes,
      totalXmlBytes: snap.totalXmlBytes,
      extractedCodePoints: snap.extractedCodePoints,
      extractedGate: snap.extractedGate,
      xmlAdmitGate: snap.xmlAdmitGate,
      paragraphCount: snap.paragraphCount,
      tableCount: snap.tableCount,
      revisionCount: snap.revisionCount,
      commentAnchorCount: snap.commentAnchorCount,
      elapsedMs: 0,
      rssDelta: 0,
      outcome: "not_run",
      failureClass: null,
    };
    try {
      const result = await processProofLocal(fixture.bytes, { policy: PROOF_LOCAL_POLICY_DESKTOP });
      row.outcome = "ok";
      row.corrections = result.corrections;
      row.comments = result.comments;
      row.coverage = result.coverage;
    } catch (error) {
      const code = error instanceof Error ? error.message : "error";
      row.outcome = code;
      row.failureClass = classifyCapacityFailure(code);
      try {
        await processProofLocal(fixture.bytes, { policy: PROOF_LOCAL_POLICY_LAB });
        row.outcome = `${code}+lab_ok`;
      } catch (labError) {
        row.outcome = `${code}+lab:${labError instanceof Error ? labError.message : "error"}`;
      }
    }
    row.elapsedMs = Date.now() - started;
    row.rssDelta = process.memoryUsage().rss - rssBefore;
    rows.push(row);
    console.log(JSON.stringify({
      pages: pageCount,
      kind,
      sourceZipBytes: snap.sourceZipBytes,
      documentXmlBytes: snap.documentXmlBytes,
      extractedCodePoints: snap.extractedCodePoints,
      xmlAdmitGate: snap.xmlAdmitGate,
      extractedGate: snap.extractedGate,
      outcome: row.outcome,
      elapsedMs: row.elapsedMs,
    }));
  }
}

const outPath = join(here, "../src/lib/proof-local/capacity-evidence-agreements.json");
writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  host: "node",
  policy: "PROOF_LOCAL_POLICY_DESKTOP",
  rows,
}, null, 2));
console.log(`wrote ${outPath}`);
if (rows.some((row) => row.outcome !== "ok")) process.exit(1);
