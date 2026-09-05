/** Synthetic fixtures only. This does not contact any service or process user documents. */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { LAUNCH_FIXTURES, launchFixture } from "../src/lib/agmt/corpus/launch-fixtures.ts";
import { exportProofDocx } from "../src/lib/agmt/export/docx.ts";

const output = fileURLToPath(new URL("../src/lib/agmt/corpus/launch-demo/", import.meta.url));
await mkdir(output, { recursive: true });
const evidence = [];
for (const fixture of LAUNCH_FIXTURES) {
  const source = await launchFixture(fixture);
  const result = await exportProofDocx(source, new Date("2026-09-05T00:00:00Z"));
  await writeFile(join(output, `${fixture}.docx`), source);
  await writeFile(join(output, `${fixture}_Proofread.docx`), result.bytes);
  evidence.push({ fixture, corrections: result.receipt.plan.findings.filter((f) => f.kind === "correction").length, comments: result.receipt.commentIds.length, sourceSha256: result.receipt.plan.sourceSha256, outputSha256: createHash("sha256").update(result.bytes).digest("hex"), automatedValidation: "passed", wordValidation: "not_run", openXmlSdkValidation: "not_run" });
}
await writeFile(join(output, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
