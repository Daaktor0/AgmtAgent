/** Synthetic source/output pairs for human Word review. No live services. */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { LAUNCH_FIXTURES, launchFixture } from "../src/lib/agmt/corpus/launch-fixtures.ts";
import { exportProofDocx } from "../src/lib/agmt/export/docx.ts";

const output = join(dirname(fileURLToPath(import.meta.url)), "../../docs/proof/word-review");
await mkdir(output, { recursive: true });
const evidence = [];
for (const fixture of LAUNCH_FIXTURES) {
  const source = await launchFixture(fixture);
  const result = await exportProofDocx(source, new Date("2026-09-05T00:00:00Z"));
  const sourcePath = join(output, `${fixture}.docx`);
  const markedPath = join(output, `${fixture}_Proofread.docx`);
  await writeFile(sourcePath, source);
  await writeFile(markedPath, result.bytes);
  evidence.push({
    fixture,
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    outputSha256: createHash("sha256").update(result.bytes).digest("hex"),
    corrections: result.receipt.plan.findings.filter((finding) => finding.kind === "correction").length,
    comments: result.receipt.commentIds.length,
    notices: result.receipt.plan.notices.length,
    wordValidation: "not_run",
    openXmlSdkValidation: "not_run",
    developmentOnly: true,
  });
}
await writeFile(join(output, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
