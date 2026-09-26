/**
 * Reads the fields printed on an Indian e-stamp certificate (the SHCIL
 * layout: "Certificate No.", "Purchased by", "First Party", ...) from page
 * text, whether it came from a PDF text layer or from OCR. Physical
 * non-judicial stamp paper has none of these fields and still counts as
 * stamp paper; it simply yields no details.
 */

export type EStamp = {
  certificateNo: string | null;
  issuedDate: string | null;
  purchasedBy: string | null;
  firstParty: string | null;
  secondParty: string | null;
  paidBy: string | null;
  amount: string | null;
  description: string | null;
};

const STAMP_CUES = /(e[\s-]?stamp|non[\s-]?judicial|stamp\s+duty|certificate\s+no|stock\s+holding\s+corporation)/i;

export function looksLikeStampPaper(text: string): boolean {
  return STAMP_CUES.test(text);
}

const FIELDS: [keyof EStamp, RegExp][] = [
  ["certificateNo", /certificate\s*no\.?/i],
  ["issuedDate", /certificate\s*issued\s*date/i],
  ["purchasedBy", /purchased\s*by/i],
  ["firstParty", /first\s*party/i],
  ["secondParty", /second\s*party/i],
  ["paidBy", /stamp\s*duty\s*paid\s*by/i],
  ["amount", /stamp\s*duty\s*amount(?:\s*\(\s*rs\.?\s*\))?/i],
  ["description", /description\s*of\s*document/i],
];

function clean(value: string): string | null {
  const v = value.replace(/^[\s:;.\-–|]+/, "").replace(/\s+/g, " ").trim();
  return v.length >= 2 && v.length <= 160 ? v : null;
}

export function readEStamp(text: string): EStamp | null {
  const out: EStamp = {
    certificateNo: null,
    issuedDate: null,
    purchasedBy: null,
    firstParty: null,
    secondParty: null,
    paidBy: null,
    amount: null,
    description: null,
  };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    for (const [key, label] of FIELDS) {
      if (out[key]) continue;
      const m = line.match(label);
      if (!m || m.index === undefined) continue;
      // "Stamp Duty Paid By" also contains "paid by"; "Purchased by" never
      // collides. Take the text after the label on the same line.
      const rest = line.slice(m.index + m[0].length);
      const value = clean(rest.includes(":") ? rest.slice(rest.indexOf(":") + 1) : rest);
      if (value) out[key] = value;
    }
  }
  const cert = text.match(/\bIN-[A-Z]{2}\d{6,}[A-Z0-9]*\b/);
  if (cert) out.certificateNo = cert[0];
  else if (out.certificateNo) out.certificateNo = out.certificateNo.split(/\s+/)[0] ?? null;
  if (out.amount) {
    const digits = out.amount.match(/[\d,]+(?:\.\d+)?/);
    out.amount = digits ? digits[0].replace(/,/g, "") : out.amount;
  }
  const found = Object.values(out).some(Boolean);
  return found ? out : null;
}

/** Every name printed on the certificate, for matching against a party. */
export function stampNames(stamp: EStamp): string[] {
  return [stamp.purchasedBy, stamp.firstParty, stamp.secondParty, stamp.paidBy].filter((v): v is string => Boolean(v));
}
