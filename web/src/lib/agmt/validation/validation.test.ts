import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { exportProofDocx, validateProofExport } from "../export/docx.ts";
import { launchFixture } from "../corpus/launch-fixtures.ts";
import { generatePackage, POSITIVE_SPECS } from "../corpus/pwc/generate.ts";
import { validateOutputPackage } from "./structure.ts";
import { validateOutputReconstruction } from "./reconstruct.ts";

async function mutate(bytes: Buffer, path: string, fn: (xml: string) => string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes);
  zip.file(path, fn(await zip.file(path)!.async("string")));
  return zip.generateAsync({ type: "nodebuffer" });
}

test("PWC-11 independent validator accepts corpus exports or records unsupported, and rejects mutations", async () => {
  const source = await launchFixture("body");
  const exported = await exportProofDocx(source);
  await validateOutputPackage({ sourceBytes: source, output: exported.bytes, receipt: exported.receipt });
  await validateOutputReconstruction({ sourceBytes: source, output: exported.bytes, receipt: exported.receipt, analysis: exported.analysis });

  const mutations: Array<[string, string, (xml: string) => string]> = [
    ["altered_rPr", "word/document.xml", (xml) => xml.includes("<w:b/>") ? xml.replace("<w:b/>", "<w:i/>") : xml.replace("<w:r>", "<w:r><w:rPr><w:i/></w:rPr>")],
    ["shifted_comment", "word/document.xml", (xml) => xml.replace(/<w:commentRangeStart[^/]*\/>/, "")],
    ["extra_revision", "word/document.xml", (xml) => xml.replace("<w:p>", '<w:p><w:ins w:id="99999" w:author="Agmt Proof" w:date="2026-01-01T00:00:00Z"><w:r><w:t>x</w:t></w:r></w:ins>')],
    ["original_comment", "word/comments.xml", (xml) => xml.replace("Please confirm the reference.", "This is legally invalid.")],
    ["unrelated_entry", "docProps/app.xml", (xml) => xml.replace(/<Pages>.*?<\/Pages>/, "<Pages>999</Pages>")],
    ["extra_relationship", "word/_rels/document.xml.rels", (xml) => xml.replace("</Relationships>", '<Relationship Id="rIdEvil" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="https://evil.example/x"/ ></Relationships>')],
  ];
  let rejected = 0;
  for (const [name, path, fn] of mutations) {
    const bad = await mutate(exported.bytes, path, fn);
    await assert.rejects(
      () => validateProofExport(source, bad, exported.receipt),
      (error: unknown) => {
        rejected++;
        return error instanceof Error && error.message.length > 0;
      },
      name,
    );
  }
  assert.equal(rejected, mutations.length);

  const employment = POSITIVE_SPECS.find((spec) => spec.id === "employment_typo_split");
  assert.ok(employment);
  const generated = await generatePackage(employment);
  const result = await exportProofDocx(generated.bytes);
  await validateProofExport(generated.bytes, result.bytes, result.receipt);
});
