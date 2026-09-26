/**
 * Independent package gate (PWC-11). Allowed changed parts are derived from
 * the source package and the edit plan, not from receipt.modifiedParts.
 */
import assert from "node:assert/strict";
import { XMLValidator } from "fast-xml-parser";
import { DocxPackage, isXmlPackagePart, zipPayloadEquals } from "../docx-package.ts";
import { extractDocx } from "../docx-v2.ts";
import { inspectZipCentralDirectory, verifyZipInflation, ZIP_LIMITS } from "../zip-safety.ts";
import { plannedModifiedParts, type ExportReceipt } from "../export/receipt.ts";
import type { ExportPlan } from "../proof/contracts.ts";

export type PackageValidationInput = {
  sourceBytes: Buffer;
  output: Buffer;
  receipt: ExportReceipt;
  sourcePkg?: DocxPackage;
  sourceZip?: DocxPackage;
};

export function derivedModifiedParts(sourcePkg: DocxPackage, plan: ExportPlan): string[] {
  return plannedModifiedParts(sourcePkg.has("word/comments.xml"), plan);
}

export async function validateOutputPackage(input: PackageValidationInput): Promise<void> {
  const limits = input.sourcePkg?.limits ?? input.sourceZip?.limits ?? ZIP_LIMITS;
  // Always re-open from the original bytes. The exporter's session cache must
  // not be the independent validator's source of original XML.
  const sourcePkg = DocxPackage.open(input.sourceBytes, { limits, verify: false });
  if (input.output.length > (sourcePkg.limits.MAX_OUTPUT_BYTES || ZIP_LIMITS.MAX_OUTPUT_BYTES)) throw new Error("output_too_large");
  const outputDirectory = inspectZipCentralDirectory(input.output, sourcePkg.limits);
  verifyZipInflation(input.output, outputDirectory, undefined, sourcePkg.limits);
  const outputPkg = DocxPackage.open(input.output, { limits: sourcePkg.limits, verify: false });
  await extractDocx(input.output, undefined, {
    pkg: outputPkg,
    limits: sourcePkg.limits,
    maxSourceBytes: Math.max(sourcePkg.limits.MAX_OUTPUT_BYTES, input.output.byteLength),
  });
  const allowed = new Set(derivedModifiedParts(sourcePkg, input.receipt.plan));
  for (const name of input.receipt.modifiedParts) {
    assert.ok(allowed.has(name), `unplanned_modified_part ${name}`);
  }
  for (const name of sourcePkg.names()) {
    assert.ok(outputPkg.has(name), `missing original entry ${name}`);
    if (!allowed.has(name)) {
      assert.equal(zipPayloadEquals(sourcePkg, outputPkg, name), true, `changed original entry ${name}`);
    }
  }
  for (const name of outputPkg.names()) {
    assert.ok(sourcePkg.has(name) || allowed.has(name), "unexpected_package_entry");
    if (isXmlPackagePart(name)) {
      const xml = outputPkg.text(name);
      assert.equal(XMLValidator.validate(xml), true, "invalid_xml");
      assert.equal(/<!DOCTYPE|<!ENTITY/i.test(xml), false, "unsafe_xml");
    }
  }
}
