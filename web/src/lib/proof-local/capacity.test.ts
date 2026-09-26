import assert from "node:assert/strict";
import { test } from "node:test";
import { capacityFixture } from "../agmt/corpus/capacity-fixtures.ts";
import { DocxPackage, zipPayloadEquals } from "../agmt/docx-package.ts";
import { inspectZipCentralDirectory } from "../agmt/zip-safety.ts";
import { admitLocalDocument } from "./admit.ts";
import { processProofLocal } from "./pipeline.ts";
import { PROOF_LOCAL_POLICY_LAB } from "./policy.ts";
import { PROOF_LOCAL_MAX_SOURCE_BYTES } from "./limits.ts";

test("published policy still refuses oversized sources", () => {
  const huge = new Uint8Array(8);
  huge[0] = 0x50;
  huge[1] = 0x4b;
  assert.throws(
    () => admitLocalDocument(huge, { policy: { ...PROOF_LOCAL_POLICY_LAB, maxSourceBytes: 4 } }),
    /source_too_large/,
  );
  assert.ok(PROOF_LOCAL_MAX_SOURCE_BYTES >= 8 * 1024 * 1024);
});

test("lab policy processes an image-heavy package above 1 MiB and preserves media", async () => {
  const source = await capacityFixture("image_heavy", 1.25 * 1024 * 1024);
  assert.ok(source.byteLength > 1 * 1024 * 1024, "fixture must exceed the previous 1 MiB source cap");
  const directory = inspectZipCentralDirectory(source, PROOF_LOCAL_POLICY_LAB.zip);
  assert.ok(directory.expandedBytes > 1 * 1024 * 1024);
  const result = await processProofLocal(source, { policy: PROOF_LOCAL_POLICY_LAB });
  assert.ok(result.output.byteLength > 0);
  assert.equal(result.admit.clamav, "cannot_run_in_browser");
  const original = DocxPackage.open(source, { limits: PROOF_LOCAL_POLICY_LAB.zip, verify: true });
  const output = DocxPackage.open(result.output, { limits: PROOF_LOCAL_POLICY_LAB.zip, verify: true });
  assert.equal(zipPayloadEquals(original, output, "word/media/image1.png"), true);
  assert.ok(result.corrections + result.comments >= 1);
});

test("text, image, revision and table families process under the lab policy at 24 KiB", async () => {
  for (const family of ["text_heavy", "image_heavy", "revisions", "tables"] as const) {
    const source = await capacityFixture(family, 24 * 1024);
    const result = await processProofLocal(source, { policy: PROOF_LOCAL_POLICY_LAB });
    assert.ok(result.output.byteLength >= 4, family);
    assert.equal(result.admit.status, "structurally_admitted", family);
  }
});

test("adversarial high-ratio packages are refused by ZIP limits, not processed", async () => {
  const source = await capacityFixture("adversarial", 24 * 1024);
  await assert.rejects(
    () => processProofLocal(source, { policy: PROOF_LOCAL_POLICY_LAB }),
    /suspicious_compression_ratio|package_too_complex|invalid_docx_zip/,
  );
});
