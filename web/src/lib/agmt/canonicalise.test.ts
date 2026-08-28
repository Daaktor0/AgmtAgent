import assert from "node:assert/strict";
import test from "node:test";
import { applyDecisions, mapSha, type CanonicalResult } from "./canonicalise.ts";
import type { ProposedEntry, Provision } from "./types.ts";

const sourceValue = "ABCDE1234F";
const replacement = "[PAN_1]";

function provision(text: string): Provision {
  return {
    provisionId: "p1",
    parentProvisionId: null,
    orderIndex: 0,
    nodeType: "clause",
    ownsText: true,
    number: "1",
    heading: null,
    scopeType: "main_body",
    scopeId: "main",
    canonicalText: text,
    canonicalLength: text.length,
    sourceXmlAnchor: { kind: "paragraph", path: "/w:document/w:body/w:p[0]" },
    sourceStart: 0,
    sourceEnd: sourceValue.length + 5,
    structuralPath: [],
    classificationConfidence: 1,
    lineStart: 1,
    lineEnd: 1,
    blockIndex: 0,
  };
}

function entry(): ProposedEntry {
  return {
    entryId: "e1",
    kind: "identifier",
    identifierType: "pan",
    sourceProvisionId: "p1",
    sourceStart: 0,
    sourceEnd: sourceValue.length,
    originalValue: sourceValue,
    replacement,
    definedTermId: null,
    detector: "test",
    confidence: 1,
    userDecision: "accept",
  };
}

function base(): CanonicalResult {
  const tail = " owes";
  return {
    provisions: [provision(`${replacement}${tail}`)],
    entries: [entry()],
    segments: [
      {
        segmentId: "s1",
        provisionId: "p1",
        canonicalStart: 0,
        canonicalEnd: replacement.length,
        sourceStart: 0,
        sourceEnd: sourceValue.length,
        replacementEntryId: "e1",
      },
      {
        segmentId: "s2",
        provisionId: "p1",
        canonicalStart: replacement.length,
        canonicalEnd: replacement.length + tail.length,
        sourceStart: sourceValue.length,
        sourceEnd: sourceValue.length + tail.length,
        replacementEntryId: null,
      },
    ],
    placeholderIndex: { [`pan:${sourceValue}`]: replacement },
  };
}

test("not_identifier rebuilds projection from source rather than stale canonical text", () => {
  const result = applyDecisions(base(), { e1: { decision: "not_identifier" } });
  assert.equal(result.provisions[0]?.canonicalText, `${sourceValue} owes`);
  assert.equal(result.provisions[0]?.canonicalLength, `${sourceValue} owes`.length);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0]?.replacementEntryId, null);
});

test("corrected replacement rebuilds source mapping", () => {
  const result = applyDecisions(base(), {
    e1: { decision: "correct", replacement: "[IDENTIFIER_1]" },
  });
  assert.equal(result.provisions[0]?.canonicalText, "[IDENTIFIER_1] owes");
  assert.equal(result.segments[0]?.sourceEnd, sourceValue.length);
  assert.equal(result.segments[0]?.canonicalEnd, "[IDENTIFIER_1]".length);
});

test("map identity is SHA-256 and changes with a decision", () => {
  const accepted = entry();
  const rejected = { ...accepted, userDecision: "not_identifier" as const, replacement: sourceValue };
  assert.match(mapSha([accepted]), /^[a-f0-9]{64}$/);
  assert.notEqual(mapSha([accepted]), mapSha([rejected]));
});
