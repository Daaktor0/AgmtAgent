import { z } from "zod";

const offset = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const path = z.array(offset).min(1).max(128);
const segment = z.strictObject({ nodePath: path, start: offset, end: offset })
  .refine((s) => s.end > s.start, "empty_node_segment");
export const SourceSpanSchema = z.strictObject({
  partUri: z.string().regex(/^\/word\/[a-zA-Z0-9_-]+\.xml$/),
  paragraphPath: path,
  textStart: offset,
  textEnd: offset,
  projection: z.literal("final"),
  nodeSegments: z.array(segment).min(1),
}).refine((s) => s.textEnd > s.textStart && s.nodeSegments.reduce((n, x) => n + x.end - x.start, 0) === s.textEnd - s.textStart, "invalid_span_length");
export type SourceSpan = z.infer<typeof SourceSpanSchema>;

export const LaunchRuleIdSchema = z.enum([
  "language.typo_allowlist", "language.duplicate_word", "completion.placeholder",
  "references.missing_target", "references.duplicate_number", "references.scope_confusion", "references.ambiguous_target",
  "definitions.duplicate", "definitions.scope_redefinition", "definitions.case_variant", "definitions.unused", "definitions.undefined_use",
]);
export type LaunchRuleId = z.infer<typeof LaunchRuleIdSchema>;
export const ProofFindingSchema = z.strictObject({
  id: z.string().min(1),
  ruleId: LaunchRuleIdSchema,
  ruleVersion: z.literal(1),
  kind: z.enum(["correction", "comment"]),
  category: z.enum(["language", "definitions", "references", "completion"]),
  severity: z.enum(["attention", "suggestion"]),
  primarySpan: SourceSpanSchema,
  relatedSpans: z.array(SourceSpanSchema),
  exactQuote: z.string().min(1),
  replacement: z.string().nullable(),
  comment: z.string().min(1),
  scopeEvidence: z.strictObject({
    evaluatedScopes: z.array(z.string().min(1)).min(1),
    inventoryDigest: z.string().regex(/^[a-f0-9]{64}$/),
    matchCount: offset,
  }).nullable(),
}).refine((f) => f.exactQuote.length === f.primarySpan.textEnd - f.primarySpan.textStart, "quote_length")
  .refine((f) => f.kind === "correction" ? f.replacement !== null && f.category === "language" : f.replacement === null, "invalid_markup_action")
  .refine((f) => f.ruleId !== "references.missing_target" || f.scopeEvidence?.matchCount === 0, "missing_absence_evidence")
  .refine((f) => f.ruleId !== "references.scope_confusion" || f.scopeEvidence?.matchCount === 0, "scope_confusion_absence_evidence")
  .refine((f) => f.ruleId !== "references.ambiguous_target" || (f.scopeEvidence != null && f.scopeEvidence.matchCount >= 2), "ambiguous_evidence")
  .refine((f) => f.ruleId !== "definitions.unused" || f.scopeEvidence?.matchCount === 0, "unused_absence_evidence");
export type ProofFinding = z.infer<typeof ProofFindingSchema>;

/** Content contract only; schema validation is followed by immutable-package evidence validation. */
export const ExportPlanSchema = z.strictObject({
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  ruleSetVersion: z.literal("proof-launch-v1"),
  exporterVersion: z.literal("proof-ooxml-v1"),
  author: z.literal("Agmt Proof"),
  initials: z.literal("AP"),
  findings: z.array(ProofFindingSchema).max(500),
  notices: z.array(z.strictObject({
    anchorMode: z.literal("document_notice"),
    presentationSpan: SourceSpanSchema,
    comment: z.string().min(1),
  })),
});
export type ExportPlan = z.infer<typeof ExportPlanSchema>;

export const EXPORT_INVARIANTS = Object.freeze({
  untouchedEntries: "identical_uncompressed_bytes",
  existingRevisions: "preserve_without_accept_reject_or_nesting",
  rejectingAgmt: "restore_source_semantics",
  acceptingAgmt: "exact_planned_text_only",
  sourcePackage: "immutable",
  offsets: "half_open_utf16_no_surrogate_splits",
} as const);

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);
const evidenceQuote = z.string().min(1).max(1_000);
const messageArg = z.string().min(1).max(600);

/** Section 14 content evidence. Memory/temporary R2 only; never a public DTO field. */
export const PROJECTION_VERSION_V2 = "proof-projection-v1" as const;
export const EXCLUSION_POLICY_VERSION = "proof-exclusion-v1" as const;
export const INDEX_VERSION_V2 = "proof-index-v1" as const;

export const SpanV2Schema = z.strictObject({
  sourceSha256: sha256Hex,
  partUri: z.string().regex(/^\/word\/[a-zA-Z0-9_-]+\.xml$/),
  storyId: z.string().min(1).max(128),
  paragraphPath: path,
  textStart: offset,
  textEnd: offset,
  projectionVersion: z.literal(PROJECTION_VERSION_V2),
  view: z.literal("final"),
  exactQuote: evidenceQuote,
  nodeSegments: z.array(segment).min(1),
}).refine((s) => s.textEnd > s.textStart, "empty_span")
  .refine((s) => s.nodeSegments.reduce((n, x) => n + x.end - x.start, 0) === s.textEnd - s.textStart, "invalid_span_length")
  .refine((s) => s.exactQuote.length === s.textEnd - s.textStart, "quote_length");
export type SpanV2 = z.infer<typeof SpanV2Schema>;

export const ScopeEvidenceV2Schema = z.strictObject({
  scopeIds: z.array(z.string().min(1)).min(1),
  inventoryDigest: sha256Hex,
  indexVersion: z.literal(INDEX_VERSION_V2),
  evaluatedParts: z.array(z.string().min(1)).min(1),
  excludedRegions: z.array(z.string().min(1)),
  completeness: z.literal("complete"),
  query: evidenceQuote,
  matchCount: offset,
});
export type ScopeEvidenceV2 = z.infer<typeof ScopeEvidenceV2Schema>;

export const FindingV2Schema = z.strictObject({
  id: z.string().min(1),
  ruleId: z.string().min(1).max(128),
  ruleVersion: z.number().int().positive().max(1_000),
  evidenceTier: z.enum(["exact-mechanical", "exact-structural", "bounded-heuristic"]),
  action: z.enum(["correction", "comment"]),
  primary: SpanV2Schema,
  related: z.array(SpanV2Schema).max(32),
  replacement: z.string().max(1_000).nullable(),
  messageCode: z.string().min(1).max(128),
  messageArgs: z.array(messageArg).max(8),
  capabilityReceipt: sha256Hex,
  exclusionPolicyVersion: z.literal(EXCLUSION_POLICY_VERSION),
  scopeEvidence: ScopeEvidenceV2Schema.nullable(),
}).refine((f) => f.action === "correction" ? f.replacement !== null : f.replacement === null, "invalid_markup_action")
  .refine((f) => f.ruleId !== "references.missing_target" || f.scopeEvidence?.matchCount === 0, "missing_absence_evidence")
  .refine((f) => f.messageArgs.reduce((n, arg) => n + arg.length, 0) <= 600, "comment_length");
export type FindingV2 = z.infer<typeof FindingV2Schema>;
