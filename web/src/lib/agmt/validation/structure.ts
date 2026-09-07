/**
 * Independent package gate (PWC-11). Allowed changed parts are derived from
 * the source package and the edit plan, not from receipt.modifiedParts.
 */
import assert from "node:assert/strict";
import JSZip from "jszip";
import { XMLValidator } from "fast-xml-parser";
import { extractDocx } from "../docx-v2.ts";
import { inspectZipCentralDirectory, verifyZipInflation, ZIP_LIMITS } from "../zip-safety.ts";
import { plannedModifiedParts, type ExportReceipt } from "../export/receipt.ts";
import type { ExportPlan } from "../proof/contracts.ts";

export type PackageValidationInput = {
  sourceBytes: Buffer;
  output: Buffer;
  receipt: ExportReceipt;
  sourceZip?: JSZip;
};

export function derivedModifiedParts(sourceZip: JSZip, plan: ExportPlan): string[] {
  return plannedModifiedParts(Boolean(sourceZip.file("word/comments.xml")), plan);
}

export async function validateOutputPackage(input: PackageValidationInput): Promise<void> {
  if (input.output.length > ZIP_LIMITS.MAX_OUTPUT_BYTES) throw new Error("output_too_large");
  inspectZipCentralDirectory(input.output);
  verifyZipInflation(input.output, inspectZipCentralDirectory(input.output));
  await extractDocx(input.output);
  const original = input.sourceZip ?? await JSZip.loadAsync(input.sourceBytes);
  const result = await JSZip.loadAsync(input.output, { checkCRC32: true });
  const allowed = new Set(derivedModifiedParts(original, input.receipt.plan));
  for (const name of input.receipt.modifiedParts) {
    assert.ok(allowed.has(name), `unplanned_modified_part ${name}`);
  }
  for (const name of Object.keys(original.files)) {
    assert.ok(result.files[name], `missing original entry ${name}`);
    if (!original.files[name].dir && !allowed.has(name)) {
      assert.deepEqual(await result.file(name)!.async("nodebuffer"), await original.file(name)!.async("nodebuffer"), `changed original entry ${name}`);
    }
  }
  for (const name of Object.keys(result.files)) {
    assert.ok(original.files[name] || allowed.has(name) || result.files[name].dir, "unexpected_package_entry");
    if (/\.xml$|\.rels$/.test(name)) {
      const xml = await result.file(name)!.async("string");
      assert.equal(XMLValidator.validate(xml), true, "invalid_xml");
      assert.equal(/<!DOCTYPE|<!ENTITY/i.test(xml), false, "unsafe_xml");
    }
  }
}
