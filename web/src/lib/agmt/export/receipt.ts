import { z } from "zod";
import { ExportPlanSchema, type ExportPlan } from "../proof/contracts.ts";

export const EXPORT_RECEIPT_VERSION = "proof-export-receipt-v1" as const;
export const EXPORTER_VERSION = "proof-ooxml-v1" as const;

const idToken = z.string().min(1).max(32);

export const ExportReceiptSchema = z.strictObject({
  receiptVersion: z.literal(EXPORT_RECEIPT_VERSION),
  exporterVersion: z.literal(EXPORTER_VERSION),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  planFindingIds: z.array(z.string().min(1)).max(500),
  revisionIds: z.array(idToken),
  commentIds: z.array(idToken),
  noticeIds: z.array(idToken),
  modifiedParts: z.array(z.string().min(1).max(256)),
  plan: ExportPlanSchema,
}).refine((receipt) => receipt.sourceSha256 === receipt.plan.sourceSha256, "receipt_source_mismatch")
  .refine((receipt) => {
    const planned = receipt.plan.findings.map((finding) => finding.id);
    return planned.length === receipt.planFindingIds.length && planned.every((id, index) => id === receipt.planFindingIds[index]);
  }, "receipt_plan_ids_mismatch")
  .refine((receipt) => new Set(receipt.revisionIds).size === receipt.revisionIds.length, "duplicate_revision_id")
  .refine((receipt) => {
    const allocated = [...receipt.commentIds, ...receipt.noticeIds];
    return new Set(allocated).size === allocated.length;
  }, "duplicate_comment_id")
  .refine((receipt) => receipt.commentIds.length === receipt.plan.findings.filter((finding) => finding.kind === "comment").length, "comment_count_mismatch")
  .refine((receipt) => receipt.noticeIds.length === receipt.plan.notices.length, "notice_count_mismatch");

export type ExportReceipt = z.infer<typeof ExportReceiptSchema>;

export function emptyExportReceipt(plan: ExportPlan): ExportReceipt {
  return ExportReceiptSchema.parse({
    receiptVersion: EXPORT_RECEIPT_VERSION,
    exporterVersion: EXPORTER_VERSION,
    sourceSha256: plan.sourceSha256,
    planFindingIds: plan.findings.map((finding) => finding.id),
    revisionIds: [],
    commentIds: [],
    noticeIds: [],
    modifiedParts: [],
    plan,
  });
}

export function plannedModifiedParts(sourceHasComments: boolean, plan: ExportPlan): string[] {
  if (!plan.findings.length && !plan.notices.length) return [];
  const parts = new Set<string>();
  for (const finding of plan.findings) {
    parts.add(finding.primarySpan.partUri.replace(/^\//, ""));
  }
  if (plan.notices.length) parts.add("word/document.xml");
  const needsComments = plan.findings.some((finding) => finding.kind === "comment") || plan.notices.length > 0;
  if (needsComments) {
    parts.add("word/comments.xml");
    if (!sourceHasComments) {
      parts.add("word/_rels/document.xml.rels");
      parts.add("[Content_Types].xml");
    }
  }
  return [...parts];
}
