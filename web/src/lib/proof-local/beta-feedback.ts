import { z } from "zod";

export const PROOF_CLIENT_VERSION = "proof-local-beta-2026-09-11";
export const PROOF_BETA_FEEDBACK_VERSION = "proof-beta-feedback-v1";
export const PROOF_BETA_FEEDBACK_MAX_NOTE = 4000;

export const ProofBetaFeedbackCategorySchema = z.enum([
  "incorrect_finding",
  "missed_error",
  "formatting_download",
]);
export type ProofBetaFeedbackCategory = z.infer<typeof ProofBetaFeedbackCategorySchema>;

export const ProofBetaFeedbackRequestSchema = z.strictObject({
  category: ProofBetaFeedbackCategorySchema,
  note: z.string().max(PROOF_BETA_FEEDBACK_MAX_NOTE),
  includeTechnical: z.boolean(),
  appVersion: z.string().max(128).nullable(),
  browser: z.string().max(256).nullable(),
});
export type ProofBetaFeedbackRequest = z.infer<typeof ProofBetaFeedbackRequestSchema>;

export const PROOF_BETA_FEEDBACK_COPY = {
  heading: "Send feedback",
  intro: "This is an invited testing cohort. The public Proof page stays available. Do not include confidential document text, names, filenames or excerpts.",
  reminder: "Do not paste clauses, party names, file names or screenshots of the document. Describe the problem in your own words.",
  technicalDisclosure: "Include the app version and browser details. These identify your software, not your document.",
  send: "Send feedback",
  sent: "Thank you. Your report was sent. It does not include the document.",
  failed: "Feedback could not be sent. Copy your note and send it through your existing Agmt contact if you have one.",
} as const;

export function proofBetaFeedbackBody(input: {
  category: ProofBetaFeedbackCategory;
  note: string;
  includeTechnical: boolean;
  appVersion: string;
  browser: string;
}): ProofBetaFeedbackRequest {
  const note = input.note.trim();
  return ProofBetaFeedbackRequestSchema.parse({
    category: input.category,
    note,
    includeTechnical: input.includeTechnical,
    appVersion: input.includeTechnical ? input.appVersion.slice(0, 128) : null,
    browser: input.includeTechnical ? input.browser.slice(0, 256) : null,
  });
}
