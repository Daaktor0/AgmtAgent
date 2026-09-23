/**
 * Signature-page detection and party-name suggestion. Deterministic text
 * heuristics over the words pdf.js extracts from each page. Nothing here is
 * final: every suggestion is shown to the lawyer, who confirms or edits it.
 */

/** One run of text as pdf.js places it on the page (PDF units, y grows upwards). */
export type TextItem = { str: string; x: number; y: number; width: number; height: number };

/**
 * Rebuild readable segments from positioned text. Items on the same baseline
 * join into one line, but a wide horizontal gap starts a new segment, so two
 * signature blocks printed side by side stay apart instead of merging into
 * one sentence.
 */
export type Segment = { text: string; x: number };

export function groupSegments(items: TextItem[]): string[] {
  return layoutSegments(items).map((s) => s.text);
}

/** As {@link groupSegments}, keeping where each segment starts horizontally. */
export function layoutSegments(items: TextItem[]): Segment[] {
  const usable = items.filter((i) => i.str.trim() !== "");
  if (usable.length === 0) return [];

  const sorted = [...usable].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    const tolerance = Math.max(2, (item.height || 10) * 0.5);
    if (row && Math.abs(row[0].y - item.y) <= tolerance) row.push(item);
    else rows.push([item]);
  }

  const segments: Segment[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let current = "";
    let start = 0;
    let lastEnd = Number.NEGATIVE_INFINITY;
    const flush = () => {
      const text = current.replace(/\s+/g, " ").trim();
      if (text) segments.push({ text, x: start });
      current = "";
    };
    for (const item of row) {
      const gap = item.x - lastEnd;
      const columnBreak = (item.height || 10) * 3;
      if (current && gap > columnBreak) flush();
      if (!current) start = item.x;
      const joiner = current && gap > 0.5 && !current.endsWith(" ") && !item.str.startsWith(" ") ? " " : "";
      current += joiner + item.str;
      lastEnd = item.x + item.width;
    }
    flush();
  }
  return segments;
}

const STRONG = [
  /signature page/i,
  /in witness whereof/i,
  /for and on behalf of/i,
  /signed(?:,? sealed)? and delivered/i,
];
const MEDIUM = [/\bsigned by\b/i, /authori[sz]ed signatory/i, /\bexecuted by\b/i];
const WEAK = [/^name\s*:/i, /^designation\s*:/i, /^title\s*:/i, /\bsignature\b/i, /\bwitness(?:es)?\b/i, /^by\s*:/i];

/** A score, not a verdict. Signature pages are sparse and full of signing words. */
export function scoreSignaturePage(segments: string[]): number {
  const text = segments.join("\n");
  let score = 0;
  for (const re of STRONG) if (re.test(text)) score += 3;
  for (const re of MEDIUM) if (re.test(text)) score += 2;
  for (const re of WEAK) if (segments.some((s) => re.test(s))) score += 1;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 350) score -= 3;
  return score;
}

export const SIGNATURE_THRESHOLD = 5;

export function isLikelySignaturePage(segments: string[]): boolean {
  return scoreSignaturePage(segments) >= SIGNATURE_THRESHOLD;
}

const ROLE_WORDS = new Set([
  "company", "promoter", "promoters", "founder", "founders", "investor", "investors",
  "party", "parties", "purchaser", "purchasers", "seller", "sellers", "vendor", "buyer",
  "lender", "borrower", "guarantor", "shareholder", "shareholders", "subscriber",
  "subscribers", "acquirer", "existing", "new", "the", "said", "above", "within",
  "named", "withinnamed", "within-named", "hereinabove", "mentioned", "first", "second",
  "third", "fourth", "fifth", "and", "of", "by", "its", "their",
]);

const LABEL = /^(name|designation|title|signature|date|place|witness(es)?|by|in the presence of|authori[sz]ed signatory)\b/i;
const ENTITY =
  /\b(private limited|pvt\.? ltd\.?|limited|ltd\.?|llp|l\.l\.p\.|fund|trust|inc\.?|llc|capital|ventures|partners|holdings|corporation|corp\.?|bank|investments?)\b/i;

/** "the within named Company" and friends carry no name of their own. */
function isGeneric(text: string): boolean {
  const words = text.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/\s+/).filter(Boolean);
  return words.length === 0 || words.every((w) => ROLE_WORDS.has(w) || /^\d+$/.test(w));
}

function clean(raw: string): string {
  let s = raw.replace(/_{2,}|\.{3,}/g, " ").replace(/\s+/g, " ").trim();
  // "the within named Investor, BANYAN CAPITAL" -> "BANYAN CAPITAL"
  s = s.replace(/^(?:the\s+)?(?:within[- ]?named|above[- ]?named|said)\s+[a-z ]*?(?:,|:)\s*/i, "");
  s = s.replace(/^(?:the\s+)?(?:within[- ]?named|above[- ]?named)\s+/i, "");
  s = s.replace(/^m\/s\.?\s*/i, "");
  s = s.replace(/\s*\((?:the\s+)?["“'][^)]*\)\s*/g, " ");
  s = s.replace(/[,;]?\s*(?:through|acting through|represented by|by its|by the hand of)\b.*$/i, "");
  s = s.replace(/^[\s,:;.-]+|[\s,:;-]+$/g, "");
  return s.trim();
}

const LEAD =
  /^(?:.*?\b)?(?:signed(?:,? sealed)?(?: and delivered)?(?: for and on behalf of| by)?|executed by|for and on behalf of|on behalf of)\b[\s,:]*(.*)$/i;

const KEEP_UPPER = new Set(["LLP", "LLC", "LP", "HUF", "AIF", "NBFC", "PLC", "USA", "UK", "UAE"]);

/**
 * Signature blocks usually print names in capitals. File names read better
 * in title case, so "BANYAN CAPITAL FUND I" becomes "Banyan Capital Fund I";
 * abbreviations, roman numerals and vowel-less initialisms stay as they are.
 * Mixed-case names are left alone.
 */
export function displayName(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2 || letters !== letters.toUpperCase()) return name;
  return name
    .split(/(\s+|-|\/|\()/)
    .map((part) => {
      const word = part.replace(/[^A-Za-z]/g, "");
      if (!word) return part;
      if (KEEP_UPPER.has(word) || /^[IVX]+$/.test(word) || !/[AEIOUY]/.test(word)) return part;
      if (/^(OF|AND|THE|FOR)$/.test(word) && part === word) return part.toLowerCase();
      return part.charAt(0) + part.slice(1).toLowerCase();
    })
    .join("")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Suggest the names of the parties who sign on this page, in page order.
 * Reads the text after "for and on behalf of" / "signed and delivered by",
 * falling back to the next line when that text is only a role ("the within
 * named Company"), and to capitalised entity names ("... PRIVATE LIMITED").
 */
export function suggestPartyNames(input: (string | Segment)[]): string[] {
  const laid = input.map((s) => (typeof s === "string" ? { text: s, x: 0 } : s));
  const segments = laid.map((s) => s.text);
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    const n = displayName(clean(name));
    const key = n.toLowerCase();
    if (!n || n.length > 120 || LABEL.test(n) || isGeneric(n) || seen.has(key)) return;
    if (/in witness whereof/i.test(n)) return;
    seen.add(key);
    found.push(n);
  };

  const consumed = new Set<number>();
  segments.forEach((seg, i) => {
    if (/in witness whereof/i.test(seg)) return;
    const m = seg.match(LEAD);
    if (!m) return;
    const rest = clean(m[1] ?? "");
    if (rest && !isGeneric(rest)) {
      add(rest);
      return;
    }
    // The name is on the following line(s) of the same column: skip labels
    // and role words. Blocks printed side by side interleave row by row, so
    // only segments starting near this one's left edge count.
    const column = laid.slice(i + 1).map((s, k) => ({ ...s, j: i + 1 + k })).filter((s) => Math.abs(s.x - laid[i].x) < 40);
    for (const { text: next, j } of column.slice(0, 3)) {
      if (LABEL.test(next) || isGeneric(clean(next))) continue;
      if (LEAD.test(next)) break;
      add(next);
      consumed.add(j);
      break;
    }
  });

  segments.forEach((seg, i) => {
    if (consumed.has(i) || LEAD.test(seg) || LABEL.test(seg)) return;
    const letters = seg.replace(/[^A-Za-z]/g, "");
    const mostlyCaps = letters.length >= 4 && letters === letters.toUpperCase();
    if (mostlyCaps && ENTITY.test(seg)) add(seg);
  });

  return found;
}
