/** Metadata only. Content-bearing Proof findings/plans must never enter these DTOs. */
export type ProductId = "proof" | "review" | "executed-copy" | "signature-pack";
export type RunStatus = "uploading" | "scanning" | "queued" | "processing" | "exporting" |
  "ready" | "rejected" | "failed" | "deleting" | "deleted";
export type RunDeadlines = Readonly<{
  uploadStartedAt: number;
  retentionDeadline: number;
  accessDeadline: number;
  processingDeadline: number;
  uploadGrantDeadline: number;
}>;
export type ArtifactKind = "source" | "analysis" | "export_plan" | "marked_docx";
export type ArtifactState = "staged" | "published" | "deleting" | "deleted";
export type RuleOutcome = "completed_with_findings" | "completed_zero_findings" |
  "not_applicable" | "suppressed" | "failed";
export type RunSummary = {
  runId: string;
  productId: "proof";
  status: RunStatus;
  deadlines: RunDeadlines;
  serverNow: number;
  correctionCount: number;
  commentCount: number;
  coverage: "complete" | "limited" | null;
  deletionVerifiedAt: number | null;
};
