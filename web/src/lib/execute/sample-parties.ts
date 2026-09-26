/**
 * Synthetic agreements for the "no signature pages" paths: a shareholders'
 * agreement whose parties clause names three parties and points to "the
 * persons listed in Part A of Schedule 1" for the investors, with no
 * signature pages at all; and a one-page signature template of the kind a
 * lawyer exports from Word. Every name is invented.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const A4: [number, number] = [595.28, 841.89];
const M = 72;
const INK = rgb(0.08, 0.08, 0.1);

type Fonts = { roman: PDFFont; bold: PDFFont; italic: PDFFont };

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

function centred(page: PDFPage, text: string, y: number, font: PDFFont, size: number) {
  page.drawText(text, { x: (A4[0] - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color: INK });
}

function paragraph(page: PDFPage, text: string, y: number, f: PDFFont, size = 11, indent = 0): number {
  for (const line of wrap(text, f, size, A4[0] - M * 2 - indent)) {
    page.drawText(line, { x: M + indent, y, size, font: f, color: INK });
    y -= size * 1.45;
  }
  return y - 8;
}

function pageNumber(page: PDFPage, f: Fonts, n: number) {
  centred(page, String(n), 36, f.roman, 9);
}

export const NO_SIGNATURE_EXPECTED = {
  title: "Shareholders' Agreement",
  named: [
    { name: "Saffron Healthcare Private Limited", term: "Company" },
    { name: "Vikram Mehta", term: "Promoter" },
    { name: "Ananya Iyer", term: "Co-Founder" },
  ],
  group: { term: "Investors", ref: { word: "Schedule", number: "1", part: "A" } },
  investors: [
    "Orchid Capital Private Limited",
    "Kestrel India Opportunities Fund – Scheme A",
    "Northstar Ventures LLP",
    "Peepal Family Trust",
    "Radhika Menon",
    "Arjun Kapoor HUF",
  ],
  footer:
    "This signature page forms an integral part of the Shareholders' Agreement executed by and among Saffron Healthcare Private Limited, Vikram Mehta, Ananya Iyer and the Investors (as defined therein).",
};

/** A final SHA with no signature pages; the investors live in Schedule 1, Part A. */
export async function buildNoSignatureAgreement(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Shareholders' Agreement (sample)");
  const f: Fonts = {
    roman: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };

  // Cover.
  const cover = doc.addPage(A4);
  let y = 640;
  centred(cover, "SHAREHOLDERS' AGREEMENT", y, f.bold, 18);
  y -= 40;
  centred(cover, "DATED [•] 2026", y, f.roman, 12);
  y -= 60;
  centred(cover, "BY AND AMONG", y, f.bold, 12);
  y -= 40;
  for (const [i, [name, as]] of [
    ["SAFFRON HEALTHCARE PRIVATE LIMITED", "(as the Company)"],
    ["MR. VIKRAM MEHTA", "(as the Promoter)"],
    ["MS. ANANYA IYER", "(as the Co-Founder)"],
    ["THE PERSONS LISTED IN PART A OF SCHEDULE 1", "(as the Investors)"],
  ].entries()) {
    if (i) {
      centred(cover, "AND", y, f.bold, 11);
      y -= 28;
    }
    centred(cover, name, y, f.bold, 12);
    y -= 17;
    centred(cover, as, y, f.roman, 11);
    y -= 32;
  }

  // Contents: schedule headings listed here must not be mistaken for the schedules.
  const contents = doc.addPage(A4);
  centred(contents, "CONTENTS", 760, f.bold, 13);
  y = 720;
  for (const line of ["1. Definitions and Interpretation", "2. Board of Directors", "3. Transfer of Shares", "Schedule 1 – Investors", "Schedule 2 – Reserved Matters", "Schedule 3 – Deed of Adherence"]) {
    contents.drawText(line, { x: M, y, size: 11, font: f.roman, color: INK });
    y -= 20;
  }
  pageNumber(contents, f, 2);

  // Parties clause.
  const parties = doc.addPage(A4);
  y = 770;
  y = paragraph(parties, "This SHAREHOLDERS' AGREEMENT (the \"Agreement\") is executed on [•] at Mumbai,", y, f.roman);
  parties.drawText("BY AND AMONG:", { x: M, y, size: 11, font: f.bold, color: INK });
  y -= 24;
  const clause = [
    "1. SAFFRON HEALTHCARE PRIVATE LIMITED, a company incorporated under the Companies Act, 2013, having its registered office at 12 Link Road, Andheri (West), Mumbai 400053 (hereinafter referred to as the \"Company\", which expression shall, unless repugnant to the context or meaning thereof, be deemed to include its successors and permitted assigns) of the FIRST PART;",
    "2. MR. VIKRAM MEHTA, son of Mr. Anil Mehta, aged about 42 years, residing at 7 Carmichael Road, Mumbai 400026 (hereinafter referred to as the \"Promoter\", which expression shall, unless repugnant to the context or meaning thereof, be deemed to include his heirs, executors and permitted assigns) of the SECOND PART;",
    "3. MS. ANANYA IYER, daughter of Mr. K. Iyer, aged about 38 years, residing at 3 Palm Grove, Bengaluru 560001 (hereinafter referred to as the \"Co-Founder\", which expression shall include her heirs, executors and permitted assigns) of the THIRD PART;",
    "AND",
    "4. THE PERSONS whose names and addresses are set out in Part A of Schedule 1 (hereinafter collectively referred to as the \"Investors\" and individually as an \"Investor\", which expression shall include their respective successors and permitted assigns) of the FOURTH PART.",
    "The Company, the Promoter, the Co-Founder and the Investors are hereinafter collectively referred to as the \"Parties\" and individually as a \"Party\".",
    "WHEREAS:",
    "A. The Company is engaged in the business of operating diagnostic laboratories in India.",
  ];
  for (const text of clause) y = text === "AND" ? (parties.drawText("AND", { x: M, y, size: 11, font: f.bold, color: INK }), y - 22) : paragraph(parties, text, y, f.roman);
  pageNumber(parties, f, 3);

  // Body.
  for (const [n, heading] of [[4, "BOARD OF DIRECTORS"], [5, "TRANSFER OF SHARES"]] as const) {
    const page = doc.addPage(A4);
    y = 770;
    page.drawText(`${n - 2}. ${heading}`, { x: M, y, size: 11, font: f.bold, color: INK });
    y -= 22;
    for (let k = 1; k <= 4; k += 1) {
      y = paragraph(page, `${n - 2}.${k} Subject to the terms of this Agreement and the Articles, each Party shall exercise its rights and take all actions reasonably required to give effect to this Clause, and the Company shall not take any action inconsistent with the rights of the Investors under this Agreement or Applicable Law.`, y, f.roman);
    }
    pageNumber(page, f, n);
  }

  // Schedule 1: Part A (investors) and Part B (shareholding, which must be ignored).
  const s1 = doc.addPage(A4);
  y = 770;
  centred(s1, "SCHEDULE 1", y, f.bold, 12);
  y -= 30;
  s1.drawText("PART A – INVESTORS", { x: M, y, size: 11, font: f.bold, color: INK });
  y -= 26;
  const cols = [M, M + 44, M + 250, M + 390];
  ["S. No.", "Name of Investor", "Address", "No. of Shares"].forEach((h, i) => s1.drawText(h, { x: cols[i], y, size: 10.5, font: f.bold, color: INK }));
  y -= 20;
  const rows: [string, string[], string, string][] = [
    ["1.", ["Orchid Capital Private Limited"], "Mumbai", "12,500"],
    ["2.", ["Kestrel India Opportunities", "Fund – Scheme A"], "Mumbai", "9,000"],
    ["3.", ["Northstar Ventures LLP"], "Bengaluru", "4,200"],
    ["4.", ["Peepal Family Trust"], "New Delhi", "3,000"],
    ["5.", ["Ms. Radhika Menon"], "Chennai", "1,100"],
    ["6.", ["Arjun Kapoor HUF"], "Pune", "900"],
  ];
  for (const [no, name, city, shares] of rows) {
    s1.drawText(no, { x: cols[0], y, size: 10.5, font: f.roman, color: INK });
    name.forEach((line, i) => s1.drawText(line, { x: cols[1], y: y - i * 13, size: 10.5, font: f.roman, color: INK }));
    s1.drawText(city, { x: cols[2], y, size: 10.5, font: f.roman, color: INK });
    s1.drawText(shares, { x: cols[3], y, size: 10.5, font: f.roman, color: INK });
    y -= 13 * name.length + 9;
  }
  y -= 24;
  s1.drawText("PART B – SHAREHOLDING OF THE PROMOTER", { x: M, y, size: 11, font: f.bold, color: INK });
  y -= 26;
  ["S. No.", "Name of Shareholder", "No. of Shares"].forEach((h, i) => s1.drawText(h, { x: [M, M + 44, M + 300][i], y, size: 10.5, font: f.bold, color: INK }));
  y -= 20;
  for (const [no, name, shares] of [["1.", "Vikram Mehta", "60,000"], ["2.", "Ananya Iyer", "20,000"]]) {
    [no, name, shares].forEach((t, i) => s1.drawText(t, { x: [M, M + 44, M + 300][i], y, size: 10.5, font: f.roman, color: INK }));
    y -= 20;
  }
  pageNumber(s1, f, 6);

  const s2 = doc.addPage(A4);
  y = 770;
  centred(s2, "SCHEDULE 2", y, f.bold, 12);
  y -= 22;
  centred(s2, "RESERVED MATTERS", y, f.bold, 11);
  y -= 30;
  for (const item of ["Any amendment to the charter documents of the Company.", "Any issue of securities other than as permitted under this Agreement.", "Any related party transaction above INR 50,00,000."]) {
    y = paragraph(s2, item, y, f.roman);
  }
  pageNumber(s2, f, 7);

  return doc.save();
}

export const TEMPLATE_SAMPLE_NAME = "ORCHID CAPITAL PRIVATE LIMITED";

/** One signature page as a lawyer would export it from Word, with a party's name to replace. */
export async function buildSignatureTemplate(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const f: Fonts = {
    roman: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
  const page = doc.addPage(A4);
  let y = 700;
  page.drawText("SIGNED AND DELIVERED for and on behalf of", { x: M, y, size: 12, font: f.roman, color: INK });
  y -= 18;
  page.drawText(TEMPLATE_SAMPLE_NAME, { x: M, y, size: 12, font: f.bold, color: INK });
  y -= 18;
  page.drawText("through its authorised signatory", { x: M, y, size: 12, font: f.roman, color: INK });
  y -= 70;
  page.drawText("_________________________________", { x: M, y, size: 12, font: f.roman, color: INK });
  y -= 20;
  page.drawText("Name:", { x: M, y, size: 12, font: f.roman, color: INK });
  y -= 18;
  page.drawText("Designation:", { x: M, y, size: 12, font: f.roman, color: INK });
  const footer =
    "This signature page forms an integral part of the Shareholders' Agreement executed by and among Saffron Healthcare Private Limited, Vikram Mehta, Ananya Iyer and the Investors (as defined therein).";
  y = 90;
  for (const line of wrap(footer, f.italic, 9.5, A4[0] - M * 2)) {
    centred(page, line, y, f.italic, 9.5);
    y -= 13;
  }
  return doc.save();
}
