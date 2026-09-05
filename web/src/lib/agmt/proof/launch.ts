import { createHash } from "node:crypto";
import JSZip from "jszip";
import { extractDocx } from "../docx-v2.ts";
import { resolveExtractedNumbering } from "../numbering.ts";
import { validateSourceSpan, type ProofSource } from "../source-map.ts";
import type { RuleOutcome } from "../../products/contracts.ts";
import { LAUNCH_CHECKS, LAUNCH_RULE_SET_VERSION } from "./registry.ts";
import { ExportPlanSchema, type ProofFinding, type LaunchRuleId } from "./contracts.ts";
import { launchRuleFindings, type LaunchContext } from "./launch-checks.ts";

export function validateLaunchFinding(ctx: LaunchContext, finding: ProofFinding): void {
  validateSourceSpan(ctx.source, finding.primarySpan, finding.exactQuote);
  // Predicate replay binds absence inventories, related anchors, eligibility and replacement.
  const actual = launchRuleFindings(ctx, finding.ruleId).find((f) => f.id === finding.id);
  if (!actual || JSON.stringify(actual) !== JSON.stringify(finding)) throw new Error("invalid_rule_evidence");
}

export async function analyzeProof(bytes: Buffer) {
  let source: ProofSource | undefined;
  const raw = await extractDocx(bytes, (s) => { source = s; });
  if (!source || !source.paragraphs.some((p) => p.text.trim())) throw new Error("no_supported_text");
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  if (names.some((n) => /_xmlsignatures|commentsExtended|commentsIds|people\.xml/i.test(n))) throw new Error("unsupported_review_structure");
  const settings = await zip.file("word/settings.xml")?.async("string");
  if (settings && /w:documentProtection|w:writeProtection/.test(settings)) throw new Error("protected_document");
  if (source.gaps.includes("complex_revision")) throw new Error("unsupported_complex_revision");
  const extracted = await resolveExtractedNumbering(bytes, raw);
  const ctx = { source, extracted };
  const findings: ProofFinding[] = [];
  const executions: { ruleId: LaunchRuleId; version: 1; outcome: RuleOutcome; findingCount: number; code: string | null }[] = [];
  for (const spec of LAUNCH_CHECKS) {
    try {
      const proposed = launchRuleFindings(ctx, spec.checkId);
      for (const f of proposed) {
        validateSourceSpan(source, f.primarySpan, f.exactQuote);
        for (const span of f.relatedSpans) {
          const p = source.paragraphs.find((p) => JSON.stringify(p.paragraphPath) === JSON.stringify(span.paragraphPath));
          if (!p) throw new Error("invalid_related_evidence");
          validateSourceSpan(source, span, p.text.slice(span.textStart, span.textEnd));
        }
      }
      findings.push(...proposed);
      executions.push({ ruleId: spec.checkId, version: 1, outcome: proposed.length ? "completed_with_findings" : "completed_zero_findings", findingCount: proposed.length, code: null });
    } catch (e) {
      const incomplete = e instanceof Error && /^incomplete_/.test(e.message);
      executions.push({ ruleId: spec.checkId, version: 1, outcome: incomplete ? "suppressed" : "failed", findingCount: 0, code: incomplete ? "incomplete_scope" : "invalid_evidence" });
    }
  }
  if (executions.every((e) => e.outcome === "failed" || e.outcome === "suppressed")) throw new Error("all_checks_failed");
  if (findings.length > 500) throw new Error("excessive_findings");
  const gaps = [...source.gaps];
  if (extracted.blocks.some((b) => b.isHeaderFooter && b.text.trim())) gaps.push("non_main_story_checks");
  if (source.paragraphs.some((p) => p.nodes.some((n) => !n.editable && !n.revision))) gaps.push("protected_text_language_checks");
  if (executions.some((e) => e.outcome === "failed" || e.outcome === "suppressed")) gaps.push("incomplete_checks");
  const coverage = gaps.length ? "limited" : "complete";
  const plan = ExportPlanSchema.parse({ sourceSha256: createHash("sha256").update(bytes).digest("hex"), ruleSetVersion: LAUNCH_RULE_SET_VERSION, exporterVersion: "proof-ooxml-v1", author: "Agmt Proof", initials: "AP", findings, notices: [] });
  return { source, extracted, plan, executions, coverage, gaps, llmCalls: 0 as const };
}
