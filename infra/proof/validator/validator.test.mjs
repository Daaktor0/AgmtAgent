import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const csproj = readFileSync(join(here, "ProofValidator.csproj"), "utf8");
const program = readFileSync(join(here, "Program.cs"), "utf8");

test("PWC-12 pins Open XML SDK 3.5.1 MIT and emits closed JSON", () => {
  assert.match(csproj, /DocumentFormat\.OpenXml" Version="3\.5\.1"/);
  assert.match(csproj, /MIT/);
  assert.match(program, /OpenXmlValidator/);
  assert.match(program, /FileFormatVersions\.Office2016/);
  assert.equal(/error\.Description|InnerText|filename/.test(program), false);
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function dotnetAvailable() {
  const probe = spawnSync("dotnet", ["--version"], { encoding: "utf8" });
  return probe.status === 0;
}

async function minimalDocx(paragraph = "The Company shall recieve the notice.") {
  const { default: JSZip } = await import(pathToFileURL(join(here, "../../../web/node_modules/jszip/lib/index.js")).href);
  const zip = new JSZip();
  const date = new Date(0);
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    { date, createFolders: false },
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    { date, createFolders: false },
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t xml:space="preserve">${paragraph}</w:t></w:r></w:p><w:sectPr/></w:body>
</w:document>`,
    { date, createFolders: false },
  );
  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

function runValidator(sourcePath, outputPath, sourceSha, outputSha) {
  return spawnSync(
    "dotnet",
    ["run", "--project", join(here, "ProofValidator.csproj"), "--",
      "--source", sourcePath, "--output", outputPath,
      "--source-sha256", sourceSha, "--output-sha256", outputSha,
      "--target", "Office2016"],
    { encoding: "utf8", timeout: 120_000 },
  );
}



test("PWC-12 local SDK harness validates synthetic packages when dotnet is installed", { skip: !dotnetAvailable() }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "pwc12-"));
  try {
    const valid = await minimalDocx();
    const sourcePath = join(dir, "source.docx");
    const outputPath = join(dir, "output.docx");
    writeFileSync(sourcePath, valid);
    writeFileSync(outputPath, valid);
    const result = runValidator(sourcePath, outputPath, sha256(valid), sha256(valid));
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const body = JSON.parse(result.stdout.trim().split("\n").at(-1));
    assert.equal(body.version, "proof-sdk-validator-v1");
    assert.equal(["ok", "schema_errors"].includes(body.code), true);
    assert.equal(body.valid, body.code === "ok");
    assert.equal("diagnostics" in body, false);
    assert.equal(typeof body.errorCount, "number");

    const badPath = join(dir, "bad.docx");
    writeFileSync(badPath, Buffer.from("not-a-package"));
    const invalid = runValidator(badPath, badPath, sha256(Buffer.from("not-a-package")), sha256(Buffer.from("not-a-package")));
    const invalidBody = JSON.parse(invalid.stdout.trim().split("\n").at(-1));
    assert.equal(invalidBody.valid, false);
    assert.equal(invalidBody.code, "invalid_package");

    const docm = join(dir, "macro.docm");
    writeFileSync(docm, valid);
    const unsupported = runValidator(docm, docm, sha256(valid), sha256(valid));
    const unsupportedBody = JSON.parse(unsupported.stdout.trim().split("\n").at(-1));
    assert.equal(unsupportedBody.code, "unsupported_extension");
    assert.equal(unsupportedBody.valid, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

