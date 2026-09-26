/**
 * Signature pages made by Agmt, one per party, for an agreement that has
 * none of its own. Two ways:
 *
 *  - a plain format: the wording of a signature block with "[Party]" where
 *    the name goes, laid out on a page the size of the agreement's, with an
 *    optional footer naming the agreement (never a date);
 *  - the lawyer's own PDF template: their page, copied exactly, with only
 *    the sample party name replaced, in the same place, size and style.
 *
 * No Agmt name or mark is put on any page. Runs the same in the browser and
 * in Node (pdf-lib only), never touching the network.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { layoutSegments, suggestPartyNames, type TextItem } from "./detect.ts";
import { removeTextAt } from "./pdf-content.ts";
import type { PartyKind } from "./parties.ts";

export const PARTY_PLACEHOLDER = "[Party]";

export type PlainFormat = { id: string; label: string; body: string };

/** Starting formats in the usual Indian form. The lawyer edits them freely. */
export const PRESET_FORMATS: Record<PartyKind, PlainFormat> = {
  company: {
    id: "company",
    label: "Company",
    body: "SIGNED AND DELIVERED for and on behalf of\n[Party]\nthrough its authorised signatory\n\n______________________________\nName:\nDesignation:",
  },
  individual: {
    id: "individual",
    label: "Individual",
    body: "SIGNED AND DELIVERED by\n[Party]\n\n______________________________",
  },
  llp: {
    id: "llp",
    label: "LLP",
    body: "SIGNED AND DELIVERED for and on behalf of\n[Party]\nthrough its designated partner\n\n______________________________\nName:\nDesignation:",
  },
  trust: {
    id: "trust",
    label: "Trust or fund",
    body: "SIGNED AND DELIVERED for and on behalf of\n[Party]\nacting through its trustee / investment manager\n\n______________________________\nName:\nDesignation:",
  },
  huf: {
    id: "huf",
    label: "HUF",
    body: "SIGNED AND DELIVERED for and on behalf of\n[Party]\nthrough its Karta\n\n______________________________\nName:",
  },
};

export type FontStyle = { family: "serif" | "sans" | "mono"; bold: boolean; italic: boolean };

/** Where a template's sample name sits, and how it is set. */
export type NameSlot = {
  x: number;
  y: number;
  width: number;
  size: number;
  style: FontStyle;
  align: "left" | "center" | "right";
  upper: boolean;
  /** Free space around the name: the bottom of the line above and the top of the line below. */
  above?: number;
  below?: number;
};

export type TemplateSpec = {
  bytes: Uint8Array;
  pageIndex: number;
  sample: string;
  slots: NameSlot[];
  /** The template page's text, for matching returns. */
  text: string;
};

export type Sheet = { name: string } & ({ kind: "plain"; body: string } | { kind: "template"; template: TemplateSpec });

/** A text run with what the renderer knows of its font. */
export type StyledItem = TextItem & { style: FontStyle };

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const INK = rgb(0.08, 0.08, 0.1);

/** pdf.js font facts -> the nearest standard face. */
export function fontStyle(font: { name?: string | null; bold?: boolean; italic?: boolean } | null, family?: string): FontStyle {
  const name = font?.name ?? "";
  const byName = /courier|mono|consolas/i.test(name)
    ? "mono"
    : /arial|helvetica|calibri|verdana|tahoma|segoe|gill|franklin|trebuchet|century\s*gothic|sans/i.test(name)
      ? "sans"
      : /times|georgia|garamond|cambria|antiqua|palatino|bookman|serif|roman/i.test(name)
        ? "serif"
        : null;
  const fam = byName ?? (family === "sans-serif" ? "sans" : family === "monospace" ? "mono" : "serif");
  return {
    family: fam,
    bold: Boolean(font?.bold) || /bold|black|heavy|semibold|demi/i.test(name),
    italic: Boolean(font?.italic) || /italic|oblique/i.test(name),
  };
}

const FACES: Record<FontStyle["family"], [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

class Faces {
  private cache = new Map<string, PDFFont>();
  private doc: PDFDocument;
  constructor(doc: PDFDocument) {
    this.doc = doc;
  }
  async get(style: FontStyle): Promise<PDFFont> {
    const face = FACES[style.family][(style.bold ? 1 : 0) + (style.italic ? 2 : 0)];
    let font = this.cache.get(face);
    if (!font) {
      font = await this.doc.embedFont(face);
      this.cache.set(face, font);
    }
    return font;
  }
}

/**
 * The standard fonts cover Western European text only. Anything else is
 * reduced to its base letter ("Ł" -> "L") or dropped, never allowed to fail
 * the whole pack.
 */
export function drawable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  const swap: Record<string, string> = { "●": "•", "₹": "Rs.", " ": " ", " ": " ", "​": "" };
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (supported.has(code)) out += ch;
    else if (swap[ch] !== undefined) out += swap[ch];
    else {
      const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
      out += [...base].every((c) => supported.has(c.codePointAt(0)!)) ? base : "";
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The text a plain-format page carries, as a return would be read. */
export function plainText(body: string, name: string, footer: string | null): string {
  const lines = body.split("\n").map((l) => l.split(PARTY_PLACEHOLDER).join(name)).filter((l) => l.trim() && !/^_{3,}$/.test(l.trim()));
  return [...lines, footer ?? ""].filter(Boolean).join("\n");
}

const RULE = /^\s*_{5,}\s*$/;

async function drawPlain(out: PDFDocument, faces: Faces, size: [number, number], body: string, name: string, footer: string | null) {
  const page = out.addPage(size);
  const [w, h] = size;
  const margin = Math.min(72, w * 0.12);
  const regular = await faces.get({ family: "serif", bold: false, italic: false });
  const bold = await faces.get({ family: "serif", bold: true, italic: false });
  const italic = await faces.get({ family: "serif", bold: false, italic: true });
  const pt = 12;
  let y = h - margin * 2;
  for (const raw of body.split("\n")) {
    if (!raw.trim()) {
      y -= pt;
      continue;
    }
    if (RULE.test(raw)) {
      y -= 40; // room to sign
      page.drawLine({ start: { x: margin, y }, end: { x: margin + 220, y }, thickness: 0.8, color: INK });
      y -= pt * 1.6;
      continue;
    }
    const isName = raw.includes(PARTY_PLACEHOLDER);
    const font = isName ? bold : regular;
    const text = drawable(font, squash(raw.split(PARTY_PLACEHOLDER).join(name)));
    for (const line of wrap(text, font, pt, w - margin * 2)) {
      page.drawText(line, { x: margin, y, size: pt, font, color: INK });
      y -= pt * 1.45;
    }
  }
  if (footer) {
    const fs = 9.5;
    const lines = wrap(drawable(italic, squash(footer)), italic, fs, w - margin * 2);
    let fy = margin * 0.8 + (lines.length - 1) * fs * 1.35;
    for (const line of lines) {
      page.drawText(line, { x: (w - italic.widthOfTextAtSize(line, fs)) / 2, y: fy, size: fs, font: italic, color: INK });
      fy -= fs * 1.35;
    }
  }
}

const LEADING = 1.15;

/**
 * How to set a name in its slot: one line at (nearly) the template's size if
 * it fits across; otherwise two or three lines at the largest size that fits
 * both across and in the free space between the lines above and below.
 */
export function fitName(font: PDFFont, text: string, slot: NameSlot, room: number): { size: number; lines: string[] } {
  for (let size = slot.size; size >= slot.size * 0.85; size -= 0.25) {
    if (font.widthOfTextAtSize(text, size) <= room) return { size, lines: [text] };
  }
  const band = (slot.above ?? slot.y + slot.size * 1.25) - (slot.below ?? slot.y - slot.size * 1.25);
  let best: { size: number; lines: string[] } | null = null;
  for (let n = 2; n <= 3 && !best; n += 1) {
    for (let size = slot.size; size >= 6; size -= 0.25) {
      const lines = wrap(text, font, size, room);
      if (lines.length <= n && lines.every((l) => font.widthOfTextAtSize(l, size) <= room) && lines.length * size * LEADING <= band) {
        best = { size, lines };
        break;
      }
    }
  }
  // Never cut off: at worst, small type on as many lines as it takes.
  return best ?? { size: 6, lines: wrap(text, font, 6, room) };
}

function drawName(page: PDFPage, font: PDFFont, slot: NameSlot, raw: string) {
  const { width: pageW } = page.getSize();
  const text = drawable(font, slot.upper ? raw.toUpperCase() : raw);
  // Paint over the sample name's place (its text is already removed).
  const ascent = slot.size * 0.9;
  const descent = slot.size * 0.3;
  page.drawRectangle({ x: slot.x - 1.5, y: slot.y - descent, width: slot.width + 3, height: ascent + descent, color: rgb(1, 1, 1) });
  const sideMargin = Math.max(36, Math.min(slot.x, 72));
  const room =
    slot.align === "center" ? pageW - 2 * sideMargin : slot.align === "right" ? slot.x + slot.width - sideMargin : pageW - slot.x - sideMargin;
  const { size, lines } = fitName(font, text, slot, room);
  // One line sits on the sample's baseline; several are centred on it,
  // kept inside the free space.
  const step = size * LEADING;
  let top = slot.y + ((lines.length - 1) * step) / 2;
  if (slot.above !== undefined) top = Math.min(top, slot.above - size * 0.8);
  if (slot.below !== undefined) top = Math.max(top, slot.below + (lines.length - 1) * step + size * 0.25);
  lines.forEach((line, i) => {
    const lw = font.widthOfTextAtSize(line, size);
    const x = slot.align === "center" ? slot.x + slot.width / 2 - lw / 2 : slot.align === "right" ? slot.x + slot.width - lw : slot.x;
    page.drawText(line, { x, y: lines.length === 1 ? slot.y : top - i * step, size, font, color: INK });
  });
}

/** The text a template page carries once a name is put in. */
export function templateText(template: TemplateSpec, name: string): string {
  const sample = squash(template.sample).toLowerCase();
  return template.text
    .split("\n")
    .map((line) => (squash(line).toLowerCase() === sample ? name : line))
    .join("\n");
}

/**
 * One PDF with a page per sheet, in order. Returns the bytes, each page's
 * text (for sorting returns and checking them against what was sent), and
 * any template page whose sample name could not be taken out of its text.
 */
export async function buildSignaturePages(input: {
  size: [number, number];
  sheets: Sheet[];
  footer: string | null;
}): Promise<{ bytes: Uint8Array; texts: string[]; residue: number[] }> {
  const out = await PDFDocument.create();
  out.setTitle("Signature pages");
  out.setProducer("");
  out.setCreator("");
  const faces = new Faces(out);
  const templates = new Map<Uint8Array, PDFDocument>();
  const texts: string[] = [];
  // Pages where the template's sample name could only be painted over, not
  // removed from the text (the caller tells the lawyer).
  const residue: number[] = [];
  for (const sheet of input.sheets) {
    if (sheet.kind === "plain") {
      await drawPlain(out, faces, input.size, sheet.body, sheet.name, input.footer);
      texts.push(plainText(sheet.body, sheet.name, input.footer));
      continue;
    }
    const t = sheet.template;
    let src = templates.get(t.bytes);
    if (!src) {
      src = await PDFDocument.load(t.bytes, { updateMetadata: false });
      templates.set(t.bytes, src);
    }
    const [page] = await out.copyPages(src, [t.pageIndex]);
    out.addPage(page);
    // Take the sample name out of the page's text, then set the new one.
    if (removeTextAt(page, t.slots) === 0) residue.push(texts.length);
    for (const slot of t.slots) drawName(page, await faces.get(slot.style), slot, sheet.name);
    texts.push(templateText(t, sheet.name));
  }
  return { bytes: await out.save(), texts, residue };
}

/* ------------------------------------------------------------ templates */

/** The party name printed on a template page, as a first guess for the lawyer. */
export function guessSampleName(items: TextItem[]): string | null {
  const laid = layoutSegments(items);
  return suggestPartyNames(laid)[0] ?? null;
}

/**
 * Every place the sample name stands as a line (or block) of its own. A
 * name inside a longer sentence (a footer listing all parties) is left
 * alone: it names the parties to the agreement, not the signer.
 */
export function findNameSlots(items: StyledItem[], sample: string, pageWidth: number): NameSlot[] {
  const want = squash(sample).toLowerCase();
  if (!want) return [];
  const usable = items.filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: StyledItem[][] = [];
  for (const item of usable) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) <= Math.max(2, item.height * 0.5)) row.push(item);
    else rows.push([item]);
  }
  const slots: NameSlot[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    // Split the row where a wide gap separates side-by-side blocks.
    const groups: StyledItem[][] = [];
    let lastEnd = -Infinity;
    for (const item of row) {
      if (!groups.length || item.x - lastEnd > item.height * 3) groups.push([]);
      groups[groups.length - 1].push(item);
      lastEnd = item.x + item.width;
    }
    for (const group of groups) {
      const text = squash(group.map((i) => i.str).join(" ")).toLowerCase();
      const tight = squash(group.map((i) => i.str).join("")).toLowerCase();
      if (text !== want && tight !== want) continue;
      const first = group[0];
      const x = first.x;
      const width = group[group.length - 1].x + group[group.length - 1].width - x;
      const centre = x + width / 2;
      const align = Math.abs(centre - pageWidth / 2) < pageWidth * 0.04 && x > pageWidth * 0.15 ? "center" : x > pageWidth * 0.55 ? "right" : "left";
      // Capitals as printed on the page, whatever case the lawyer typed the name in.
      const letters = group.map((i) => i.str).join("").replace(/[^A-Za-z]/g, "");
      // The nearest lines above and below that share its horizontal space.
      const overlaps = (r: StyledItem[]) => r.some((i) => i.x < x + Math.max(width, pageWidth * 0.3) && i.x + i.width > x);
      const above = rows.filter((r) => r[0].y > first.y + 1 && overlaps(r)).sort((a, b) => a[0].y - b[0].y)[0];
      const below = rows.filter((r) => r[0].y < first.y - 1 && overlaps(r)).sort((a, b) => b[0].y - a[0].y)[0];
      slots.push({
        x,
        y: first.y,
        width,
        size: first.height || 12,
        style: first.style,
        align,
        upper: letters.length > 1 && letters === letters.toUpperCase(),
        above: above ? above[0].y - (above[0].height || 12) * 0.25 : undefined,
        below: below ? below[0].y + (below[0].height || 12) * 0.75 : undefined,
      });
    }
  }
  return slots;
}
