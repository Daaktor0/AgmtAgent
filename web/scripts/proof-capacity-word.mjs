import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { capacityFixture } from "../src/lib/agmt/corpus/capacity-fixtures.ts";
import { completeAgreementFixture } from "../src/lib/agmt/corpus/agreement-fixtures.ts";
import { processProofLocal } from "../src/lib/proof-local/pipeline.ts";
import { PROOF_LOCAL_POLICY_DESKTOP, PROOF_LOCAL_POLICY_LAB } from "../src/lib/proof-local/policy.ts";
import { launchFixture } from "../src/lib/agmt/corpus/launch-fixtures.ts";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const dir = join(webRoot, "tmp-proof-capacity-word");
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
    $repair = $false
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

const image = await capacityFixture("image_heavy", 8 * 1024 * 1024);
const processed = await processProofLocal(image, { policy: PROOF_LOCAL_POLICY_LAB });
writeFileSync(join(dir, "image_heavy.docx"), image);
writeFileSync(join(dir, "image_heavy_Proofread.docx"), processed.output);

const image100 = await capacityFixture("image_heavy", 100 * 1024 * 1024);
const processed100 = await processProofLocal(image100, { policy: PROOF_LOCAL_POLICY_LAB });
writeFileSync(join(dir, "image_heavy_100m_Proofread.docx"), processed100.output);

const body = new Uint8Array(await launchFixture("body"));
const bodyOut = await processProofLocal(body, { policy: PROOF_LOCAL_POLICY_DESKTOP });
writeFileSync(join(dir, "body.docx"), body);
writeFileSync(join(dir, "body_Proofread.docx"), bodyOut.output);

const long = await completeAgreementFixture(150, "labelled");
const longOut = await processProofLocal(long.bytes, { policy: PROOF_LOCAL_POLICY_DESKTOP });
writeFileSync(join(dir, "agreement_150_Proofread.docx"), longOut.output);

const table = new Uint8Array(await launchFixture("table"));
const tableOut = await processProofLocal(table, { policy: PROOF_LOCAL_POLICY_DESKTOP });
writeFileSync(join(dir, "table_Proofread.docx"), tableOut.output);

const prior = new Uint8Array(await launchFixture("prior_review"));
const priorOut = await processProofLocal(prior, { policy: PROOF_LOCAL_POLICY_DESKTOP });
writeFileSync(join(dir, "prior_review_Proofread.docx"), priorOut.output);

const targets = [
  ["body", join(dir, "body_Proofread.docx")],
  ["table", join(dir, "table_Proofread.docx")],
  ["prior_review", join(dir, "prior_review_Proofread.docx")],
  ["agreement_150", join(dir, "agreement_150_Proofread.docx")],
  ["image_heavy_8m", join(dir, "image_heavy_Proofread.docx")],
  ["image_heavy_100m", join(dir, "image_heavy_100m_Proofread.docx")],
];
const word = {};
let failed = false;
for (const [label, path] of targets) {
  const result = openWord(path, label);
  word[label] = { status: result.status, stdout: result.stdout?.trim(), stderr: result.stderr?.trim() };
  console.log(word[label].stdout || word[label].stderr || `${label} WORD_FAILED`);
  if (result.status !== 0) failed = true;
}
console.log(JSON.stringify({
  word,
  image8m: { sourceBytes: image.byteLength, outputBytes: processed.outputBytes, corrections: processed.corrections, comments: processed.comments },
  image100m: { sourceBytes: image100.byteLength, outputBytes: processed100.outputBytes, corrections: processed100.corrections, comments: processed100.comments },
  agreement150: { sourceBytes: long.bytes.byteLength, outputBytes: longOut.outputBytes, corrections: longOut.corrections, comments: longOut.comments },
}, null, 2));
if (failed) process.exit(1);
