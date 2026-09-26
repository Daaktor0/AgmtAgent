import assert from "node:assert/strict";
import { test } from "node:test";
import { localProofError } from "./errors.ts";

test("file-size refusals are distinct from XML or extracted-text complexity", () => {
  const size = localProofError(new Error("source_too_large"));
  assert.match(size.heading, /size limit/);
  assert.match(size.main, /Word XML or extracted text/);
  assert.doesNotMatch(size.main, /split(?:ting)? (?:the )?(?:file|agreement) into clauses/i);

  const xml = localProofError(new Error("package_too_complex"));
  assert.match(xml.heading, /text or Word XML is too complex/);
  assert.match(xml.main, /does not recommend splitting/);
  assert.doesNotMatch(xml.heading, /size limit/);

  const text = localProofError(new Error("extracted_text_limit"));
  assert.equal(text.heading, xml.heading);

  const zip = localProofError(new Error("suspicious_compression_ratio"));
  assert.match(zip.heading, /safety limits/);
  assert.notEqual(zip.heading, size.heading);
  assert.notEqual(zip.heading, xml.heading);
});
