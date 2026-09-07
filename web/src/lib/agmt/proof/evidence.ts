/**
 * Exact evidence replay and absence-scope receipts (PWC-07).
 *
 * Published candidates must reconstruct source text at the claimed span.
 * Absence claims require a complete inventory of scopes that could contain
 * the target. Mapping corruption fails the run; missing scope is abstention.
 * This module does not use the legacy substring/fallback hit validator.
 */
import {
  EXCLUSION_POLICY_VERSION,
  FindingV2Schema,
  INDEX_VERSION_V2,
  PROJECTION_VERSION_V2,
  SpanV2Schema,
  type FindingV2,
  type ProofFinding,
  type ScopeEvidenceV2,
  type SourceSpan,
  type SpanV2,
} from "./contracts.ts";
import {
  graphemeBoundary,
  nodeAt,
  sourceSpan,
  validateSourceSpan,
  xmlTag,
  xmlChildren,
  type ProofSource,
  type SourceParagraph,
} from "../source-map.ts";
import type { PackageCapabilityReceipt } from "../package-capabilities.ts";
import { PROJECTION_VERSION, type StoryProjection } from "../projection.ts";

export const EVIDENCE_VALIDATOR_VERSION = "proof-evidence-v1";

export type EvidenceFailureCode =
  | "mapping_corruption"
  | "invalid_evidence"
  | "incomplete_scope"
  | "exporter_capability";

export class EvidenceError extends Error {
  readonly code: EvidenceFailureCode;
  readonly abstention: boolean;

  constructor(code: EvidenceFailureCode, message: string) {
    super(message);
    this.name = "EvidenceError";
    this.code = code;
    this.abstention = code === "incomplete_scope";
  }
}

export type EvidenceContext = {
  sourceSha256: string;
  source: ProofSource;
  receipt: PackageCapabilityReceipt;
  stories: readonly StoryProjection[];
};

const IMPORTED_REASONS = new Set([
  "external_template",
  "active_content",
  "unsupported_external_content",
  "custom_xml",
  "embedded_object",
]);

function fail(code: EvidenceFailureCode, message: string): never {
  throw new EvidenceError(code, message);
}

function textValue(node: ReturnType<typeof nodeAt>): string {
  return xmlChildren(node).map((child) => typeof child["#text"] === "string" ? child["#text"] : "").join("");
}

function replayNodeText(source: ProofSource, span: SourceSpan | SpanV2): string {
  return span.nodeSegments.map((segment) => {
    const node = nodeAt(source.tree, segment.nodePath);
    const tag = xmlTag(node);
    const value = tag === "w:t" ? textValue(node) : tag === "w:tab" ? "\t" : ["w:br", "w:cr"].includes(tag) ? "\n" : null;
    if (value === null) fail("mapping_corruption", "projection_tree_desync");
    return value.slice(segment.start, segment.end);
  }).join("");
}

function paragraphStoryId(paragraph: SourceParagraph): string {
  return paragraph.storyId || "body:main";
}

export function locateParagraph(ctx: EvidenceContext, span: Pick<SpanV2, "storyId" | "partUri" | "paragraphPath">): SourceParagraph | undefined {
  if (span.storyId === "body:main") {
    return ctx.source.paragraphs.find((paragraph) =>
      paragraph.partUri === span.partUri &&
      JSON.stringify(paragraph.paragraphPath) === JSON.stringify(span.paragraphPath)
    );
  }
  const story = ctx.stories.find((candidate) => candidate.storyId === span.storyId && candidate.partUri === span.partUri);
  return story?.paragraphs.find((paragraph) => JSON.stringify(paragraph.paragraphPath) === JSON.stringify(span.paragraphPath));
}

export function absenceBlockingReasons(receipt: PackageCapabilityReceipt): string[] {
  const reasons = new Set<string>();
  for (const part of receipt.parts) {
    if (part.disposition === "unknown") reasons.add("unknown_part");
    if (part.unsupportedReason && IMPORTED_REASONS.has(part.unsupportedReason)) reasons.add(part.unsupportedReason);
  }
  for (const relationship of receipt.relationships) {
    if (relationship.unsupportedReason && IMPORTED_REASONS.has(relationship.unsupportedReason)) {
      reasons.add(relationship.unsupportedReason);
    }
  }
  return [...reasons].sort();
}

export function excludedAbsenceRegions(receipt: PackageCapabilityReceipt): string[] {
  const regions = new Set<string>();
  for (const reason of receipt.coverageReasons) {
    if (
      reason === "headers_footers_not_checked" ||
      reason === "notes_not_checked" ||
      reason === "media_not_checked" ||
      reason === "existing_comments_preserved" ||
      reason === "passive_hyperlink"
    ) {
      regions.add(reason);
    }
  }
  return [...regions].sort();
}

/** Absence is publishable only when unknown/imported scopes cannot hide the target. */
export function assertAbsenceComplete(ctx: EvidenceContext, scopeIds: string[]): void {
  if (!ctx.source.complete) fail("incomplete_scope", "incomplete_projection");
  if (ctx.source.projectionVersion !== PROJECTION_VERSION) fail("mapping_corruption", "projection_version_mismatch");
  for (const scopeId of scopeIds) {
    if (!ctx.source.paragraphs.some((paragraph) => paragraph.scope === scopeId)) {
      fail("incomplete_scope", "missing_evaluated_scope");
    }
  }
  const blocking = absenceBlockingReasons(ctx.receipt);
  if (blocking.length) fail("incomplete_scope", blocking[0] ?? "incomplete_inventory");
}

export function numberingLabelAnchor(paragraph: SourceParagraph): { start: number; end: number } | null {
  const match = paragraph.text.match(/\S/);
  const start = match?.index;
  if (start == null || !graphemeBoundary(paragraph.text, start) || start >= paragraph.text.length) return null;
  return { start, end: paragraph.text.length };
}

function evidenceTier(ruleId: string): FindingV2["evidenceTier"] {
  if (ruleId.startsWith("language.") || ruleId === "completion.placeholder") return "exact-mechanical";
  return "exact-structural";
}

function toSpanV2(ctx: EvidenceContext, paragraph: SourceParagraph, span: SourceSpan, quote: string): SpanV2 {
  return SpanV2Schema.parse({
    sourceSha256: ctx.sourceSha256,
    partUri: span.partUri,
    storyId: paragraphStoryId(paragraph),
    paragraphPath: [...span.paragraphPath],
    textStart: span.textStart,
    textEnd: span.textEnd,
    projectionVersion: PROJECTION_VERSION_V2,
    view: "final",
    exactQuote: quote,
    nodeSegments: span.nodeSegments.map((segment) => ({
      nodePath: [...segment.nodePath],
      start: segment.start,
      end: segment.end,
    })),
  });
}

export function toFindingV2(ctx: EvidenceContext, finding: ProofFinding): FindingV2 {
  const primaryParagraph = locateParagraph(ctx, {
    storyId: "body:main",
    partUri: finding.primarySpan.partUri,
    paragraphPath: finding.primarySpan.paragraphPath,
  });
  if (!primaryParagraph) fail("invalid_evidence", "primary_paragraph_missing");
  const related = finding.relatedSpans.map((span) => {
    const paragraph = locateParagraph(ctx, {
      storyId: "body:main",
      partUri: span.partUri,
      paragraphPath: span.paragraphPath,
    });
    if (!paragraph) fail("invalid_evidence", "related_paragraph_missing");
    return toSpanV2(ctx, paragraph, span, paragraph.text.slice(span.textStart, span.textEnd));
  });
  let scopeEvidence: ScopeEvidenceV2 | null = null;
  if (finding.scopeEvidence) {
    assertAbsenceComplete(ctx, finding.scopeEvidence.evaluatedScopes);
    scopeEvidence = {
      scopeIds: [...finding.scopeEvidence.evaluatedScopes],
      inventoryDigest: ctx.receipt.receiptHash,
      indexVersion: INDEX_VERSION_V2,
      evaluatedParts: ctx.receipt.parts.filter((part) => part.read !== "none").map((part) => part.partUri),
      excludedRegions: excludedAbsenceRegions(ctx.receipt),
      completeness: "complete",
      query: finding.exactQuote,
      matchCount: finding.scopeEvidence.matchCount,
    };
  }
  return FindingV2Schema.parse({
    id: finding.id,
    ruleId: finding.ruleId,
    ruleVersion: finding.ruleVersion,
    evidenceTier: evidenceTier(finding.ruleId),
    action: finding.kind,
    primary: toSpanV2(ctx, primaryParagraph, finding.primarySpan, finding.exactQuote),
    related,
    replacement: finding.replacement,
    messageCode: finding.ruleId,
    messageArgs: [finding.comment],
    capabilityReceipt: ctx.receipt.receiptHash,
    exclusionPolicyVersion: EXCLUSION_POLICY_VERSION,
    scopeEvidence,
  });
}

function assertExporterCapability(ctx: EvidenceContext, finding: FindingV2): void {
  const part = ctx.receipt.parts.find((candidate) => candidate.partUri === finding.primary.partUri);
  if (!part) fail("mapping_corruption", "unregistered_part");
  if (finding.action === "correction" && part.edit !== "surgical") fail("exporter_capability", "correction_not_editable");
  if (finding.action === "comment" && part.edit !== "surgical" && part.edit !== "comment") {
    fail("exporter_capability", "comment_not_editable");
  }
}

export function validateSpanV2(ctx: EvidenceContext, span: SpanV2): SourceParagraph {
  const parsed = SpanV2Schema.parse(span);
  if (parsed.sourceSha256 !== ctx.sourceSha256) fail("mapping_corruption", "source_hash_mismatch");
  if (parsed.projectionVersion !== (ctx.source.projectionVersion ?? PROJECTION_VERSION)) {
    fail("mapping_corruption", "projection_version_mismatch");
  }
  if (!ctx.receipt.parts.some((part) => part.partUri === parsed.partUri)) fail("mapping_corruption", "unregistered_part");
  if (!graphemeBoundary(parsed.exactQuote, 0) || !graphemeBoundary(parsed.exactQuote, parsed.exactQuote.length)) {
    fail("invalid_evidence", "grapheme_split");
  }
  const paragraph = locateParagraph(ctx, parsed);
  if (!paragraph) fail("invalid_evidence", "paragraph_missing");
  if (paragraphStoryId(paragraph) !== parsed.storyId) fail("invalid_evidence", "story_mismatch");
  if (!graphemeBoundary(paragraph.text, parsed.textStart) || !graphemeBoundary(paragraph.text, parsed.textEnd)) {
    fail("invalid_evidence", "grapheme_split");
  }
  const expected = sourceSpan(paragraph, parsed.textStart, parsed.textEnd);
  if (
    expected.partUri !== parsed.partUri ||
    JSON.stringify(expected.paragraphPath) !== JSON.stringify(parsed.paragraphPath) ||
    expected.textStart !== parsed.textStart ||
    expected.textEnd !== parsed.textEnd ||
    JSON.stringify(expected.nodeSegments) !== JSON.stringify(parsed.nodeSegments)
  ) {
    fail("invalid_evidence", "source_node_mismatch");
  }
  const projectedQuote = paragraph.text.slice(parsed.textStart, parsed.textEnd);
  if (projectedQuote !== parsed.exactQuote) fail("invalid_evidence", "source_quote_mismatch");
  if (parsed.storyId === "body:main") {
    const launchSpan: SourceSpan = {
      partUri: parsed.partUri,
      paragraphPath: parsed.paragraphPath,
      textStart: parsed.textStart,
      textEnd: parsed.textEnd,
      projection: "final",
      nodeSegments: parsed.nodeSegments,
    };
    validateSourceSpan(ctx.source, launchSpan, parsed.exactQuote);
    const treeQuote = replayNodeText(ctx.source, launchSpan);
    if (treeQuote !== projectedQuote) fail("mapping_corruption", "projection_tree_desync");
  }
  return paragraph;
}

export function validateFindingV2(ctx: EvidenceContext, finding: FindingV2): FindingV2 {
  const parsed = FindingV2Schema.parse(finding);
  if (parsed.capabilityReceipt !== ctx.receipt.receiptHash) fail("mapping_corruption", "capability_receipt_mismatch");
  if (parsed.primary.sourceSha256 !== ctx.sourceSha256) fail("mapping_corruption", "source_hash_mismatch");
  validateSpanV2(ctx, parsed.primary);
  for (const related of parsed.related) {
    if (related.sourceSha256 !== ctx.sourceSha256) fail("mapping_corruption", "source_hash_mismatch");
    validateSpanV2(ctx, related);
  }
  if (parsed.scopeEvidence) {
    assertAbsenceComplete(ctx, parsed.scopeEvidence.scopeIds);
    if (parsed.scopeEvidence.inventoryDigest !== ctx.receipt.receiptHash) {
      fail("mapping_corruption", "inventory_digest_mismatch");
    }
    if (parsed.scopeEvidence.matchCount !== 0 && parsed.ruleId === "references.missing_target") {
      fail("invalid_evidence", "absence_match_count");
    }
  } else if (parsed.ruleId === "references.missing_target") {
    fail("invalid_evidence", "missing_absence_evidence");
  }
  assertExporterCapability(ctx, parsed);
  return parsed;
}
