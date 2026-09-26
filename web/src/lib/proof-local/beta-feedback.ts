import { z } from "zod";

export const PROOF_CLIENT_VERSION = "proof-local-supervised-2026-09-11";
export const PROOF_BETA_FEEDBACK_VERSION = "proof-beta-feedback-v2";

export const ProofBetaFeedbackCategorySchema = z.enum([
  "incorrect_finding",
  "missed_error",
  "formatting_download",
]);
export type ProofBetaFeedbackCategory = z.infer<typeof ProofBetaFeedbackCategorySchema>;

export const ProofBetaFeedbackReasonSchema = z.enum([
  "incorrect_comment",
  "incorrect_correction",
  "misplaced_anchor",
  "missed_in_scope",
  "formatting_changed",
  "download_failed",
  "coverage_wrong",
]);
export type ProofBetaFeedbackReason = z.infer<typeof ProofBetaFeedbackReasonSchema>;

export const ProofBetaFeedbackRequestSchema = z.strictObject({
  category: ProofBetaFeedbackCategorySchema,
  reasonCode: ProofBetaFeedbackReasonSchema.nullable(),
  includeTechnical: z.boolean(),
  appVersion: z.string().max(128).nullable(),
  browser: z.string().max(256).nullable(),
});
export type ProofBetaFeedbackRequest = z.infer<typeof ProofBetaFeedbackRequestSchema>;

export const PROOF_BETA_FEEDBACK_COPY = {
  heading: "Send feedback",
  intro: "This is an invited testing cohort. The public Proof page stays available. This form records a category and optional closed reason only. It does not collect written notes, filenames, excerpts or documents.",
  reminder: "Do not send confidential document text. Written descriptions are not stored on this form. If you were given a contact by the person who invited you, use that channel and do not paste confidential clauses.",
  technicalDisclosure: "Include the app version and browser details. These identify your software, not your document. They are stored only if you tick this box.",
  send: "Send category",
  sent: "Category recorded. No written note, filename or document was stored.",
  failed: "The category could not be recorded. Try again later, or use the contact you were given when invited.",
} as const;

export const PROOF_BETA_FEEDBACK_REASONS: { id: ProofBetaFeedbackReason; label: string }[] = [
  { id: "incorrect_comment", label: "An incorrect comment" },
  { id: "incorrect_correction", label: "An incorrect tracked change" },
  { id: "misplaced_anchor", label: "A comment or change in the wrong place" },
  { id: "missed_in_scope", label: "A missed error that Proof says it checks" },
  { id: "formatting_changed", label: "Formatting was changed" },
  { id: "download_failed", label: "Download failed or would not open" },
  { id: "coverage_wrong", label: "The coverage statement looked wrong" },
];

export function proofBetaFeedbackBody(input: {
  category: ProofBetaFeedbackCategory;
  reasonCode: ProofBetaFeedbackReason | null;
  includeTechnical: boolean;
  appVersion: string;
  browser: string;
}): ProofBetaFeedbackRequest {
  return ProofBetaFeedbackRequestSchema.parse({
    category: input.category,
    reasonCode: input.reasonCode,
    includeTechnical: input.includeTechnical,
    appVersion: input.includeTechnical ? input.appVersion.slice(0, 128) : null,
    browser: input.includeTechnical ? input.browser.slice(0, 256) : null,
  });
}
