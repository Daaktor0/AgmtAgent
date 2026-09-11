/**
 * Closed punctuation and spacing rules (PEE-21 / PWC-43 subset).
 * Exact-mechanical corrections only. Unbalanced pairs are comments.
 */
import { candidateFinding, ordinaryProse, type LaunchContext } from "../launch-context.ts";
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
  const nodes = spanNodes(paragraph, start, end);
  if (!nodes.length) return false;
  return nodes.every((node) => node.editable || node.revision);
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
      out.push(candidateFinding("punctuation.duplicate_mark", {
        p: paragraph,
        start,
        end,
        replacement: mark,
        comment: `Repeated punctuation: ‘${run}’ → ‘${mark}’.`,
      }));
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
      out.push(candidateFinding("spacing.accidental", {
        p: paragraph,
        start,
        end,
        replacement: " ",
        comment: "Extra ordinary-prose space.",
      }));
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
      out.push(candidateFinding("punctuation.space_before", {
        p: paragraph,
        start,
        end,
        replacement: match[1],
        comment: `Space before punctuation: ‘${match[0]}’ → ‘${match[1]}’.`,
      }));
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
      out.push(candidateFinding("punctuation.missing_space_after", {
        p: paragraph,
        start,
        end,
        replacement: `${punct} `,
        comment: `Missing space after ‘${punct}’.`,
      }));
    }
    for (const match of paragraph.text.matchAll(/([a-z])\.(?=[A-Z])/g)) {
      const start = match.index + 1;
      const end = start + 1;
      const previous = wordBefore(paragraph.text, start);
      if (previous.length <= 1 || ABBREV.has(previous.toLowerCase())) continue;
      if (!eligible(paragraph, start, end, ctx)) continue;
      out.push(candidateFinding("punctuation.missing_space_after", {
        p: paragraph,
        start,
        end,
        replacement: ". ",
        comment: "Missing space after a full stop.",
      }));
    }
  }
  return out;
}

const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function placeholderSpan(text: string, start: number): boolean {
  for (const match of text.matchAll(/\[[^\]]{0,80}\]/g)) {
    if (match.index <= start && start < match.index + match[0].length) return true;
  }
  return false;
}

function unbalancedFindings(ctx: LaunchContext): ProofFinding[] {
  const out: ProofFinding[] = [];
  for (const paragraph of ctx.source.paragraphs) {
    const stack: { char: string; index: number }[] = [];
    const extras: number[] = [];
    for (let i = 0; i < paragraph.text.length; i++) {
      const ch = paragraph.text[i]!;
      if (placeholderSpan(paragraph.text, i)) continue;
      if (OPEN[ch]) stack.push({ char: ch, index: i });
      else if (CLOSE[ch]) {
        const last = stack.at(-1);
        if (last && OPEN[last.char] === ch) stack.pop();
        else extras.push(i);
      }
    }
    const quotes: number[] = [];
    for (let i = 0; i < paragraph.text.length; i++) {
      if (paragraph.text[i] === '"') quotes.push(i);
    }
    const unmatched = [
      ...stack.map((item) => item.index),
      ...extras,
      ...(quotes.length % 2 === 1 ? [quotes[quotes.length - 1]!] : []),
    ];
    for (const start of unmatched) {
      const end = start + 1;
      if (!eligible(paragraph, start, end, ctx)) continue;
      out.push(candidateFinding("punctuation.unbalanced_pair", {
        p: paragraph,
        start,
        end,
        comment: `This ‘${paragraph.text[start]}’ is unmatched in the paragraph. Proof has not inserted a closing mark.`,
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
