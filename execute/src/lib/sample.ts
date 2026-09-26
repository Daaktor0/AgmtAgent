/**
 * A synthetic sample deal: a 12-page shareholders' agreement with seven
 * parties (two of them sharing one signature page), their countersigned
 * pages and specimen stamp papers. Every name, number and "stamp paper" here
 * is invented and marked as a specimen. Used by "Try a sample deal" and tests.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type SampleFile = { name: string; bytes: Uint8Array };
export type SampleDeal = {
  agreement: SampleFile;
  returns: SampleFile[];
  expected: { signaturePages: number[]; partiesByPage: Record<number, string[]> };
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 72;
const INK = rgb(0.1, 0.1, 0.12);
const PEN = rgb(0.05, 0.15, 0.55);

const CLAUSES = [
  "Definitions and Interpretation",
  "Subscription and Closing",
  "Board of Directors",
  "Reserved Matters",
  "Transfer of Shares",
  "Pre-emptive Rights",
  "Tag-Along and Drag-Along Rights",
  "Information Rights",
  "Representations and Warranties",
  "Confidentiality",
  "Term and Termination",
  "Governing Law and Dispute Resolution",
];

const FILLER =
  "Subject to the terms of this Agreement and the Articles, each Shareholder shall exercise its voting rights and take all other actions reasonably required to give effect to the provisions of this Clause, and the Company shall not take any action that is inconsistent with the rights of the Investors under this Agreement. Any notice under this Clause shall be given in writing in accordance with the notice provisions of this Agreement and shall specify in reasonable detail the matter to which it relates. Nothing in this Clause shall restrict any Party from complying with Applicable Law or the order of any Governmental Authority of competent jurisdiction.";

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

type Fonts = { regular: PDFFont; bold: PDFFont };

function footer(page: PDFPage, fonts: Fonts, n: number, note?: string) {
  page.drawText(String(n), { x: A4[0] / 2 - 4, y: 36, size: 9, font: fonts.regular, color: INK });
  if (note) {
    const w = fonts.regular.widthOfTextAtSize(note, 9);
    page.drawText(note, { x: (A4[0] - w) / 2, y: 54, size: 9, font: fonts.regular, color: INK });
  }
}

function bodyPage(doc: PDFDocument, fonts: Fonts, n: number, clauses: string[]) {
  const page = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  for (const [i, heading] of clauses.entries()) {
    const number = (n - 1) * 2 + i + 1;
    page.drawText(`${number}. ${heading.toUpperCase()}`, { x: MARGIN, y, size: 10.5, font: fonts.bold, color: INK });
    y -= 18;
    for (const para of [FILLER, FILLER.replace("Subject to", "Without prejudice to")]) {
      for (const line of wrap(`${number}.${para === FILLER ? 1 : 2} ${para}`, fonts.regular, 10, A4[0] - MARGIN * 2)) {
        page.drawText(line, { x: MARGIN, y, size: 10, font: fonts.regular, color: INK });
        y -= 14;
      }
      y -= 6;
    }
    y -= 8;
  }
  footer(page, fonts, n);
}

/** Where each party signs, so the sample returns can put ink in the right place. */
type Block = { party: string; x: number; lineY: number };

function drawBlock(page: PDFPage, fonts: Fonts, x: number, top: number, lines: string[], nameLine: number): number {
  let y = top;
  lines.forEach((text, i) => {
    page.drawText(text, { x, y, size: 10, font: i === nameLine ? fonts.bold : fonts.regular, color: INK });
    y -= 15;
  });
  y -= 28;
  page.drawText("______________________________", { x, y, size: 10, font: fonts.regular, color: INK });
  const lineY = y;
  y -= 16;
  page.drawText("Name:", { x, y, size: 10, font: fonts.regular, color: INK });
  y -= 15;
  page.drawText("Designation:", { x, y, size: 10, font: fonts.regular, color: INK });
  return lineY;
}

function signaturePage(doc: PDFDocument, fonts: Fonts, n: number, witness: boolean, build: (page: PDFPage, top: number) => Block[]) {
  const page = doc.addPage(A4);
  let top = A4[1] - MARGIN;
  if (witness) {
    for (const line of wrap(
      "IN WITNESS WHEREOF the Parties have executed this Agreement on the day and year first above written.",
      fonts.regular,
      10,
      A4[0] - MARGIN * 2,
    )) {
      page.drawText(line, { x: MARGIN, y: top, size: 10, font: fonts.regular, color: INK });
      top -= 14;
    }
    top -= 24;
  }
  const blocks = build(page, top);
  footer(page, fonts, n, "[Signature page to the Shareholders' Agreement]");
  return blocks;
}

function scribble(page: PDFPage, x: number, y: number, seed: number) {
  const a = 6 + (seed % 5);
  const path = `M 0 0 C 10 -${a * 2} 20 ${a} 30 -${a} S 50 ${a * 2} 62 -2 S 84 -${a} 96 ${a} L 120 -4`;
  page.drawSvgPath(path, { x: x + 8, y: y + 14, borderColor: PEN, borderWidth: 1.4 });
}

async function fonts(doc: PDFDocument): Promise<Fonts> {
  return { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}

async function specimenStamp(party: string, certificate: string, sheet: number, sheets: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const f = await fonts(doc);
  for (let s = 0; s < sheets; s += 1) {
    const page = doc.addPage(A4);
    page.drawRectangle({ x: 48, y: 470, width: A4[0] - 96, height: 320, borderColor: rgb(0.45, 0.4, 0.55), borderWidth: 1.5, color: rgb(0.95, 0.94, 0.9) });
    const lines: [string, number, PDFFont][] = [
      ["SPECIMEN - NOT A STAMP PAPER", 16, f.bold],
      ["Sample e-stamp certificate generated for testing Agmt Execute", 10, f.regular],
      [`Certificate No.: ${certificate}${sheets > 1 ? `-${sheet + s}` : ""}`, 11, f.regular],
      [`Purchased by: ${party}`, 11, f.regular],
      ["Description of document: Shareholders' Agreement", 11, f.regular],
      [`Sheet ${s + 1} of ${sheets}`, 11, f.regular],
    ];
    let y = 750;
    for (const [text, size, font] of lines) {
      page.drawText(text, { x: 72, y, size, font, color: INK });
      y -= size + 16;
    }
  }
  return doc.save();
}

export async function buildSampleDeal(): Promise<SampleDeal> {
  const doc = await PDFDocument.create();
  doc.setTitle("Shareholders' Agreement - Meridian Foods (sample)");
  const f = await fonts(doc);

  for (let n = 1; n <= 6; n += 1) bodyPage(doc, f, n, CLAUSES.slice((n - 1) * 2, n * 2));

  const sig: { page: number; blocks: Block[] }[] = [];
  const single = (n: number, witness: boolean, party: string, lines: string[], nameLine: number) => {
    const blocks = signaturePage(doc, f, n, witness, (page, top) => [
      { party, x: MARGIN, lineY: drawBlock(page, f, MARGIN, top, lines, nameLine) },
    ]);
    sig.push({ page: n - 1, blocks });
  };

  single(7, true, "Meridian Foods Private Limited", [
    "SIGNED AND DELIVERED by the within named Company",
    "MERIDIAN FOODS PRIVATE LIMITED",
    "through its authorised signatory",
  ], 1);

  const promoters = signaturePage(doc, f, 8, false, (page, top) => [
    { party: "Rahul Mehta", x: MARGIN, lineY: drawBlock(page, f, MARGIN, top, ["SIGNED AND DELIVERED by the", "within named Promoter,", "RAHUL MEHTA"], 2) },
    { party: "Priya Nair", x: 320, lineY: drawBlock(page, f, 320, top, ["SIGNED AND DELIVERED by the", "within named Promoter,", "PRIYA NAIR"], 2) },
  ]);
  sig.push({ page: 7, blocks: promoters });

  single(9, false, "Banyan Capital Fund I", ["For and on behalf of BANYAN CAPITAL FUND I", "acting through its investment manager"], 0);
  single(10, false, "Kestrel Ventures LLP", ["For and on behalf of", "KESTREL VENTURES LLP", "through its designated partner"], 1);
  single(11, false, "Anand Iyer", ["SIGNED AND DELIVERED by the within named Investor, ANAND IYER"], 0);
  single(12, false, "Tamarind Growth Partners", ["For and on behalf of TAMARIND GROWTH PARTNERS", "through its authorised signatory"], 0);

  const schedule = doc.addPage(A4);
  schedule.drawText("SCHEDULE 1 - SHAREHOLDING PATTERN", { x: MARGIN, y: A4[1] - MARGIN, size: 11, font: f.bold, color: INK });
  const rows = [
    ["Shareholder", "Equity Shares", "Percentage"],
    ["Rahul Mehta", "4,200", "42.00%"],
    ["Priya Nair", "2,800", "28.00%"],
    ["Banyan Capital Fund I", "1,500", "15.00%"],
    ["Kestrel Ventures LLP", "800", "8.00%"],
    ["Anand Iyer", "300", "3.00%"],
    ["Tamarind Growth Partners", "400", "4.00%"],
  ];
  rows.forEach((row, i) => {
    row.forEach((cell, c) => {
      schedule.drawText(cell, { x: MARGIN + c * 170, y: A4[1] - MARGIN - 30 - i * 18, size: 10, font: i === 0 ? f.bold : f.regular, color: INK });
    });
  });
  footer(schedule, f, 13);

  const agreementBytes = await doc.save();

  // Countersigned returns: each party sends back its own copy of its page.
  const returns: SampleFile[] = [];
  const skip = new Set(["Tamarind Growth Partners"]); // still awaited, to show the check
  let seed = 1;
  for (const { page, blocks } of sig) {
    for (const block of blocks) {
      if (skip.has(block.party)) continue;
      const out = await PDFDocument.create();
      const src = await PDFDocument.load(agreementBytes);
      const [copied] = await out.copyPages(src, [page]);
      out.addPage(copied);
      scribble(copied, block.x, block.lineY, seed++);
      returns.push({ name: `${block.party} - signed signature page.pdf`, bytes: await out.save() });
    }
  }

  const parties = sig.flatMap((s) => s.blocks.map((b) => b.party));
  let cert = 40211;
  for (const party of parties) {
    const sheets = party === "Meridian Foods Private Limited" ? 2 : 1;
    returns.push({
      name: `e-Stamp paper - ${party}.pdf`,
      bytes: await specimenStamp(party, `IN-DEMO-${cert}`, 1, sheets),
    });
    cert += 7;
  }

  const partiesByPage: Record<number, string[]> = {};
  for (const s of sig) partiesByPage[s.page] = s.blocks.map((b) => b.party);

  return {
    agreement: { name: "SHA_Meridian Foods_Execution Version_v9.pdf", bytes: agreementBytes },
    returns,
    expected: { signaturePages: sig.map((s) => s.page), partiesByPage },
  };
}
