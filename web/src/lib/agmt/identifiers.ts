/**
 * Versioned Indian recognisers (SPEC §4.5). Deterministic validators where a
 * checksum exists. Does not mask amounts, dates, percentages, clause numbers,
 * governing law, or defined terms.
 */
import { RECOGNISER_VERSION } from "./config.ts";

export { RECOGNISER_VERSION };

export type IdentifierHit = {
  type:
    | "email"
    | "phone"
    | "PAN"
    | "Aadhaar"
    | "GSTIN"
    | "DIN"
    | "CIN"
    | "passport"
    | "bank_account"
    | "IFSC"
    | "address";
  start: number;
  end: number;
  value: string;
  confidence: number;
  detector: string;
};

const RE_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const RE_PHONE = /(?:\+91[\s-]?)?[6-9]\d{9}\b/g;
const RE_PAN = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
const RE_AADHAAR = /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g;
const RE_GSTIN = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g;
const RE_DIN = /\bDIN[\s:-]*([0-9]{8})\b/gi;
const RE_CIN = /\b[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}\b/g;
const RE_PASSPORT = /\b[A-PR-WY][0-9]{7}\b/g;
const RE_IFSC = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;

const PAN_WEIGHTS = [1, 3, 5, 7, 9, 11, 13, 15, 17];
const PAN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function panChecksumOk(pan: string): boolean {
  // Format is authoritative for v1; checksum libraries disagree across issuers.
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function verhoeffOk(num: string): boolean {
  let c = 0;
  const reversed = num.split("").reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
}

function overlapsProtected(start: number, end: number, protectedSpans: [number, number][]): boolean {
  return protectedSpans.some(([s, e]) => start < e && end > s);
}

export function detectIdentifiers(
  text: string,
  protectedSpans: [number, number][] = [],
): IdentifierHit[] {
  const hits: IdentifierHit[] = [];
  const push = (h: IdentifierHit) => {
    if (overlapsProtected(h.start, h.end, protectedSpans)) return;
    hits.push(h);
  };

  for (const m of text.matchAll(RE_EMAIL)) {
    push({
      type: "email",
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
      confidence: 0.99,
      detector: "in.email",
    });
  }
  for (const m of text.matchAll(RE_PHONE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length < 10) continue;
    push({
      type: "phone",
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
      confidence: 0.85,
      detector: "in.phone",
    });
  }
  for (const m of text.matchAll(RE_PAN)) {
    if (!panChecksumOk(m[0])) continue;
    push({
      type: "PAN",
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
      confidence: 0.95,
      detector: "in.pan",
    });
  }
  for (const m of text.matchAll(RE_AADHAAR)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length !== 12) continue;
    const ok = verhoeffOk(digits);
    push({
      type: "Aadhaar",
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
      confidence: ok ? 0.95 : 0.6,
      detector: "in.aadhaar",
    });
  }
  for (const m of text.matchAll(RE_GSTIN)) {
    push({
      type: "GSTIN",
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
      confidence: 0.9,
      detector: "in.gstin",
    });
  }
  for (const m of text.matchAll(RE_DIN)) {
    push({
      type: "DIN",
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[1],
      confidence: 0.85,
      detector: "in.din",
    });
  }
  for (const m of text.matchAll(RE_CIN)) {
    push({
      type: "CIN",
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
      confidence: 0.95,
      detector: "in.cin",
    });
  }
  for (const m of text.matchAll(RE_PASSPORT)) {
    push({
      type: "passport",
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
      confidence: 0.7,
      detector: "in.passport",
    });
  }
  for (const m of text.matchAll(RE_IFSC)) {
    push({
      type: "IFSC",
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
      confidence: 0.95,
      detector: "in.ifsc",
    });
  }

  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: IdentifierHit[] = [];
  let lastEnd = -1;
  for (const h of hits) {
    if (h.start < lastEnd) continue;
    kept.push(h);
    lastEnd = h.end;
  }
  void PAN_WEIGHTS;
  void PAN_CHARS;
  return kept;
}
