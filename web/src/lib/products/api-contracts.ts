import { z } from "zod";
import {
  PROOF_CAPABILITIES_API_VERSION,
  PROOF_LANGUAGES,
  PROOF_MAX_SOURCE_BYTES,
  PROOF_PROFILES,
  PROOF_RULE_SET_VERSION,
  PROOF_SUPPORT_MATRIX_VERSION,
  PROOF_UPLOADS_PAUSED_DETAIL,
  PROOF_UPLOADS_PAUSED_HEADING,
} from "./capabilities.ts";
import { proofDeadlines } from "../server/retention.ts";
import type { ProofStage, RunDeadlines, RunStatus } from "./contracts.ts";

export const PROOF_API_VERSION = 2 as const;
export const PROOF_ERROR_SCHEMA_VERSION = 2 as const;

const runId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
const millis = z.number().int().nonnegative().max(8_640_000_000_000_000);
const supportId = z.string().regex(/^[a-z0-9]{16,32}$/);
const boundedCode = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/);

export const ProofRunStatusSchema = z.enum([
  "uploading", "scanning", "queued", "processing", "exporting",
  "ready", "rejected", "failed", "deleting", "deleted",
]);
export const ProofStageSchema = z.enum([
  "uploading", "scanning", "queued", "processing", "exporting", "validating",
  "ready", "rejected", "failed", "deleting", "deleted",
]);

export const CoverageReasonCodeSchema = z.enum([
  "headers_footers_not_checked",
  "notes_not_checked",
  "existing_revisions_not_edited",
  "existing_comments_preserved",
  "definition_scope_unclear",
  "numbering_scope_unclear",
  "non_english_skipped",
  "fields_not_checked",
  "unsupported_story",
  "rule_budget",
  "finding_cap",
  "complex_revision",
  "protected_range",
]);
export type CoverageReasonCode = z.infer<typeof CoverageReasonCodeSchema>;

export const CoverageItemSchema = z.strictObject({
  code: boundedCode,
  count: z.number().int().nonnegative().max(10_000),
});
export const CoverageSkippedItemSchema = z.strictObject({
  code: CoverageReasonCodeSchema,
  count: z.number().int().nonnegative().max(10_000),
  reason: CoverageReasonCodeSchema,
});

export const CoverageManifestSchema = z.strictObject({
  status: z.enum(["complete", "limited", "not_applicable"]),
  checked: z.array(CoverageItemSchema).max(64),
  skipped: z.array(CoverageSkippedItemSchema).max(64),
  notApplicable: z.array(CoverageReasonCodeSchema).max(64),
});

export const RunDeadlinesV2Schema = z.strictObject({
  uploadStartedAt: millis,
  retentionDeadline: millis,
  accessDeadline: millis,
  processingDeadline: millis,
  uploadGrantDeadline: millis,
}).superRefine((deadlines, ctx) => {
  try {
    const expected = proofDeadlines(deadlines.uploadStartedAt);
    (Object.keys(expected) as (keyof RunDeadlines)[]).forEach((key) => {
      if (deadlines[key] !== expected[key]) {
        ctx.addIssue({ code: "custom", message: "invalid_run_deadlines", path: [key] });
      }
    });
  } catch {
    ctx.addIssue({ code: "custom", message: "invalid_run_deadlines", path: ["uploadStartedAt"] });
  }
});

export const ProofErrorBodySchema = z.strictObject({
  code: boundedCode,
  messageKey: boundedCode,
  retryable: z.boolean(),
  supportId,
});

export const ProofErrorResponseSchema = z.strictObject({
  error: ProofErrorBodySchema,
  serverNow: millis,
});

const nullableCount = z.number().int().nonnegative().max(500).nullable();

export const RunSummaryV2Schema = z.strictObject({
  apiVersion: z.literal(PROOF_API_VERSION),
  runId,
  status: ProofRunStatusSchema,
  stage: ProofStageSchema,
  serverNow: millis,
  deadlines: RunDeadlinesV2Schema,
  correctionCount: nullableCount,
  commentCount: nullableCount,
  noticeCount: nullableCount,
  coverage: CoverageManifestSchema.nullable(),
  retry: z.strictObject({
    allowed: z.boolean(),
    code: boundedCode.nullable(),
  }),
  download: z.strictObject({ available: z.boolean() }),
  deletion: z.strictObject({
    requestedAt: millis.nullable(),
    verifiedAt: millis.nullable(),
    reason: z.enum(["manual", "expiry", "rejection"]).nullable(),
  }),
  error: ProofErrorBodySchema.nullable(),
}).superRefine((summary, ctx) => {
  if (summary.stage === "validating" && summary.status !== "exporting") {
    ctx.addIssue({ code: "custom", message: "validating_requires_exporting", path: ["stage"] });
  }
  const pending = !["ready", "rejected", "failed", "deleting", "deleted"].includes(summary.status);
  if (pending) {
    if (summary.correctionCount !== null || summary.commentCount !== null || summary.noticeCount !== null) {
      ctx.addIssue({ code: "custom", message: "premature_counts", path: ["correctionCount"] });
    }
    if (summary.coverage !== null) {
      ctx.addIssue({ code: "custom", message: "premature_coverage", path: ["coverage"] });
    }
    if (summary.download.available) {
      ctx.addIssue({ code: "custom", message: "premature_download", path: ["download"] });
    }
  }
  if (summary.status === "ready" && (summary.correctionCount === null || summary.commentCount === null || summary.noticeCount === null || summary.coverage === null)) {
    ctx.addIssue({ code: "custom", message: "ready_requires_counts", path: ["correctionCount"] });
  }
  if (summary.download.available && (summary.status !== "ready" || summary.serverNow >= summary.deadlines.accessDeadline)) {
    ctx.addIssue({ code: "custom", message: "download_not_available", path: ["download"] });
  }
});

export type RunSummaryV2 = z.infer<typeof RunSummaryV2Schema>;
export type ProofErrorResponse = z.infer<typeof ProofErrorResponseSchema>;

export const ProofCapabilitiesV2Schema = z.strictObject({
  apiVersion: z.literal(PROOF_CAPABILITIES_API_VERSION),
  acceptingUploads: z.boolean(),
  maxSourceBytes: z.literal(PROOF_MAX_SOURCE_BYTES),
  profiles: z.tuple([z.literal(PROOF_PROFILES[0]), z.literal(PROOF_PROFILES[1])]),
  languages: z.tuple([z.literal(PROOF_LANGUAGES[0]), z.literal(PROOF_LANGUAGES[1])]),
  ruleSetVersion: z.literal(PROOF_RULE_SET_VERSION),
  supportMatrixVersion: z.literal(PROOF_SUPPORT_MATRIX_VERSION),
});

export const CONTENT_CANARY_FIELDS = Object.freeze([
  "filename", "fileName", "bytes", "snippet", "quote", "exactQuote", "findings",
  "replacement", "sourceUrl", "presignedUrl", "objectUrl", "tenantId", "ownerUserId",
]);

export class ProofContractError extends Error {
  readonly code = "invalid_proof_contract";
  constructor(message: string) {
    super(message);
    this.name = "ProofContractError";
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ProofContractError(label);
  return result.data;
}

export function parseRunSummaryV2(value: unknown): RunSummaryV2 {
  return parse(RunSummaryV2Schema, value, "invalid_run_summary");
}

export function parseProofErrorResponse(value: unknown): ProofErrorResponse {
  return parse(ProofErrorResponseSchema, value, "invalid_proof_error");
}

export function parseProofCapabilitiesV2(value: unknown) {
  return parse(ProofCapabilitiesV2Schema, value, "invalid_capabilities");
}

export const PROOF_UI_STATE_IDS = [
  "first_visit", "privacy_before_upload", "auth_loading", "signed_out", "unverified",
  "verification_sent", "auth_unavailable", "selected", "wrong_extension", "too_large",
  "multiple_files", "uploading", "scanning", "queued", "processing", "exporting",
  "validating", "slow", "ready_findings", "ready_zero", "limited", "coverage_details",
  "unsupported", "security_rejection", "temporary_failure", "retry_ineligible",
  "connection_lost", "download_started", "delete_confirmation", "deleting",
  "delete_delayed", "deleted", "expired_not_verified", "unknown_run", "quota",
  "uploads_paused",
] as const;
export type ProofUiStateId = (typeof PROOF_UI_STATE_IDS)[number];

export const PROOF_UI_COPY: Readonly<Record<ProofUiStateId, { heading: string; main: string }>> = Object.freeze({
  first_visit: { heading: "Proofread your Word document.", main: "Get safe corrections as tracked changes and points to check as Word comments." },
  privacy_before_upload: { heading: "Your document is processed on this device. Agmt’s servers do not receive the file. Agmt does not virus-scan the file. Refreshing or closing this page loses the current run; choose the file again to restart. Proof does not promise secure erasure from browser memory, and a copy you download stays on your device.", main: "Processing happens on this device." },
  auth_loading: { heading: "Checking your sign-in…", main: "" },
  signed_out: { heading: "Sign in to use Proof.", main: "" },
  unverified: { heading: "Verify your email to use Proof.", main: "" },
  verification_sent: { heading: "Check your inbox for Agmt’s verification email.", main: "You may need to select your file again when you return." },
  auth_unavailable: { heading: "We couldn’t complete sign-in. Please try again shortly.", main: "" },
  selected: { heading: "Ready to proofread", main: "" },
  wrong_extension: { heading: "Choose a Word (.docx) file containing document text.", main: "" },
  too_large: { heading: "This file exceeds the 100 MiB size limit.", main: "" },
  multiple_files: { heading: "Choose one document at a time.", main: "" },
  uploading: { heading: "Uploading your document…", main: "" },
  scanning: { heading: "Checking the file before proofreading…", main: "" },
  queued: { heading: "Your document is waiting to be checked.", main: "" },
  processing: { heading: "Checking your document…", main: "" },
  exporting: { heading: "Preparing your Word document…", main: "" },
  validating: { heading: "Checking the finished document…", main: "" },
  slow: { heading: "This is taking longer than usual. Your document is still being checked.", main: "" },
  ready_findings: { heading: "Your proofread document is ready.", main: "Review Agmt’s changes and comments in Word." },
  ready_zero: { heading: "No issues found by the completed checks.", main: "This does not confirm that the document is error-free." },
  limited: { heading: "Your document is ready with limited coverage.", main: "Proof skipped some parts. Review these parts yourself." },
  coverage_details: { heading: "Checked", main: "Not checked" },
  unsupported: { heading: "Proof can’t safely process this document yet.", main: "This file contains unsupported tracked changes." },
  security_rejection: { heading: "This file could not pass our safety checks.", main: "" },
  temporary_failure: { heading: "We couldn’t finish checking this document.", main: "" },
  retry_ineligible: { heading: "This run can’t be retried. Please choose the document again.", main: "" },
  connection_lost: { heading: "We’ve lost the connection. Choose the file again to restart.", main: "" },
  download_started: { heading: "Your download has started. Check your browser’s downloads.", main: "" },
  delete_confirmation: { heading: "Delete this run’s files?", main: "You won’t be able to download them again. Any copy you already downloaded will remain on your device." },
  deleting: { heading: "Access has been closed. We’re deleting your files.", main: "" },
  delete_delayed: { heading: "Access is closed. Deletion is still being verified.", main: "" },
  deleted: { heading: "Your files have been deleted from Agmt’s content storage.", main: "" },
  expired_not_verified: { heading: "This run has expired and downloads are closed.", main: "" },
  unknown_run: { heading: "This run isn’t available.", main: "" },
  quota: { heading: "You’ve reached today’s free limit. You can start another check after the next UTC day.", main: "" },
  uploads_paused: { heading: PROOF_UPLOADS_PAUSED_HEADING, main: PROOF_UPLOADS_PAUSED_DETAIL },
});

const SUPPORT = "a1b2c3d4e5f60718";
const RUN = "run_2f8c1a9b0d4e6f70";
const STARTED = 1_800_000_000_000;

function summary(input: {
  status: RunStatus;
  stage?: ProofStage;
  serverNow?: number;
  correctionCount?: number | null;
  commentCount?: number | null;
  noticeCount?: number | null;
  coverage?: RunSummaryV2["coverage"];
  retry?: RunSummaryV2["retry"];
  download?: boolean;
  deletion?: RunSummaryV2["deletion"];
  error?: RunSummaryV2["error"];
}): RunSummaryV2 {
  const status = input.status;
  const pending = !["ready", "rejected", "failed", "deleting", "deleted"].includes(status);
  return parseRunSummaryV2({
    apiVersion: PROOF_API_VERSION,
    runId: RUN,
    status,
    stage: input.stage ?? status,
    serverNow: input.serverNow ?? STARTED + 60_000,
    deadlines: proofDeadlines(STARTED),
    correctionCount: input.correctionCount ?? (pending ? null : 0),
    commentCount: input.commentCount ?? (pending ? null : 0),
    noticeCount: input.noticeCount ?? (pending ? null : 0),
    coverage: input.coverage ?? (pending ? null : { status: "complete", checked: [{ code: "language_typo_allowlist", count: 0 }], skipped: [], notApplicable: [] }),
    retry: input.retry ?? { allowed: false, code: null },
    download: { available: input.download ?? false },
    deletion: input.deletion ?? { requestedAt: null, verifiedAt: null, reason: null },
    error: input.error ?? null,
  });
}

export type ProofUiFixture = {
  state: ProofUiStateId;
  copy: { heading: string; main: string };
  run: RunSummaryV2 | null;
  capabilitiesAccepting: boolean;
};

const limitedCoverage = {
  status: "limited" as const,
  checked: [{ code: "language_typo_allowlist", count: 1 }],
  skipped: [{ code: "headers_footers_not_checked" as const, count: 1, reason: "headers_footers_not_checked" as const }],
  notApplicable: [] as CoverageReasonCode[],
};

export const PROOF_UI_FIXTURES: readonly ProofUiFixture[] = Object.freeze(PROOF_UI_STATE_IDS.map((state) => {
  const copy = PROOF_UI_COPY[state];
  const runByState: Partial<Record<ProofUiStateId, RunSummaryV2 | null>> = {
    uploading: summary({ status: "uploading" }),
    scanning: summary({ status: "scanning" }),
    queued: summary({ status: "queued" }),
    processing: summary({ status: "processing" }),
    exporting: summary({ status: "exporting" }),
    validating: summary({ status: "exporting", stage: "validating" }),
    slow: summary({ status: "processing", serverNow: STARTED + 130_000 }),
    ready_findings: summary({ status: "ready", correctionCount: 2, commentCount: 2, noticeCount: 0, download: true }),
    ready_zero: summary({ status: "ready", correctionCount: 0, commentCount: 0, noticeCount: 0, download: true }),
    limited: summary({ status: "ready", correctionCount: 0, commentCount: 0, noticeCount: 1, coverage: limitedCoverage, download: true }),
    coverage_details: summary({ status: "ready", correctionCount: 0, commentCount: 0, noticeCount: 1, coverage: limitedCoverage, download: true }),
    unsupported: summary({ status: "rejected", error: { code: "unsupported_revisions", messageKey: "unsupported", retryable: false, supportId: SUPPORT } }),
    security_rejection: summary({ status: "rejected", error: { code: "unsafe_docx", messageKey: "security_rejection", retryable: false, supportId: SUPPORT } }),
    temporary_failure: summary({ status: "failed", retry: { allowed: true, code: "retryable_infrastructure" }, error: { code: "proof_failed", messageKey: "temporary_failure", retryable: true, supportId: SUPPORT } }),
    retry_ineligible: summary({ status: "failed", retry: { allowed: false, code: "retry_ineligible" }, error: { code: "proof_failed", messageKey: "retry_ineligible", retryable: false, supportId: SUPPORT } }),
    connection_lost: summary({ status: "processing" }),
    download_started: summary({ status: "ready", correctionCount: 1, commentCount: 0, noticeCount: 0, download: true }),
    delete_confirmation: summary({ status: "ready", correctionCount: 1, commentCount: 0, noticeCount: 0, download: true }),
    deleting: summary({ status: "deleting", deletion: { requestedAt: STARTED + 90_000, verifiedAt: null, reason: "manual" } }),
    delete_delayed: summary({ status: "deleting", deletion: { requestedAt: STARTED + 90_000, verifiedAt: null, reason: "manual" } }),
    deleted: summary({ status: "deleted", deletion: { requestedAt: STARTED + 90_000, verifiedAt: STARTED + 95_000, reason: "manual" } }),
    expired_not_verified: summary({ status: "ready", serverNow: proofDeadlines(STARTED).accessDeadline, correctionCount: 1, commentCount: 0, noticeCount: 0, download: false, deletion: { requestedAt: null, verifiedAt: null, reason: null } }),
    unknown_run: null,
    quota: null,
    uploads_paused: null,
  };
  return Object.freeze({
    state,
    copy,
    run: runByState[state] ?? null,
    capabilitiesAccepting: state !== "uploads_paused",
  });
}));
