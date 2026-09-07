import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import JSZip from "jszip";
import { extractDocx } from "../docx-v2.ts";
import { buildDocx } from "../docx.ts";
import { launchFixture } from "../corpus/launch-fixtures.ts";
import {
  NS,
  inventoryPackageCapabilities,
} from "../package-capabilities.ts";
import { analyzeProof, evidenceContext, validateLaunchFinding } from "./launch.ts";
import { planProofExport } from "../export/docx.ts";
import {
  EvidenceError,
  absenceBlockingReasons,
  numberingLabelAnchor,
  toFindingV2,
  validateFindingV2,
  validateSpanV2,
  type EvidenceContext,
} from "./evidence.ts";
import { FindingV2Schema, SpanV2Schema, type FindingV2, type ProofFinding } from "./contracts.ts";
import { sourceSpan, type ProofSource } from "../source-map.ts";
import { parseRunSummaryV2, ProofContractError } from "../../products/api-contracts.ts";
import { proofDeadlines } from "../../server/retention.ts";

const WML = NS.WML;
const RELS = NS.PKG_RELS;
const TYPES = NS.PKG_TYPES;
const OFFICE_RELS = NS.OFFICE_RELS;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function packageOf(parts: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(parts)) {
    zip.file(name, data, { date: new Date(0), createFolders: false });
  }
  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "STORE" }));
}

function typesXml(overrides: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${TYPES}">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${overrides}
</Types>`;
}

async function capture(bytes: Buffer): Promise<{ source: ProofSource; ctx: EvidenceContext; extracted: Awaited<ReturnType<typeof extractDocx>> }> {
  let source: ProofSource | undefined;
  const extracted = await extractDocx(bytes, (captured) => {
    source = captured;
  });
  assert.ok(source);
  assert.ok(extracted.packageCapabilityReceipt);
  const ctx: EvidenceContext = {
    sourceSha256: sha256(bytes),
    source,
    receipt: extracted.packageCapabilityReceipt,
    stories: extracted.storyProjections ?? [],
  };
  return { source, ctx, extracted };
}

test("PWC-07 launch candidates reconstruct exact source and reject tampered hash/part/quote/version", async () => {
  const bytes = await launchFixture("body");
  const analysis = await analyzeProof(bytes);
  const ctx = evidenceContext(analysis);
  assert.equal(analysis.plan.findings.length, 4);
  for (const finding of analysis.plan.findings) {
    const v2 = toFindingV2(ctx, finding);
    assert.equal(validateFindingV2(ctx, v2).primary.exactQuote, finding.exactQuote);
    validateLaunchFinding(analysis, finding);
  }

  const primary = toFindingV2(ctx, analysis.plan.findings[0]!);
  assert.throws(
    () => validateFindingV2(ctx, { ...primary, primary: { ...primary.primary, sourceSha256: "a".repeat(64) } }),
    (error: unknown) => error instanceof EvidenceError && error.code === "mapping_corruption",
  );
  assert.throws(
    () => validateSpanV2(ctx, { ...primary.primary, partUri: "/word/missing.xml" }),
    (error: unknown) => error instanceof EvidenceError && error.code === "mapping_corruption",
  );
  assert.throws(
    () => validateFindingV2(ctx, { ...primary, primary: { ...primary.primary, exactQuote: "receive" } }),
    (error: unknown) => error instanceof EvidenceError && (error.code === "invalid_evidence" || error.code === "mapping_corruption"),
  );
  assert.equal(SpanV2Schema.safeParse({ ...primary.primary, projectionVersion: "proof-projection-v0" }).success, false);
});

test("PWC-07 same text elsewhere and grapheme splits cannot publish", async () => {
  const bytes = await buildDocx(["The Company shall recieve notice.", "The Company shall recieve notice."]);
  const { source, ctx } = await capture(bytes);
  const first = source.paragraphs[0]!;
  const second = source.paragraphs[1]!;
  assert.equal(first.text, second.text);
  const honest = sourceSpan(second, 18, 25);
  const stolen: FindingV2["primary"] = SpanV2Schema.parse({
    sourceSha256: ctx.sourceSha256,
    partUri: honest.partUri,
    storyId: second.storyId,
    paragraphPath: honest.paragraphPath,
    textStart: honest.textStart,
    textEnd: honest.textEnd,
    projectionVersion: "proof-projection-v1",
    view: "final",
    exactQuote: "recieve",
    nodeSegments: sourceSpan(first, 18, 25).nodeSegments,
  });
  assert.throws(
    () => validateSpanV2(ctx, stolen),
    (error: unknown) => error instanceof EvidenceError && error.code === "invalid_evidence",
  );

  const combining = await capture(await buildDocx(["The Company shall recieve\u0301 notice."]));
  const paragraph = combining.source.paragraphs[0]!;
  const cluster = paragraph.text.indexOf("e\u0301");
  assert.ok(cluster >= 0);
  assert.throws(() => sourceSpan(paragraph, cluster + 1, cluster + 2), /invalid_source_span/);
});

test("PWC-07 unknown parts block absence; empty numbering labels are not fabricated", async () => {
  const mystery = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    ),
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELS}">
  <Relationship Id="rId1" Type="${OFFICE_RELS}/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${WML}"><w:body><w:p><w:r><w:t xml:space="preserve">The Company shall recieve the notice under Clause 99.2 by [●].</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
    "word/mystery.xml": `<?xml version="1.0" encoding="UTF-8"?><unknown xmlns="http://example.test/mystery"><x>Clause 99.2</x></unknown>`,
  });
  const receipt = await inventoryPackageCapabilities(mystery);
  assert.ok(absenceBlockingReasons(receipt).includes("unknown_part"));
  const result = await analyzeProof(mystery);
  assert.equal(result.plan.findings.some((finding) => finding.ruleId === "references.missing_target"), false);
  const missing = result.executions.find((execution) => execution.ruleId === "references.missing_target");
  assert.equal(missing?.outcome, "suppressed");
  assert.ok(result.plan.findings.some((finding) => finding.ruleId === "language.typo_allowlist"));

  const empty = {
    partUri: "/word/document.xml",
    paragraphPath: [0],
    text: "   ",
    nodes: [],
    isTable: false,
    scope: "main_body",
    style: null,
    safe: true,
    storyId: "body:main",
  };
  assert.equal(numberingLabelAnchor(empty), null);
});

test("PWC-07 repeated text in a different story cannot satisfy a body anchor, and wrong anchors never reach export", async () => {
  const bytes = await buildDocx(["The Company shall recieve the the notice under Clause 99.2 by [●]."], {
    header: "The Company shall recieve the the notice under Clause 99.2 by [●].",
  });
  const analysis = await analyzeProof(bytes);
  const ctx = evidenceContext(analysis);
  const header = ctx.stories.find((story) => story.storyKind === "header");
  assert.ok(header);
  const bodyFinding = analysis.plan.findings.find((finding) => finding.ruleId === "language.typo_allowlist");
  assert.ok(bodyFinding);
  const v2 = toFindingV2(ctx, bodyFinding);
  assert.equal(v2.primary.storyId, "body:main");
  assert.throws(
    () => validateSpanV2(ctx, { ...v2.primary, storyId: header.storyId, partUri: header.partUri, paragraphPath: header.paragraphs[0]!.paragraphPath }),
    (error: unknown) => error instanceof EvidenceError && error.code === "invalid_evidence",
  );

  const forged: ProofFinding = { ...bodyFinding, exactQuote: "receive", primarySpan: { ...bodyFinding.primarySpan, textEnd: bodyFinding.primarySpan.textStart + 7 } };
  assert.throws(() => validateLaunchFinding(analysis, forged), /invalid_rule_evidence|invalid_evidence|quote_length|source_quote_mismatch/);
  assert.throws(() => {
    const clone = structuredClone(analysis);
    clone.plan.findings = [forged];
    planProofExport(clone);
  });
});

test("PWC-07 metadata DTOs reject in-memory evidence and unknown FindingV2 fields", () => {
  const started = 1_800_000_000_000;
  assert.throws(() => parseRunSummaryV2({
    apiVersion: 2,
    runId: "run_2f8c1a9b0d4e6f70",
    status: "ready",
    stage: "ready",
    serverNow: started + 60_000,
    deadlines: proofDeadlines(started),
    correctionCount: 1,
    commentCount: 0,
    noticeCount: 0,
    coverage: { status: "complete", checked: [], skipped: [], notApplicable: [] },
    retry: { allowed: false, code: null },
    download: { available: true },
    deletion: { requestedAt: null, verifiedAt: null, reason: null },
    error: null,
    exactQuote: "recieve",
  }), ProofContractError);
  assert.equal(FindingV2Schema.safeParse({
    id: "x",
    ruleId: "language.typo_allowlist",
    ruleVersion: 1,
    evidenceTier: "exact-mechanical",
    action: "correction",
    primary: {},
    related: [],
    replacement: "receive",
    messageCode: "language.typo_allowlist",
    messageArgs: ["typo"],
    capabilityReceipt: "a".repeat(64),
    exclusionPolicyVersion: "proof-exclusion-v1",
    scopeEvidence: null,
    tenantId: "no",
  }).success, false);
});
