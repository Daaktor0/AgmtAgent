/**
 * Capacity measurement. Lab policy only. Does not change published UI caps.
 * 100 MB / 150 MB are targets to attempt, not claims.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { capacityFixture, CAPACITY_FAMILIES, type CapacityFamily } from "../src/lib/agmt/corpus/capacity-fixtures.ts";
import { inspectZipCentralDirectory } from "../src/lib/agmt/zip-safety.ts";
import { processProofLocal } from "../src/lib/proof-local/pipeline.ts";
import { PROOF_LOCAL_POLICY_LAB } from "../src/lib/proof-local/policy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const maxMb = Number(process.env.PROOF_CAPACITY_MAX_MB ?? "8");
const familyFilter = process.env.PROOF_CAPACITY_FAMILY as CapacityFamily | undefined;
const outPath = join(
  here,
  familyFilter
    ? `../src/lib/proof-local/capacity-evidence-${familyFilter}.json`
    : "../src/lib/proof-local/capacity-evidence.json",
);

function miB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 1000) / 1000;
}

function rss(): number {
  return process.memoryUsage().rss;
}
const sizes = [256 * 1024, 1 * 1024 * 1024, 2 * 1024 * 1024, 4 * 1024 * 1024, 8 * 1024 * 1024, 16 * 1024 * 1024, 25 * 1024 * 1024, 50 * 1024 * 1024, 100 * 1024 * 1024, 150 * 1024 * 1024]
  .filter((size) => size <= maxMb * 1024 * 1024);
const families = familyFilter ? CAPACITY_FAMILIES.filter((family) => family === familyFilter) : CAPACITY_FAMILIES;

type Row = {
  family: CapacityFamily;
  targetBytes: number;
  compressedBytes: number;
  expandedBytes: number;
  entries: number;
  documentXmlBytes: number;
  elapsedMs: number;
  rssBefore: number;
  rssAfter: number;
  rssDelta: number;
  outcome: string;
  corrections?: number;
  comments?: number;
  outputBytes?: number;
};

const rows: Row[] = [];

for (const family of families) {
  for (const target of sizes) {
    globalThis.gc?.();
    const rssBefore = rss();
    const started = Date.now();
    let row: Row = {
      family,
      targetBytes: target,
      compressedBytes: 0,
      expandedBytes: 0,
      entries: 0,
      documentXmlBytes: 0,
      elapsedMs: 0,
      rssBefore,
      rssAfter: rssBefore,
      rssDelta: 0,
      outcome: "not_run",
    };
    try {
      const source = await capacityFixture(family, target);
      const directory = inspectZipCentralDirectory(source, PROOF_LOCAL_POLICY_LAB.zip);
      const documentXml = directory.entries.find((entry) => entry.name === "word/document.xml");
      row = {
        ...row,
        compressedBytes: source.byteLength,
        expandedBytes: directory.expandedBytes,
        entries: directory.entries.length,
        documentXmlBytes: documentXml?.uncompressedSize ?? 0,
      };
      const result = await processProofLocal(source, { policy: PROOF_LOCAL_POLICY_LAB });
      row.outcome = "ok";
      row.corrections = result.corrections;
      row.comments = result.comments;
      row.outputBytes = result.outputBytes;
    } catch (error) {
      row.outcome = error instanceof Error ? error.message : "error";
    }
    row.elapsedMs = Date.now() - started;
    row.rssAfter = rss();
    row.rssDelta = row.rssAfter - rssBefore;
    rows.push(row);
    console.log(JSON.stringify({
      family,
      targetMiB: miB(target),
      compressedMiB: miB(row.compressedBytes),
      expandedMiB: miB(row.expandedBytes),
      elapsedMs: row.elapsedMs,
      rssDeltaMiB: miB(row.rssDelta),
      outcome: row.outcome,
    }));
    if (row.outcome !== "ok") break;
  }
}

const evidence = {
  generatedAt: new Date().toISOString(),
  host: "node",
  policy: "PROOF_LOCAL_POLICY_LAB",
  maxMb,
  note: "Engineering measurement only. Published UI/help caps stay on the measured policy, not this lab ceiling.",
  rows,
};

writeFileSync(outPath, JSON.stringify(evidence, null, 2));
console.log(`wrote ${outPath}`);
