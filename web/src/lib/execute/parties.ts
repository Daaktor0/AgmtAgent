/**
 * Who signs an agreement that has no signature pages: read from its parties
 * clause ("BY AND AMONG: 1. X ... of the FIRST PART; AND ...") and, where a
 * party is a list kept elsewhere ("the persons listed in Part A of Schedule
 * 1"), from the name column of that schedule's table. Deterministic text
 * rules; everything found is shown to the lawyer to confirm before any page
 * is made.
 */
import { displayName, layoutSegments, type TextItem } from "./detect.ts";

export type PartyKind = "company" | "llp" | "trust" | "huf" | "individual";

export type ScheduleRef = {
  /** "Schedule", "Annexure", "Annex" or "Appendix", as the agreement spells it. */
  word: string;
  number: string;
  part: string | null;
};

export type ClauseEntry =
  | { type: "named"; name: string; term: string | null }
  | { type: "group"; term: string | null; ref: ScheduleRef };

export type PartiesClause = { entries: ClauseEntry[]; pageIndex: number };

const START = /\b(?:by\s+and\s+(?:between|among(?:st)?)|between|among(?:st)?)\b\s*:?/gi;
const END =
  /\b(?:WHEREAS|RECITALS|BACKGROUND|PREAMBLE|NOW,?\s+THEREFORE|NOW\s+THIS\s+(?:AGREEMENT|DEED)|IT\s+IS\s+(?:HEREBY\s+)?AGREED|(?:the\s+)?[A-Z][\w'’ ]{0,60}?(?:are|shall\s+be)\s+(?:hereinafter\s+)?(?:collectively|jointly)\s+referred)/;
const PART_END = /\bof\s+the\s+[A-Z]+\s+PART\b[;.,]?/gi;
const HONORIFIC = /^(?:mr|mrs|ms|miss|dr|shri|smt|sri|kumari|km|m\/s)\.?\s+/i;
const REF =
  /\b(?:listed|set\s+out|named|mentioned|specified|described|whose\s+names?[^.]{0,80}?(?:are|is)\s+(?:set\s+out|listed|mentioned))\s+(?:in|under|at)\s+(?:(?:Part|Section)\s+([A-Z0-9]{1,3})\s+of\s+)?(?:the\s+)?(Schedule|Annexure|Annex|Appendix)\s+([0-9]{1,2}|[IVXLC]{1,5}|[A-Z])\b/i;
const GROUP_LEAD = /^(?:(?:all|each|every)\s+(?:of\s+)?)?(?:the\s+)?(?:persons?|entities|entity|parties|investors?|shareholders?|individuals?|several|various|following)\b/i;
const ENTITY =
  /\b(?:private\s+limited|pvt\.?\s*ltd\.?|limited|ltd\.?|llp|l\.l\.p\.|fund|trust|inc\.?|llc|l\.p\.|capital|ventures|partners|holdings|corporation|corp\.?|bank|investments?|huf|scheme|aif|society)\b/i;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function quotedTerm(text: string): string | null {
  const m = text.match(/referred\s+to\s+as\s+(?:the\s+|an?\s+)?["“'‘]([^"”'’]{1,60})["”'’]/i);
  return m ? squash(m[1]) : null;
}

/** "MR. VIKRAM MEHTA, son of ..." -> "Vikram Mehta". */
function nameFrom(entry: string): string | null {
  let s = entry.replace(/^\s*(?:AND\s+)?(?:\(?[0-9]{1,2}[.)]|\(?[a-z][.)]|\(?[ivx]{1,4}[.)])\s*/i, "");
  s = s.split(/,|\(|\bhaving\s+(?:its|his|her)\b|\bson\s+of\b|\bdaughter\s+of\b|\bwife\s+of\b|\baged\b|\bresiding\b|\ba\s+company\b|\ba\s+limited\s+liability\b|\bincorporated\b/i)[0];
  s = squash(s).replace(HONORIFIC, "").replace(/[;:.,\s]+$/, "");
  if (s.length < 2 || s.length > 120 || !/[A-Za-z]{2}/.test(s)) return null;
  if (/^(?:the\s+)?(?:parties|party|company|promoters?|investors?)$/i.test(s)) return null;
  return displayName(s);
}

function refFrom(match: RegExpMatchArray): ScheduleRef {
  return { part: match[1] ? match[1].toUpperCase() : null, word: match[2][0].toUpperCase() + match[2].slice(1).toLowerCase(), number: match[3].toUpperCase() };
}

function parseEntry(raw: string): ClauseEntry | null {
  const entry = squash(raw.replace(/^\s*(?:;|AND\b)\s*/g, ""));
  if (entry.length < 3) return null;
  const lead = entry.replace(/^\s*(?:\(?[0-9]{1,2}[.)]|\(?[a-z][.)])\s*/i, "");
  const ref = lead.slice(0, 300).match(REF);
  if (ref) {
    const before = lead.slice(0, ref.index);
    if (GROUP_LEAD.test(lead) || !ENTITY.test(before)) return { type: "group", term: quotedTerm(entry), ref: refFrom(ref) };
  }
  const name = nameFrom(entry);
  return name ? { type: "named", name, term: quotedTerm(entry) } : null;
}

function splitEntries(block: string): string[] {
  const byPart = block.split(PART_END).map(squash).filter(Boolean);
  if (byPart.length >= 2) return byPart;
  // No "of the FIRST PART": split on a standalone capital AND, or on numbering.
  const byAnd = block.split(/\n\s*AND\s*\n|;\s*AND\b|\s+AND\s+(?=\(?\d{1,2}[.)]\s)/).map(squash).filter(Boolean);
  if (byAnd.length >= 2) return byAnd;
  return block.split(/(?:^|\s)(?=\(?\d{1,2}[.)]\s+[A-Z])/).map(squash).filter(Boolean);
}

/**
 * The parties, in the order the agreement lists them. The cover page often
 * lists them too; the clause with the most (and best defined) entries wins.
 */
export function readPartiesClause(pageTexts: string[], maxPages = 5): PartiesClause | null {
  let best: { entries: ClauseEntry[]; pageIndex: number; score: number } | null = null;
  for (let p = 0; p < Math.min(pageTexts.length, maxPages); p += 1) {
    const text = [pageTexts[p], pageTexts[p + 1] ?? ""].join("\n");
    for (const start of text.matchAll(START)) {
      if ((start.index ?? 0) >= pageTexts[p].length) break;
      const from = (start.index ?? 0) + start[0].length;
      const rest = text.slice(from, from + 8000);
      const end = rest.search(END);
      const block = end > 0 ? rest.slice(0, end) : rest.slice(0, 4000);
      const entries = splitEntries(block).map(parseEntry).filter((e): e is ClauseEntry => e !== null);
      if (entries.length < 2) continue;
      const score = entries.length + entries.filter((e) => e.term).length * 0.5 + entries.filter((e) => e.type === "group").length;
      if (!best || score >= best.score) best = { entries, pageIndex: p, score };
    }
  }
  return best ? { entries: best.entries, pageIndex: best.pageIndex } : null;
}

export function refLabel(ref: ScheduleRef): string {
  return `${ref.part ? `Part ${ref.part} of ` : ""}${ref.word} ${ref.number}`;
}

function headingFor(ref: ScheduleRef, number = ref.number): RegExp {
  return new RegExp(`^\\s*${ref.word}\\s*[-–—]?\\s*${number}\\b(?:\\s*[-–—:.]\\s*.*)?$`, "i");
}

/** The page on which a schedule starts: its heading on a line of its own, not a contents list. */
export function scheduleStart(pageTexts: string[], ref: ScheduleRef, after = 0): number | null {
  const heading = headingFor(ref);
  const anyHeading = new RegExp(`^\\s*${ref.word}\\s*[-–—]?\\s*[0-9IVXLC]{1,5}\\b`, "i");
  let found: number | null = null;
  pageTexts.forEach((text, p) => {
    if (p <= after) return;
    const lines = text.split("\n");
    if (/table\s+of\s+contents|^\s*contents\s*$/im.test(text)) return;
    if (lines.filter((l) => anyHeading.test(l)).length >= 3) return; // a list of schedules
    if (lines.some((l) => l.length < 90 && heading.test(l))) found = p;
  });
  return found;
}

type Row = { y: number; items: TextItem[]; text: string };

function rowsOf(items: TextItem[]): Row[] {
  const usable = items.filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const item of usable) {
    const row = rows[rows.length - 1];
    const tolerance = Math.max(2, (item.height || 10) * 0.5);
    if (row && Math.abs(row.y - item.y) <= tolerance) row.items.push(item);
    else rows.push({ y: item.y, items: [item], text: "" });
  }
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    row.text = layoutSegments(row.items).map((s) => s.text).join("  ");
  }
  return rows;
}

const SERIAL = /^\(?\d{1,3}[.)]?$/;
const NAME_HEADER = /\bname\b/i;

function cleanCell(text: string): string {
  let s = squash(text).replace(/^[\s,;:.–-]+|[\s,;:–-]+$/g, "");
  s = s.replace(HONORIFIC, "");
  return displayName(s);
}

/**
 * Names from the table of a schedule (or one Part of it). Uses the column
 * headed "Name ..." when there is one, else the first column that isn't a
 * serial number. A name wrapped onto a second line joins the line above.
 */
export function namesFromSchedule(pages: TextItem[][], pageTexts: string[], ref: ScheduleRef, after = 0): string[] {
  const start = scheduleStart(pageTexts, ref, after);
  if (start === null) return [];
  const nextSchedule = new RegExp(`^\\s*${ref.word}\\s*[-–—]?\\s*(?!${ref.number}\\b)[0-9IVXLC]{1,5}\\b`, "i");
  const partStart = ref.part ? new RegExp(`^\\s*(?:Part|Section)\\s+${ref.part}\\b`, "i") : null;
  const otherPart = new RegExp(`^\\s*(?:Part|Section)\\s+(?!${ref.part ?? "@"}\\b)[A-Z0-9]{1,3}\\b`, "i");

  const rows: Row[] = [];
  let inPart = !partStart;
  let done = false;
  for (let p = start; p < pages.length && !done; p += 1) {
    for (const row of rowsOf(pages[p])) {
      if (p > start && nextSchedule.test(row.text)) {
        done = true;
        break;
      }
      if (partStart?.test(row.text)) {
        inPart = true;
        continue;
      }
      if (inPart && ref.part && otherPart.test(row.text)) {
        done = true;
        break;
      }
      if (inPart) rows.push(row);
    }
  }

  const headerAt = rows.findIndex((r) => r.items.some((i) => NAME_HEADER.test(i.str)) && r.items.length >= 2);
  const body = headerAt >= 0 ? rows.slice(headerAt + 1) : rows;
  let left = -Infinity;
  let right = Infinity;
  if (headerAt >= 0) {
    const header = rows[headerAt].items;
    const k = header.findIndex((i) => NAME_HEADER.test(i.str));
    left = header[k].x - 6;
    right = header[k + 1] ? header[k + 1].x - 2 : Infinity;
  }

  const names: string[] = [];
  let lastY = Infinity;
  let lastHeight = 10;
  for (const row of body) {
    if (/^\s*total\b/i.test(row.text) || headingFor(ref).test(row.text)) continue;
    const serial = row.items.find((i) => SERIAL.test(i.str.trim()) && i.x < left + 6);
    let cell: string;
    if (headerAt >= 0) {
      cell = row.items.filter((i) => i.x >= left && i.x < right && !SERIAL.test(i.str.trim())).map((i) => i.str).join(" ");
    } else {
      const segments = layoutSegments(row.items).filter((s) => !SERIAL.test(s.text));
      cell = segments[0]?.text ?? "";
    }
    const text = squash(cell);
    if (!text) continue;
    const close = lastY - row.y < lastHeight * 1.6;
    const continuation = names.length > 0 && !serial && close && headerAt >= 0;
    if (continuation) names[names.length - 1] = `${names[names.length - 1]} ${text}`;
    else names.push(text);
    lastY = row.y;
    lastHeight = row.items[0]?.height || 10;
  }
  return names.map(cleanCell).filter((n) => n.length >= 2 && !NAME_HEADER.test(n));
}

/** What kind of party a name is, for choosing its signature block. */
export function partyKind(name: string): PartyKind {
  if (/\bhuf\b|hindu\s+undivided/i.test(name)) return "huf";
  if (/\bllp\b|l\.l\.p\.|limited\s+liability\s+partnership/i.test(name)) return "llp";
  if (/\btrust\b|\bfund\b|\bscheme\b|\baif\b|\btrustee/i.test(name)) return "trust";
  if (ENTITY.test(name)) return "company";
  return "individual";
}

/** The agreement's name from its cover: "SHAREHOLDERS' AGREEMENT" -> "Shareholders' Agreement". */
export function agreementName(pageTexts: string[], fallback: string): string {
  for (const text of pageTexts.slice(0, 2)) {
    for (const line of text.split("\n")) {
      const l = squash(line);
      const letters = l.replace(/[^A-Za-z]/g, "");
      if (l.length < 6 || l.length > 90 || letters !== letters.toUpperCase()) continue;
      if (/\b(AGREEMENT|DEED|CONTRACT|ADDENDUM|AMENDMENT|UNDERTAKING|MEMORANDUM)\b/.test(l) && !/\bDATED\b|\bBETWEEN\b|\bAMONG\b/.test(l)) {
        return displayName(l);
      }
    }
  }
  return fallback;
}

/**
 * The footer for generated signature pages. Never a date: execution dates
 * move, and a dated footer would mean printing the pages again.
 */
export function signatureFooter(agreement: string, parties: { name: string; group?: { term: string | null; ref: ScheduleRef } }[]): string {
  const names = parties.map((p) =>
    p.group ? (p.group.term ? `the ${p.group.term} (as defined therein)` : `the persons listed in ${refLabel(p.group.ref)} thereto`) : p.name,
  );
  const list = names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const article = /^the\s/i.test(agreement) ? "" : "the ";
  if (!names.length) return `This signature page forms an integral part of ${article}${agreement}.`;
  return `This signature page forms an integral part of ${article}${agreement} executed by and ${names.length === 2 ? "between" : "among"} ${list}.`;
}
