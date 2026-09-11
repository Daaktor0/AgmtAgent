/**
 * Closed punctuation and spacing rules (PEE-21 / PWC-43 subset).
 * Exact-mechanical corrections only. Unbalanced pairs are comments.
 * Pairs are evaluated across consecutive same-story paragraphs; a missing
 * close in one paragraph is not inferred when the neighbour completes it.
 */
import { candidateFinding, ordinaryProse, quoteKind, spanHasProtectedMarkup, type LaunchContext } from "../launch-context.ts";
import type { LaunchRuleId, ProofFinding } from "../contracts.ts";
import type { SourceParagraph } from "../../source-map.ts";

const ABBREV = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "ltd", "inc", "st", "rd", "ave",
  "no", "nos", "vol", "pp", "fig", "vs", "etc", "al", "approx", "est",
]);

function spanNodes(paragraph: SourceParagraph, start: number, end: number) {
  return paragraph.nodes.filter((node) => node.start < end && node.end > start);
}

function eligible(paragraph: SourceParagraph, start: number, end: number, ctx: LaunchContext): boolean {
  if (!ordinaryProse(paragraph, start, end, ctx)) return false;
  if (spanHasProtectedMarkup(ctx.source, paragraph, start, end)) return false;
  const nodes = spanNodes(paragraph, start, end);
  if (!nodes.length) return false;
  return nodes.every((node) => node.editable || node.revision);
}

function mechanicalFinding(
  ctx: LaunchContext,
  rule: LaunchRuleId,
  paragraph: SourceParagraph,
  start: number,
  end: number,
  comment: string,
  replacement?: string,
): ProofFinding {
  if (quoteKind(paragraph.text, start, end, ctx) === "prose" && replacement !== undefined) {
    return candidateFinding(rule, {
      p: paragraph,
      start,
      end,
      comment: `${comment} Quoted prose is marked as a comment, not a tracked change.`,
    });
  }
  return candidateFinding(rule, { p: paragraph, start, end, replacement, comment });
}

function spacedEllipsis(text: string, index: number): boolean {
  const from = Math.max(0, index - 4);
  const to = Math.min(text.length, index + 6);
  return /\. \. \./.test(text.slice(from, to));
}

function duplicateMarkFindings(ctx: LaunchContext): ProofFinding[] {
  const out: ProofFinding[] = [];
  for (const paragraph of ctx.source.paragraphs) {
    for (const match of paragraph.text.matchAll(/([,.;:])\1+/g)) {
      const mark = match[1]!;
      const run = match[0];
      if (mark === "." && run.length >= 3) continue;
      const start = match.index;
      const end = start + run.length;
      if (!eligible(paragraph, start, end, ctx)) continue;
      out.push(mechanicalFinding(ctx, "punctuation.duplicate_mark", paragraph, start, end, `Repeated punctuation: ‘${run}’ → ‘${mark}’.`, mark));
    }
  }
  return out;
}

function accidentalSpacingFindings(ctx: LaunchContext): ProofFinding[] {
  const out: ProofFinding[] = [];
  for (const paragraph of ctx.source.paragraphs) {
    if (paragraph.isTable) continue;
    for (const match of paragraph.text.matchAll(/(?<![.?!])(?<=\S) {2,}(?=\S)/g)) {
      const start = match.index;
      const end = start + match[0].length;
      if (!eligible(paragraph, start, end, ctx)) continue;
      out.push(mechanicalFinding(ctx, "spacing.accidental", paragraph, start, end, "Extra ordinary-prose space.", " "));
    }
  }
  return out;
}

function spaceBeforeFindings(ctx: LaunchContext): ProofFinding[] {
  const out: ProofFinding[] = [];
  for (const paragraph of ctx.source.paragraphs) {
    for (const match of paragraph.text.matchAll(/ +([,.;:)])/g)) {
      const start = match.index;
      const end = start + match[0].length;
      if (match[1] === "." && spacedEllipsis(paragraph.text, start)) continue;
      if (!eligible(paragraph, start, end, ctx)) continue;
      out.push(mechanicalFinding(ctx, "punctuation.space_before", paragraph, start, end, `Space before punctuation: ‘${match[0]}’ → ‘${match[1]}’.`, match[1]));
    }
  }
  return out;
}

function wordBefore(text: string, punctIndex: number): string {
  const slice = text.slice(0, punctIndex);
  const match = slice.match(/([A-Za-z]+)$/);
  return match?.[1] ?? "";
}

function missingSpaceAfterFindings(ctx: LaunchContext): ProofFinding[] {
  const out: ProofFinding[] = [];
  for (const paragraph of ctx.source.paragraphs) {
    for (const match of paragraph.text.matchAll(/([A-Za-z][,;:])(?=[A-Za-z])/g)) {
      const punctAt = match.index + match[0].length - 1;
      const start = punctAt;
      const end = punctAt + 1;
      if (!eligible(paragraph, start, end, ctx)) continue;
      const punct = paragraph.text[punctAt]!;
      out.push(mechanicalFinding(ctx, "punctuation.missing_space_after", paragraph, start, end, `Missing space after ‘${punct}’.`, `${punct} `));
    }
    for (const match of paragraph.text.matchAll(/([a-z])\.(?=[A-Z])/g)) {
      const start = match.index + 1;
      const end = start + 1;
      const previous = wordBefore(paragraph.text, start);
      if (previous.length <= 1 || ABBREV.has(previous.toLowerCase())) continue;
      if (!eligible(paragraph, start, end, ctx)) continue;
      out.push(mechanicalFinding(ctx, "punctuation.missing_space_after", paragraph, start, end, "Missing space after a full stop.", ". "));
    }
  }
  return out;
}

const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}", "“": "”" };
const CLOSE: Record<string, string> = { ")": "(", "]": "[", "}": "{", "”": "“" };

function placeholderSpan(text: string, start: number): boolean {
  for (const match of text.matchAll(/\[[^\]]{0,80}\]/g)) {
    if (match.index <= start && start < match.index + match[0].length) return true;
  }
  return false;
}

function pairingBarrier(paragraph: SourceParagraph): boolean {
  return paragraph.isTable || /heading|title|address|signature/i.test(paragraph.style ?? "") || !paragraph.safe;
}

function pairingUnits(ctx: LaunchContext): SourceParagraph[][] {
  const units: SourceParagraph[][] = [];
  let current: SourceParagraph[] = [];
  let previous: SourceParagraph | undefined;
  for (const paragraph of ctx.source.paragraphs) {
    if (pairingBarrier(paragraph)) {
      if (current.length) units.push(current);
      current = [];
      previous = undefined;
      continue;
    }
    const sameBlock = previous
      && previous.partUri === paragraph.partUri
      && previous.storyId === paragraph.storyId;
    if (!sameBlock && current.length) {
      units.push(current);
      current = [];
    }
    current.push(paragraph);
    previous = paragraph;
  }
  if (current.length) units.push(current);
  return units;
}

function unmatchedInUnit(paragraphs: SourceParagraph[]): { paragraph: SourceParagraph; start: number }[] {
  const joined = paragraphs.map((paragraph) => paragraph.text).join("\n");
  const stack: { char: string; index: number }[] = [];
  const extras: number[] = [];
  let offset = 0;
  const locate = (index: number) => {
    let cursor = 0;
    for (const paragraph of paragraphs) {
      if (index < cursor + paragraph.text.length) {
        return { paragraph, start: index - cursor };
      }
      cursor += paragraph.text.length + 1;
    }
    return null;
  };
  for (const paragraph of paragraphs) {
    for (let i = 0; i < paragraph.text.length; i++) {
      const ch = paragraph.text[i]!;
      const index = offset + i;
      if (placeholderSpan(joined, index) || placeholderSpan(paragraph.text, i)) continue;
      if (OPEN[ch]) stack.push({ char: ch, index });
      else if (CLOSE[ch]) {
        const last = stack.at(-1);
        if (last && OPEN[last.char] === ch) stack.pop();
        else extras.push(index);
      }
    }
    offset += paragraph.text.length + 1;
  }
  const quotes: number[] = [];
  offset = 0;
  for (const paragraph of paragraphs) {
    for (let i = 0; i < paragraph.text.length; i++) {
      if (paragraph.text[i] === '"') quotes.push(offset + i);
    }
    offset += paragraph.text.length + 1;
  }
  const unmatched = [
    ...stack.map((item) => item.index),
    ...extras,
    ...(quotes.length % 2 === 1 ? [quotes[quotes.length - 1]!] : []),
  ];
  return unmatched.map(locate).filter((item): item is { paragraph: SourceParagraph; start: number } => Boolean(item));
}

function unbalancedFindings(ctx: LaunchContext): ProofFinding[] {
  const out: ProofFinding[] = [];
  for (const unit of pairingUnits(ctx)) {
    for (const hit of unmatchedInUnit(unit)) {
      const end = hit.start + 1;
      if (!eligible(hit.paragraph, hit.start, end, ctx)) continue;
      out.push(candidateFinding("punctuation.unbalanced_pair", {
        p: hit.paragraph,
        start: hit.start,
        end,
        comment: `This ‘${hit.paragraph.text[hit.start]}’ is unmatched in the surrounding paragraphs. Proof has not inserted a closing mark.`,
      }));
    }
  }
  return out;
}

export function mechanicsRuleFindings(ctx: LaunchContext, rule: LaunchRuleId): ProofFinding[] {
  if (rule === "punctuation.duplicate_mark") return duplicateMarkFindings(ctx);
  if (rule === "spacing.accidental") return accidentalSpacingFindings(ctx);
  if (rule === "punctuation.space_before") return spaceBeforeFindings(ctx);
  if (rule === "punctuation.missing_space_after") return missingSpaceAfterFindings(ctx);
  if (rule === "punctuation.unbalanced_pair") return unbalancedFindings(ctx);
  return [];
}
