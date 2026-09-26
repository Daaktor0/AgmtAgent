import type { ProofSource, SourceParagraph } from "../../source-map.ts";
import { FIGURES_INDEX_VERSION, indexSpan, type FigureEntry, type FiguresIndex } from "./types.ts";

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07", aug: "08",
  sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
};
const NUMERIC_DATE = /\b(\d{1,2})([./\-])(\d{1,2})\2(\d{2,4})\b/g;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const MONTH_DATE = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{4})\b/gi;
const MONTH_FIRST = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\b/gi;
const AMOUNT = /\b(?:USD|GBP|INR|EUR|Rs\.?)\s*[\d,]+(?:\.\d+)?\b|£\s*[\d,]+(?:\.\d+)?|\$\s*[\d,]+(?:\.\d+)?|€\s*[\d,]+(?:\.\d+)?\b/g;
const PERCENT = /\b\d+(?:\.\d+)?\s*%/g;
const DECLARATION = /^\s*(?:(?:Clause|Section|Article)\s+)?(\d+(?:\.\d+)*)(?:[.)](?=\s)|(?=\s))\s+/i;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function calendarValid(yr: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(yr, month - 1, day));
  return date.getUTCFullYear() === yr && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function year(raw: string): string {
  if (raw.length === 4) return raw;
  const n = Number(raw);
  return String(n >= 70 ? 1900 + n : 2000 + n);
}

function occupied(ranges: { start: number; end: number }[], start: number, end: number): boolean {
  return ranges.some((range) => range.start < end && start < range.end);
}

function push(
  entries: FigureEntry[],
  ranges: { start: number; end: number }[],
  paragraph: SourceParagraph,
  start: number,
  end: number,
  kind: FigureEntry["kind"],
  parse: FigureEntry["parse"],
  canonical: string | null,
): void {
  if (occupied(ranges, start, end)) return;
  const declaration = paragraph.text.match(DECLARATION);
  if (declaration && start < declaration[0].length) return;
  const span = indexSpan(paragraph, start, end);
  if (!span) return;
  ranges.push({ start, end });
  entries.push({ kind, raw: span.exactQuote, parse, canonical, span });
}

function numericDate(first: number, second: number, yr: string): { parse: FigureEntry["parse"]; canonical: string | null } {
  if (first > 31 || second > 31 || first === 0 || second === 0) return { parse: "invalid", canonical: null };
  if (first > 12 && second <= 12) return { parse: "parsed", canonical: `${year(yr)}-${pad(second)}-${pad(first)}` };
  if (second > 12 && first <= 12) return { parse: "parsed", canonical: `${year(yr)}-${pad(first)}-${pad(second)}` };
  if (first > 12 && second > 12) return { parse: "invalid", canonical: null };
  return { parse: "ambiguous", canonical: null };
}

function amountCanonical(raw: string): string | null {
  const currency = raw.includes("£") || /\bGBP\b/i.test(raw) ? "GBP"
    : raw.includes("$") || /\bUSD\b/i.test(raw) ? "USD"
      : raw.includes("€") || /\bEUR\b/i.test(raw) ? "EUR"
        : /\bINR\b|Rs\.?/i.test(raw) ? "INR"
          : null;
  const digits = raw.replace(/[^\d.]/g, "");
  if (!digits || !currency) return null;
  return `${currency}:${digits}`;
}

export function buildFiguresIndex(source: ProofSource): FiguresIndex {
  const entries: FigureEntry[] = [];
  for (const paragraph of source.paragraphs) {
    const ranges: { start: number; end: number }[] = [];
    for (const match of paragraph.text.matchAll(new RegExp(ISO_DATE.source, "g"))) {
      const month = Number(match[2]);
      const day = Number(match[3]);
      const yr = Number(match[1]);
      const parse = calendarValid(yr, month, day) ? "parsed" as const : "invalid" as const;
      push(entries, ranges, paragraph, match.index, match.index + match[0].length, "date", parse, parse === "parsed" ? `${match[1]}-${match[2]}-${match[3]}` : null);
    }
    for (const match of paragraph.text.matchAll(new RegExp(MONTH_DATE.source, "gi"))) {
      const month = MONTHS[match[2]!.toLowerCase()];
      const day = Number(match[1]);
      const yr = Number(match[3]);
      const parse = month && calendarValid(yr, Number(month), day) ? "parsed" as const : "invalid" as const;
      push(entries, ranges, paragraph, match.index, match.index + match[0].length, "date", parse, parse === "parsed" ? `${match[3]}-${month}-${pad(day)}` : null);
    }
    for (const match of paragraph.text.matchAll(new RegExp(MONTH_FIRST.source, "gi"))) {
      const month = MONTHS[match[1]!.toLowerCase()];
      const day = Number(match[2]);
      const yr = Number(match[3]);
      const parse = month && calendarValid(yr, Number(month), day) ? "parsed" as const : "invalid" as const;
      push(entries, ranges, paragraph, match.index, match.index + match[0].length, "date", parse, parse === "parsed" ? `${match[3]}-${month}-${pad(day)}` : null);
    }
    for (const match of paragraph.text.matchAll(new RegExp(NUMERIC_DATE.source, "g"))) {
      const result = numericDate(Number(match[1]), Number(match[3]), match[4]!);
      push(entries, ranges, paragraph, match.index, match.index + match[0].length, "date", result.parse, result.canonical);
    }
    for (const match of paragraph.text.matchAll(new RegExp(AMOUNT.source, "g"))) {
      push(entries, ranges, paragraph, match.index, match.index + match[0].length, "amount", "parsed", amountCanonical(match[0]));
    }
    for (const match of paragraph.text.matchAll(new RegExp(PERCENT.source, "g"))) {
      const value = match[0].replace(/\s|%/g, "");
      push(entries, ranges, paragraph, match.index, match.index + match[0].length, "percentage", "parsed", `${value}%`);
    }
  }
  return {
    version: FIGURES_INDEX_VERSION,
    completeness: source.complete ? "complete" : "incomplete",
    gaps: source.complete ? [] : ["incomplete_source"],
    entries,
  };
}
