/**
 * Pure Proof run-state presentation (PWC-29).
 *
 * Maps RunSummaryV2 plus local overlays onto section 9 copy. Availability
 * uses the summary's serverNow, never the client clock alone. Fixtures are
 * tests/stories only and must not be treated as live processing.
 */
import {
  PROOF_UI_COPY,
  type CoverageReasonCode,
  type ProofUiStateId,
  type RunSummaryV2,
} from "./api-contracts.ts";
import type { RunStatus } from "./contracts.ts";
import { PROOF_MAX_SOURCE_BYTES } from "./capabilities.ts";

export const PROOF_STATE_VERSION = "proof-state-v1";
export const PROOF_SLOW_AFTER_MS = 120_000;
export const PROOF_AUTH_LOADING_RETRY_MS = 15_000;
export const PROOF_STALE_SUMMARY_MS = 15_000;

const TERMINAL = new Set<RunStatus>(["ready", "rejected", "failed", "deleted"]);

export const COVERAGE_REASON_COPY: Readonly<Record<CoverageReasonCode, string>> = Object.freeze({
  headers_footers_not_checked: "Headers and footers were preserved but not checked",
  notes_not_checked: "Footnotes and endnotes were preserved but not checked",
  existing_revisions_not_edited: "Some text already marked with tracked changes was not edited",
  existing_comments_preserved: "Existing comments were preserved and not treated as new issues",
  definition_scope_unclear: "Definition checks were skipped because the scope was unclear",
  numbering_scope_unclear: "Numbering checks were skipped because the scope was unclear",
  non_english_skipped: "Non-English passages were skipped",
  fields_not_checked: "Field instructions and cached results were preserved but not checked",
  unsupported_story: "Some document stories were preserved but not checked",
  rule_budget: "Some checks stopped after a time or candidate limit",
  finding_cap: "Some findings were omitted after the published-finding limit",
  complex_revision: "Complex existing revisions were left unchanged",
  protected_range: "Protected ranges were left unchanged",
});

export type ProofAuthKind = "loading" | "signed_out" | "unverified" | "verified" | "unavailable";
export type ProofSelectionError = "wrong_extension" | "too_large" | "multiple_files";

export type ProofLocalContext = {
  auth: ProofAuthKind;
  authLoadingMs?: number;
  verificationSent?: boolean;
  selected?: { name: string; size: number } | null;
  selectionError?: ProofSelectionError | null;
  uploadsPaused: boolean;
  quotaExceeded?: boolean;
  quotaRetryAt?: number | null;
  connectionLost?: boolean;
  downloadStarted?: boolean;
  deleteConfirming?: boolean;
  deleteDelayed?: boolean;
  uploading?: { sent: number; total: number } | null;
  unknownRun?: boolean;
  developmentFixture?: boolean;
  processingUnavailable?: boolean;
  receivedAt?: number;
  clientNow?: number;
};

export type ProofActionFlags = {
  download: boolean;
  delete: boolean;
  retry: boolean;
  checkStatus: boolean;
  chooseFile: boolean;
  chooseDifferentFile: boolean;
  signIn: boolean;
  verify: boolean;
  resendVerification: boolean;
  cancelUpload: boolean;
  keepFiles: boolean;
  proofread: boolean;
  startAnother: boolean;
};

export type ProofPresentation = {
  state: ProofUiStateId;
  heading: string;
  main: string;
  detail: string | null;
  counts: { corrections: number; comments: number; notices: number } | null;
  coverageLines: readonly { kind: "checked" | "skipped" | "not_applicable"; text: string }[];
  timestamps: {
    accessIso: string;
    retentionIso: string;
    accessLabel: string;
    retentionLabel: string;
  } | null;
  actions: ProofActionFlags;
  live: "off" | "polite";
  progress: { sent: number; total: number } | null;
  selectedLabel: string | null;
  supportId: string | null;
  retryAfterLabel: string | null;
  developmentFixture: boolean;
  downloadAvailable: boolean;
};

const idleActions: ProofActionFlags = {
  download: false,
  delete: false,
  retry: false,
  checkStatus: false,
  chooseFile: false,
  chooseDifferentFile: false,
  signIn: false,
  verify: false,
  resendVerification: false,
  cancelUpload: false,
  keepFiles: false,
  proofread: false,
  startAnother: false,
};

export function selectedFileError(file: { name: string; size: number }): string | null {
  if (!/\.docx$/i.test(file.name)) return "Please upload the original Word (.docx) document.";
  if (file.size <= 0 || file.size > PROOF_MAX_SOURCE_BYTES) return "Choose one Word document up to 25 MiB.";
  return null;
}

export function interpretFileSelection(
  incoming: readonly { name: string; size: number }[],
  current: { name: string; size: number } | null,
): { file: { name: string; size: number } | null; error: ProofSelectionError | null; currentUnchanged: boolean } {
  if (incoming.length > 1) {
    return { file: current, error: "multiple_files", currentUnchanged: true };
  }
  const next = incoming[0];
  if (!next) return { file: current, error: null, currentUnchanged: true };
  if (!/\.docx$/i.test(next.name) || next.size <= 0) {
    return { file: null, error: "wrong_extension", currentUnchanged: false };
  }
  if (next.size > PROOF_MAX_SOURCE_BYTES) {
    return { file: null, error: "too_large", currentUnchanged: false };
  }
  return { file: next, error: null, currentUnchanged: false };
}

export function formatProofInstant(epochMs: number): { iso: string; label: string } {
  const date = new Date(epochMs);
  return {
    iso: date.toISOString(),
    label: new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date),
  };
}

export function isStaleSummary(summary: RunSummaryV2 | null, receivedAt: number | undefined, clientNow: number): boolean {
  if (!summary || receivedAt == null) return false;
  if (TERMINAL.has(summary.status) || summary.status === "deleting") return false;
  return clientNow - receivedAt > PROOF_STALE_SUMMARY_MS;
}

export function rejectRegressiveSummary(previous: RunSummaryV2 | null, next: RunSummaryV2): RunSummaryV2 {
  if (!previous) return next;
  if (TERMINAL.has(previous.status) && !TERMINAL.has(next.status) && previous.status !== next.status) {
    return previous;
  }
  if (previous.status === "deleting" && next.status !== "deleting" && next.status !== "deleted") {
    return previous;
  }
  return next;
}

function coverageLines(summary: RunSummaryV2 | null): ProofPresentation["coverageLines"] {
  const coverage = summary?.coverage;
  if (!coverage) return [];
  const lines: { kind: "checked" | "skipped" | "not_applicable"; text: string }[] = [];
  for (const item of coverage.checked) {
    lines.push({ kind: "checked", text: item.code.replaceAll("_", " ") });
  }
  for (const item of coverage.skipped) {
    lines.push({ kind: "skipped", text: COVERAGE_REASON_COPY[item.reason] ?? item.reason.replaceAll("_", " ") });
  }
  for (const code of coverage.notApplicable) {
    lines.push({ kind: "not_applicable", text: COVERAGE_REASON_COPY[code] ?? code.replaceAll("_", " ") });
  }
  return lines;
}

function timestamps(summary: RunSummaryV2 | null): ProofPresentation["timestamps"] {
  if (!summary) return null;
  const access = formatProofInstant(summary.deadlines.accessDeadline);
  const retention = formatProofInstant(summary.deadlines.retentionDeadline);
  return {
    accessIso: access.iso,
    retentionIso: retention.iso,
    accessLabel: access.label,
    retentionLabel: retention.label,
  };
}

function copyFor(state: ProofUiStateId, summary: RunSummaryV2 | null, local: ProofLocalContext): { heading: string; main: string; detail: string | null } {
  const base = PROOF_UI_COPY[state];
  if (state === "ready_findings" && summary && summary.correctionCount != null && summary.commentCount != null) {
    return {
      heading: base.heading,
      main: `${summary.correctionCount} tracked corrections · ${summary.commentCount} comments to review`,
      detail: base.main,
    };
  }
  if (state === "limited" && summary?.coverage) {
    const skipped = summary.coverage.skipped.map((item) => COVERAGE_REASON_COPY[item.reason] ?? item.reason);
    return {
      heading: base.heading,
      main: skipped.length
        ? `Proof skipped ${skipped.join("; ")}. Review these parts yourself.`
        : base.main,
      detail: null,
    };
  }
  if (state === "uploading" && local.uploading) {
    return {
      heading: base.heading,
      main: `${local.uploading.sent} of ${local.uploading.total}`,
      detail: "Keep this page open until upload finishes.",
    };
  }
  if (state === "queued" && summary) {
    return {
      heading: base.heading,
      main: `You can leave this page and return before ${formatProofInstant(summary.deadlines.accessDeadline).label}.`,
      detail: null,
    };
  }
  if (state === "quota" && local.quotaRetryAt != null) {
    return {
      heading: "You’ve reached today’s free limit. You can start another check after " + formatProofInstant(local.quotaRetryAt).label + ".",
      main: "",
      detail: "Existing downloads and deletion remain available.",
    };
  }
  if (state === "unsupported" && summary?.error?.code) {
    return { heading: base.heading, main: base.main, detail: null };
  }
  if (local.processingUnavailable) {
    return {
      heading: PROOF_UI_COPY.temporary_failure.heading,
      main: "Processing is not connected in this environment. This is not a completed Proof run.",
      detail: "Uploads stay disabled until the transfer broker, scanner and compute are provisioned.",
    };
  }
  return { heading: base.heading, main: base.main, detail: null };
}

function runState(summary: RunSummaryV2, local: ProofLocalContext): ProofUiStateId {
  const expired = summary.serverNow >= summary.deadlines.accessDeadline;
  if (summary.status === "deleted" && summary.deletion.verifiedAt != null) return "deleted";
  if (expired && summary.status !== "deleted") return "expired_not_verified";
  if (summary.status === "deleting") return local.deleteDelayed ? "delete_delayed" : "deleting";
  if (local.deleteConfirming && summary.status === "ready") return "delete_confirmation";
  if (local.downloadStarted && summary.status === "ready" && summary.download.available) return "download_started";
  if (local.connectionLost && !TERMINAL.has(summary.status)) return "connection_lost";
  if (summary.status === "ready") {
    if (summary.coverage?.status === "limited") return "limited";
    if ((summary.correctionCount ?? 0) + (summary.commentCount ?? 0) > 0) return "ready_findings";
    return "ready_zero";
  }
  if (summary.status === "rejected") {
    if (summary.error?.code === "unsafe_docx" || summary.error?.messageKey === "security_rejection") return "security_rejection";
    return "unsupported";
  }
  if (summary.status === "failed") return summary.retry.allowed ? "temporary_failure" : "retry_ineligible";
  if (summary.stage === "validating") return "validating";
  if (summary.status === "exporting") return "exporting";
  if (summary.status === "processing") {
    const elapsed = summary.serverNow - summary.deadlines.uploadStartedAt;
    return elapsed > PROOF_SLOW_AFTER_MS ? "slow" : "processing";
  }
  if (summary.status === "queued") return "queued";
  if (summary.status === "scanning") return "scanning";
  if (summary.status === "uploading") return local.uploading ? "uploading" : "uploading";
  return "uploading";
}

function idleState(local: ProofLocalContext): ProofUiStateId {
  if (local.auth === "loading") {
    return (local.authLoadingMs ?? 0) >= PROOF_AUTH_LOADING_RETRY_MS ? "auth_unavailable" : "auth_loading";
  }
  if (local.auth === "unavailable") return "auth_unavailable";
  if (local.auth === "signed_out") return "signed_out";
  if (local.auth === "unverified") return local.verificationSent ? "verification_sent" : "unverified";
  if (local.unknownRun) return "unknown_run";
  if (local.quotaExceeded) return "quota";
  if (local.uploadsPaused) return "uploads_paused";
  if (local.processingUnavailable) return "temporary_failure";
  if (local.selectionError === "wrong_extension") return "wrong_extension";
  if (local.selectionError === "too_large") return "too_large";
  if (local.selectionError === "multiple_files") return "multiple_files";
  if (local.selected) return "selected";
  return "first_visit";
}

function actionsFor(state: ProofUiStateId, summary: RunSummaryV2 | null, local: ProofLocalContext): ProofActionFlags {
  const expired = summary != null && summary.serverNow >= summary.deadlines.accessDeadline;
  const download = Boolean(summary?.download.available && summary.status === "ready" && !expired && state !== "deleting" && state !== "deleted");
  const del = Boolean(summary && summary.status !== "deleting" && summary.status !== "deleted" && !expired);
  const flags: ProofActionFlags = { ...idleActions };
  switch (state) {
    case "first_visit":
    case "privacy_before_upload":
      flags.chooseFile = !local.uploadsPaused;
      break;
    case "auth_loading":
      break;
    case "signed_out":
      flags.signIn = true;
      flags.chooseFile = true;
      break;
    case "unverified":
      flags.resendVerification = true;
      flags.verify = true;
      break;
    case "verification_sent":
      flags.verify = true;
      break;
    case "auth_unavailable":
      flags.checkStatus = true;
      break;
    case "selected":
      flags.proofread = local.auth === "verified" && !local.uploadsPaused;
      flags.chooseDifferentFile = true;
      break;
    case "wrong_extension":
    case "too_large":
    case "multiple_files":
      flags.chooseFile = true;
      break;
    case "uploading":
      flags.cancelUpload = true;
      break;
    case "scanning":
    case "queued":
    case "processing":
    case "exporting":
    case "validating":
    case "slow":
      flags.delete = del;
      flags.checkStatus = state === "slow";
      break;
    case "connection_lost":
      flags.checkStatus = true;
      flags.delete = del;
      break;
    case "ready_findings":
    case "ready_zero":
    case "limited":
    case "coverage_details":
    case "download_started":
      flags.download = download;
      flags.delete = del;
      flags.startAnother = true;
      break;
    case "delete_confirmation":
      flags.delete = true;
      flags.keepFiles = true;
      flags.download = download;
      break;
    case "unsupported":
    case "security_rejection":
      flags.chooseFile = true;
      flags.delete = del;
      flags.startAnother = true;
      break;
    case "temporary_failure":
      flags.retry = Boolean(summary?.retry.allowed);
      flags.delete = del;
      flags.chooseFile = !summary?.retry.allowed;
      break;
    case "retry_ineligible":
      flags.chooseFile = true;
      flags.startAnother = true;
      flags.delete = del;
      break;
    case "deleting":
    case "delete_delayed":
      flags.checkStatus = true;
      break;
    case "deleted":
    case "expired_not_verified":
    case "unknown_run":
      flags.startAnother = true;
      flags.chooseFile = true;
      break;
    case "quota":
      flags.delete = del;
      flags.download = download;
      break;
    case "uploads_paused":
      flags.download = download;
      flags.delete = del;
      break;
    default:
      break;
  }
  if (local.uploadsPaused) flags.proofread = false;
  if (expired) {
    flags.download = false;
    if (state !== "deleted" && state !== "deleting" && state !== "delete_delayed") flags.delete = false;
  }
  return flags;
}

export function presentProofRun(summary: RunSummaryV2 | null, local: ProofLocalContext): ProofPresentation {
  const clientNow = local.clientNow ?? Date.now();
  const state = summary ? runState(summary, local) : idleState(local);
  const copy = copyFor(state, summary, local);
  const counts = summary && summary.correctionCount != null && summary.commentCount != null && summary.noticeCount != null
    ? { corrections: summary.correctionCount, comments: summary.commentCount, notices: summary.noticeCount }
    : null;
  const selected = local.selected
    ? `${local.selected.name} · ${(local.selected.size / 1024).toFixed(1)} KiB selected on your device`
    : null;
  const privacy = state === "first_visit" ? PROOF_UI_COPY.privacy_before_upload.heading : copy.detail;
  return {
    state,
    heading: copy.heading,
    main: copy.main,
    detail: state === "first_visit" ? privacy : copy.detail,
    counts,
    coverageLines: coverageLines(summary),
    timestamps: timestamps(summary),
    actions: actionsFor(state, summary, local),
    live: ["uploading", "scanning", "queued", "processing", "exporting", "validating", "slow", "deleting", "delete_delayed", "auth_loading"].includes(state)
      ? "polite"
      : "off",
    progress: local.uploading ?? null,
    selectedLabel: selected,
    supportId: summary?.error?.supportId ?? null,
    retryAfterLabel: local.quotaRetryAt != null ? formatProofInstant(local.quotaRetryAt).label : null,
    developmentFixture: Boolean(local.developmentFixture),
    downloadAvailable: Boolean(summary?.download.available && summary.status === "ready" && summary.serverNow < summary.deadlines.accessDeadline),
  };
}

/** Legacy mapping used only by remaining RunSummary callers. Prefer presentProofRun. */
export function proofView(run: { status: RunStatus; coverage: "complete" | "limited" | null; correctionCount: number; commentCount: number; deadlines: { accessDeadline: number } }, now: number) {
  if (run.status === "deleted" || now >= run.deadlines.accessDeadline) {
    return { message: PROOF_UI_COPY.expired_not_verified.heading, download: false, delete: false };
  }
  const presented = presentProofRun({
    apiVersion: 2,
    runId: "run_legacy_adapter_0001",
    status: run.status,
    stage: run.status,
    serverNow: now,
    deadlines: {
      uploadStartedAt: now - 60_000,
      retentionDeadline: run.deadlines.accessDeadline + 300_000,
      accessDeadline: run.deadlines.accessDeadline,
      processingDeadline: run.deadlines.accessDeadline,
      uploadGrantDeadline: now + 60_000,
    },
    correctionCount: ["ready", "rejected", "failed", "deleting", "deleted"].includes(run.status) ? run.correctionCount : null,
    commentCount: ["ready", "rejected", "failed", "deleting", "deleted"].includes(run.status) ? run.commentCount : null,
    noticeCount: ["ready", "rejected", "failed", "deleting", "deleted"].includes(run.status) ? 0 : null,
    coverage: ["ready", "rejected", "failed", "deleting", "deleted"].includes(run.status)
      ? { status: run.coverage === "limited" ? "limited" : "complete", checked: [], skipped: run.coverage === "limited" ? [{ code: "headers_footers_not_checked", count: 1, reason: "headers_footers_not_checked" }] : [], notApplicable: [] }
      : null,
    retry: { allowed: run.status === "failed", code: run.status === "failed" ? "retryable_infrastructure" : null },
    download: { available: run.status === "ready" && now < run.deadlines.accessDeadline },
    deletion: { requestedAt: null, verifiedAt: null, reason: null },
    error: null,
  }, { auth: "verified", uploadsPaused: false });
  return {
    message: presented.heading,
    download: presented.actions.download,
    delete: presented.actions.delete,
  };
}
