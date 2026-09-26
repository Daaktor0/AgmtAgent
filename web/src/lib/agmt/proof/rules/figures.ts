/**
 * Index-backed date and words-and-figures rules (PEE-13 / PWC-42).
 * Comment-only. Ambiguous numeric dates stay silent.
 */
import { candidateFinding, quoted, explicitEnglish, type LaunchContext } from "../launch-context.ts";
import { paragraphForSpan } from "../launch-context.ts";
import type { LaunchRuleId, ProofFinding } from "../contracts.ts";

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = {
  hundred: 100, thousand: 1_000, lakh: 100_000, crore: 10_000_000, million: 1_000_000, billion: 1_000_000_000,
};
const BOUND = /\b((?:USD|GBP|INR|EUR|Rs\.?|£|\$|€)\s*)?(\d{1,3}(?:,\d{2})+|\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*\(\s*([^)]{1,80}?)\s*\)/gi;
const BOUND_WORDS = /\b((?:USD|GBP|INR|EUR|Rs\.?)\s+)?([a-z][a-z\s-]{1,70}?)\s*\(\s*((?:USD|GBP|INR|EUR|Rs\.?|£|\$|€)\s*)?(\d{1,3}(?:,\d{2})+|\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*\)/gi;

function requireComplete(ctx: LaunchContext): void {
  if (!ctx.indexes) throw new Error("incomplete_figure_scope");
  if (!ctx.source.complete || ctx.indexes.figures.completeness !== "complete") {
    throw new Error("incomplete_figure_scope");
  }
}

function parseNumberWords(raw: string): number | null {
  const cleaned = raw
    .toLowerCase()
    .replace(/[-]/g, " ")
    .replace(/\b(?:and|only|approximately|about|us dollars?|pounds? sterling|rupees?|euros?|dollars?|usd|gbp|inr|eur|rs)\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  let total = 0;
  let current = 0;
  let seen = false;
  for (const token of cleaned.split(" ")) {
    if (ONES[token] != null) {
      current += ONES[token]!;
      seen = true;
      continue;
    }
    if (TENS[token] != null) {
      current += TENS[token]!;
      seen = true;
      continue;
    }
    if (token === "hundred") {
      current = (current || 1) * 100;
      seen = true;
      continue;
    }
    const scale = SCALES[token];
    if (scale && token !== "hundred") {
      total += (current || 1) * scale;
      current = 0;
      seen = true;
      continue;
    }
    return null;
  }
  if (!seen) return null;
  return total + current;
}

function parseFigures(raw: string): number | null {
  const digits = raw.replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(digits)) return null;
  return Number(digits);
}

function currencyOf(text: string): string | null {
  if (/\bINR\b|\bRs\.?\b|\brupees?\b/i.test(text)) return "INR";
  if (/\bGBP\b|£|\bpounds?\b/i.test(text)) return "GBP";
  if (/\bEUR\b|€|\beuros?\b/i.test(text)) return "EUR";
  if (/\bUSD\b|\$|\bdollars?\b/i.test(text)) return "USD";
  return null;
}

export function figureRuleFindings(ctx: LaunchContext, rule: LaunchRuleId): ProofFinding[] {
  requireComplete(ctx);
  const out: ProofFinding[] = [];

  if (rule === "figures.date_invalid") {
    for (const entry of ctx.indexes!.figures.entries) {
      if (entry.kind !== "date" || entry.parse !== "invalid") continue;
      const paragraph = paragraphForSpan(ctx.source, entry.span);
      if (!paragraph || !explicitEnglish(paragraph) || quoted(paragraph.text, entry.span.textStart, entry.span.textEnd)) continue;
      if (paragraph.isTable) continue;
      out.push(candidateFinding(rule, {
        p: paragraph,
        start: entry.span.textStart,
        end: entry.span.textEnd,
        comment: `Review question: “${entry.raw}” is not a valid calendar date. Please correct or confirm the intended date.`,
      }));
    }
    return out;
  }

  if (rule !== "figures.words_figures_mismatch") return out;
  for (const paragraph of ctx.source.paragraphs) {
    if (!explicitEnglish(paragraph) || paragraph.isTable) continue;
    if (/\bto\b|[–—-]/.test(paragraph.text) && /USD|GBP|INR|EUR|Rs\.?|£|\$|€/.test(paragraph.text) && /\d.+\d/.test(paragraph.text)) {
      // Ranges stay silent.
    }
    for (const match of paragraph.text.matchAll(new RegExp(BOUND.source, "gi"))) {
      const start = match.index;
      const end = start + match[0].length;
      if (quoted(paragraph.text, start, end)) continue;
      if (/\b(?:to|between|and)\b|[–—]/.test(match[0])) continue;
      const numeric = parseFigures(`${match[2]}${match[3] ? `.${match[3]}` : ""}`);
      const words = parseNumberWords(match[4]!);
      if (numeric == null || words == null) continue;
      const outerCur = currencyOf(match[1] ?? "");
      const innerCur = currencyOf(match[4]!);
      const currencyClash = outerCur && innerCur && outerCur !== innerCur;
      if (numeric === words && !currencyClash) continue;
      out.push(candidateFinding(rule, {
        p: paragraph,
        start,
        end,
        comment: `Review question: the figures and words in “${match[0]}” do not match. Please confirm the intended amount.`,
      }));
    }
    for (const match of paragraph.text.matchAll(new RegExp(BOUND_WORDS.source, "gi"))) {
      const start = match.index;
      const end = start + match[0].length;
      if (quoted(paragraph.text, start, end)) continue;
      const words = parseNumberWords(`${match[1] ?? ""}${match[2]}`);
      const numeric = parseFigures(`${match[4]}${match[5] ? `.${match[5]}` : ""}`);
      if (numeric == null || words == null) continue;
      const outerCur = currencyOf(`${match[1] ?? ""}${match[2]}`);
      const innerCur = currencyOf(`${match[3] ?? ""}`);
      const currencyClash = outerCur && innerCur && outerCur !== innerCur;
      if (numeric === words && !currencyClash) continue;
      out.push(candidateFinding(rule, {
        p: paragraph,
        start,
        end,
        comment: `Review question: the words and figures in “${match[0]}” do not match. Please confirm the intended amount.`,
      }));
    }
  }
  return out;
}
