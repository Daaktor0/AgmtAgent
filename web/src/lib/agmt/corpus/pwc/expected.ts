/**
 * Frozen expected actions for the PWC-03 corpus.
 * These are authored from the fixture specs, not copied from engine output.
 */
import { z } from "zod";
import {
  POSITIVE_SPECS,
  allSpecs,
  bodyParagraphTexts,
  cleanTwinSpec,
  type ExpectedAction,
  type FixtureKind,
  type PackageSpec,
} from "./generate.ts";
import type { LaunchRuleId } from "../../proof/contracts.ts";

export const PwcExpectedFindingSchema = z.strictObject({
  fixtureId: z.string().min(1),
  kind: z.enum(["positive", "clean_twin"]),
  family: z.string().min(1),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  ruleId: z.enum([
    "language.typo_allowlist",
    "language.duplicate_word",
    "completion.placeholder",
    "references.missing_target",
    "references.duplicate_number",
    "definitions.duplicate",
  ]).nullable(),
  ruleVersion: z.literal(1).nullable(),
  action: z.enum(["track_replace", "track_delete", "comment"]).nullable(),
  replacement: z.string().nullable(),
  quote: z.string().min(1).nullable(),
  paragraphIndex: z.number().int().nonnegative().nullable(),
  textStart: z.number().int().nonnegative().nullable(),
  textEnd: z.number().int().nonnegative().nullable(),
  relatedQuote: z.string().nullable(),
  relatedParagraphIndex: z.number().int().nonnegative().nullable(),
  coverageExpectation: z.enum(["complete", "limited"]),
  rationale: z.string().min(1),
  excludedTraps: z.array(z.string()),
  supported: z.boolean(),
});
export type PwcExpectedFinding = z.infer<typeof PwcExpectedFindingSchema>;

export function quoteOffsets(paragraph: string, action: ExpectedAction): { start: number; end: number } {
  if (action.ruleId === "language.duplicate_word") {
    const word = action.quote.trim();
    const match = paragraph.match(new RegExp(`\\b${word}([ \\t\\u00a0]+)(${word})\\b`));
    if (!match || match.index == null) throw new Error(`duplicate-word locus missing: ${action.quote}`);
    const start = match.index + word.length + match[1]!.length;
    return { start, end: start + word.length };
  }
  const start = paragraph.indexOf(action.quote);
  if (start < 0) throw new Error(`quote missing from paragraph: ${action.quote}`);
  return { start, end: start + action.quote.length };
}

export function expectedFindingsFor(spec: PackageSpec, kind: FixtureKind, sourceSha256: string | null = null): PwcExpectedFinding[] {
  const coverageExpectation = spec.capabilityTags.includes("header_footer") || spec.capabilityTags.includes("multilingual")
    ? "limited"
    : "complete";
  if (kind === "clean_twin" || spec.expected.length === 0) {
    return [PwcExpectedFindingSchema.parse({
      fixtureId: spec.id,
      kind,
      family: spec.family,
      sourceSha256,
      ruleId: spec.targetRule,
      ruleVersion: spec.targetRule ? 1 : null,
      action: null,
      replacement: null,
      quote: null,
      paragraphIndex: null,
      textStart: null,
      textEnd: null,
      relatedQuote: null,
      relatedParagraphIndex: null,
      coverageExpectation,
      rationale: kind === "clean_twin"
        ? "Clean twin: the target error is absent; the engine must stay silent on that rule/locus."
        : "Negative trap family: no permitted action.",
      excludedTraps: spec.expected[0]?.excludedTraps ? [...spec.expected[0].excludedTraps] : [],
      supported: spec.supported,
    })];
  }

  const texts = bodyParagraphTexts(spec);
  return spec.expected.map((action) => {
    const paragraph = texts[action.paragraphIndex];
    if (paragraph == null) throw new Error(`${spec.id} missing paragraph ${action.paragraphIndex}`);
    const { start, end } = quoteOffsets(paragraph, action);
    if (paragraph.slice(start, end) !== action.quote) {
      throw new Error(`${spec.id} quote/offset mismatch: ${JSON.stringify(paragraph.slice(start, end))} !== ${JSON.stringify(action.quote)}`);
    }
    return PwcExpectedFindingSchema.parse({
      fixtureId: spec.id,
      kind,
      family: spec.family,
      sourceSha256,
      ruleId: action.ruleId,
      ruleVersion: action.ruleVersion,
      action: action.action,
      replacement: action.replacement,
      quote: action.quote,
      paragraphIndex: action.paragraphIndex,
      textStart: start,
      textEnd: end,
      relatedQuote: action.relatedQuote ?? null,
      relatedParagraphIndex: action.relatedParagraphIndex ?? null,
      coverageExpectation,
      rationale: action.rationale,
      excludedTraps: [...action.excludedTraps],
      supported: spec.supported,
    });
  });
}

export function allExpectedFindings(): PwcExpectedFinding[] {
  return allSpecs().flatMap((spec) => expectedFindingsFor(spec, spec.id.endsWith("_clean") ? "clean_twin" : "positive"));
}

/** Frozen labelled engine misses. Do not regenerate expected.ts to hide these. */
export const ENGINE_BASELINE_MISSES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "pwc-08-mixed-format-comment-only": [
    "employment_typo_split::language.typo_allowlist::recieve",
  ],
});

export function expectedKey(finding: { fixtureId: string; ruleId: LaunchRuleId | string | null; quote: string | null }): string {
  return `${finding.fixtureId}::${finding.ruleId ?? "none"}::${finding.quote ?? ""}`;
}

export { POSITIVE_SPECS, cleanTwinSpec };
