import { createHash } from "node:crypto";
import { DocxPackage } from "../docx-package.ts";
import { extractDocx } from "../docx-v2.ts";
import { resolveExtractedNumbering } from "../numbering.ts";
import { validateSourceSpan, type ProofSource } from "../source-map.ts";
import type { ExtractedDocument } from "../types.ts";
import { LAUNCH_RULE_SET_VERSION } from "./registry.ts";
import { ExportPlanSchema, type ProofFinding } from "./contracts.ts";
import { launchRuleFindings, type LaunchContext } from "./launch-checks.ts";
import { EvidenceError, toFindingV2, validateFindingV2, type EvidenceContext } from "./evidence.ts";
import { admitFinding } from "../export/edit-capabilities.ts";
import { resolveProofFindings } from "./resolve-findings.ts";
import { executeLaunchRules } from "./rule-runtime.ts";

export function evidenceContext(ctx: LaunchContext): EvidenceContext {
  const receipt = ctx.extracted.packageCapabilityReceipt;
  if (!receipt) throw new EvidenceError("mapping_corruption", "missing_capability_receipt");
  return {
    sourceSha256: ctx.sourceSha256,
    source: ctx.source,
    receipt,
    stories: ctx.extracted.storyProjections ?? [],
  };
}

export function validateLaunchFinding(ctx: LaunchContext, finding: ProofFinding): void {
  validateSourceSpan(ctx.source, finding.primarySpan, finding.exactQuote);
  // Predicate replay binds absence inventories, related anchors, eligibility, replacement and edit preflight.
  const proposed = launchRuleFindings(ctx, finding.ruleId).find((f) => f.id === finding.id);
  if (!proposed) throw new Error("invalid_rule_evidence");
  const accepted = admitFinding(ctx.source, proposed);
  if (!accepted.finding || JSON.stringify(accepted.finding) !== JSON.stringify(finding)) throw new Error("invalid_rule_evidence");
  validateFindingV2(evidenceContext(ctx), toFindingV2(evidenceContext(ctx), finding));
}

function availableCapabilities(extracted: ExtractedDocument): Set<string> {
  const set = new Set<string>();
  for (const capability of extracted.capabilities ?? []) {
    if (capability.state !== "unsupported") set.add(capability.name);
  }
  if (!(extracted.capabilities ?? []).some((capability) => capability.name === "numbering" && capability.state === "unsupported")) {
    set.add("numbering");
  }
  return set;
}

export async function analyzeProof(bytes: Buffer, options: {
  profile?: "agreement" | "general";
  language?: "en-GB" | "en-US";
  pkg?: DocxPackage;
  maxSourceBytes?: number;
} = {}) {
  let source: ProofSource | undefined;
  const raw = await extractDocx(bytes, (s) => { source = s; }, {
    pkg: options.pkg,
    limits: options.pkg?.limits,
    maxSourceBytes: options.maxSourceBytes,
  });
  if (!source || !source.paragraphs.some((p) => p.text.trim())) throw new Error("no_supported_text");
  const pkg = options.pkg ?? DocxPackage.open(bytes, { verify: false });
  const names = pkg.names();
  if (names.some((n) => /_xmlsignatures|commentsExtended|commentsIds|people\.xml/i.test(n))) throw new Error("unsupported_review_structure");
  const settings = pkg.has("word/settings.xml") ? pkg.text("word/settings.xml") : undefined;
  if (settings && /w:documentProtection|w:writeProtection/.test(settings)) throw new Error("protected_document");
  if (source.gaps.includes("complex_revision")) throw new Error("unsupported_complex_revision");
  const extracted = await resolveExtractedNumbering(bytes, raw, pkg);
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const ctx = { source, extracted, sourceSha256 };
  const runtime = executeLaunchRules(ctx, {
    profile: options.profile ?? "agreement",
    language: options.language ?? "en-GB",
    capabilities: availableCapabilities(extracted),
  });
  const skippedReview: string[] = [];
  const findings: ProofFinding[] = [];
  const evidence = evidenceContext(ctx);
  for (const proposed of runtime.findings) {
    try {
      validateSourceSpan(source, proposed.primarySpan, proposed.exactQuote);
      for (const span of proposed.relatedSpans) {
        const paragraph = source.paragraphs.find((item) => JSON.stringify(item.paragraphPath) === JSON.stringify(span.paragraphPath));
        if (!paragraph) throw new Error("invalid_related_evidence");
        validateSourceSpan(source, span, paragraph.text.slice(span.textStart, span.textEnd));
      }
      const accepted = admitFinding(source, proposed);
      if (!accepted.finding) {
        if (accepted.skipped) skippedReview.push(accepted.skipped);
        continue;
      }
      validateFindingV2(evidence, toFindingV2(evidence, accepted.finding));
      findings.push(accepted.finding);
    } catch (error) {
      if (error instanceof EvidenceError && error.code === "mapping_corruption") throw error;
    }
  }
  if (runtime.executions.every((execution) => execution.outcome === "failed" || execution.outcome === "suppressed")) {
    throw new Error("all_checks_failed");
  }
  const resolved = resolveProofFindings(source, findings);
  const gaps = [...source.gaps, ...skippedReview, ...resolved.coverageReasons, ...runtime.coverageReasons];
  if (extracted.blocks.some((block) => block.isHeaderFooter && block.text.trim())) gaps.push("non_main_story_checks");
  if (source.paragraphs.some((paragraph) => paragraph.nodes.some((node) => !node.editable && !node.revision))) {
    gaps.push("protected_text_language_checks");
  }
  if (runtime.executions.some((execution) => execution.outcome === "failed" || execution.outcome === "suppressed")) {
    gaps.push("incomplete_checks");
  }
  const coverage = gaps.length ? "limited" : "complete";
  const plan = ExportPlanSchema.parse({
    sourceSha256,
    ruleSetVersion: LAUNCH_RULE_SET_VERSION,
    exporterVersion: "proof-ooxml-v1",
    author: "Agmt Proof",
    initials: "AP",
    findings: resolved.findings,
    notices: [],
  });
  return {
    source,
    extracted,
    plan,
    executions: runtime.executions,
    coverage,
    gaps,
    sourceSha256,
    llmCalls: 0 as const,
  };
}
