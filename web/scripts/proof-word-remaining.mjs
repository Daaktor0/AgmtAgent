import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { completeAgreementFixture } from "../src/lib/agmt/corpus/agreement-fixtures.ts";
import { capacityFixture } from "../src/lib/agmt/corpus/capacity-fixtures.ts";
import { processProofLocal } from "../src/lib/proof-local/pipeline.ts";
import { PROOF_LOCAL_POLICY_DESKTOP } from "../src/lib/proof-local/policy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "tmp-proof-capacity-word");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

function openWord(path, label) {
  const escaped = path.replaceAll("\\", "\\\\").replaceAll("'", "''");
  return spawnSync("powershell.exe", ["-NoProfile", "-Command", `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open('${escaped}', $false, $true)
  try {
    $pages = $doc.ComputeStatistics(2)
    $revisions = $doc.Revisions.Count
    $comments = $doc.Comments.Count
    $tables = $doc.Tables.Count
    $shapes = $doc.InlineShapes.Count
    Write-Output ("${label} pages=" + $pages + " revisions=" + $revisions + " comments=" + $comments + " tables=" + $tables + " inlineshapes=" + $shapes)
  } finally { $doc.Close([ref]$false) }
} finally {
  $word.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}
`], { encoding: "utf8", timeout: 300_000 });
}

const long = await completeAgreementFixture(300, "labelled");
const longOut = await processProofLocal(long.bytes, { policy: PROOF_LOCAL_POLICY_DESKTOP });
const longPath = join(dir, "agreement_300_Proofread.docx");
writeFileSync(longPath, longOut.output);

const tables = await capacityFixture("tables", 24 * 1024);
const tablesOut = await processProofLocal(tables, { policy: PROOF_LOCAL_POLICY_DESKTOP });
const tablesPath = join(dir, "tables_Proofread.docx");
writeFileSync(tablesPath, tablesOut.output);

let failed = false;
for (const [label, path] of [["agreement_300", longPath], ["tables", tablesPath]]) {
  const result = openWord(path, label);
  const line = (result.stdout || result.stderr || `${label} WORD_FAILED`).trim();
  console.log(line);
  if (result.status !== 0) failed = true;
}
console.log(JSON.stringify({
  agreement300: {
    sourceBytes: long.bytes.byteLength,
    outputBytes: longOut.outputBytes,
    corrections: longOut.corrections,
    comments: longOut.comments,
    findings: longOut.findings.map((finding) => finding.ruleId),
  },
  tables: {
    sourceBytes: tables.byteLength,
    outputBytes: tablesOut.outputBytes,
    corrections: tablesOut.corrections,
    comments: tablesOut.comments,
  },
}, null, 2));
if (failed) process.exit(1);
