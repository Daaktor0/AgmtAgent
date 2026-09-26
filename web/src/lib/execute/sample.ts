/**
 * A synthetic sample signing: a shareholders' agreement (seven parties, two
 * promoters sharing one signature page) and a share subscription agreement
 * (the company and four investors), with countersigned pages and specimen
 * e-stamp certificates. Several returns carry uninformative scanner names so
 * the sample shows sorting by content. Every name and number is invented and
 * every "stamp paper" is marked as a specimen.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type SampleFile = { name: string; bytes: Uint8Array };
export type SampleSigning = {
  documents: SampleFile[];
  returns: SampleFile[];
  expected: Record<string, { signaturePages: number[]; partiesByPage: Record<number, string[]> }>;
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 72;
const INK = rgb(0.1, 0.1, 0.12);
const PEN = rgb(0.05, 0.15, 0.55);

const FILLER =
  "Subject to the terms of this Agreement and the Articles, each party shall exercise its rights and take all other actions reasonably required to give effect to the provisions of this Clause, and the Company shall not take any action that is inconsistent with the rights of the Investors under this Agreement. Any notice under this Clause shall be given in writing in accordance with the notice provisions of this Agreement and shall specify in reasonable detail the matter to which it relates. Nothing in this Clause shall restrict any party from complying with Applicable Law or the order of any Governmental Authority of competent jurisdiction.";

type Fonts = { regular: PDFFont; bold: PDFFont };
type Block = { party: string; x: number; lineY: number };
type SigSpec = { parties: { party: string; lines: string[]; nameLine: number }[] };

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

async function fonts(doc: PDFDocument): Promise<Fonts> {
  return { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}

function footer(page: PDFPage, f: Fonts, n: number, note?: string) {
  page.drawText(String(n), { x: A4[0] / 2 - 4, y: 36, size: 9, font: f.regular, color: INK });
  if (note) {
    const w = f.regular.widthOfTextAtSize(note, 9);
    page.drawText(note, { x: (A4[0] - w) / 2, y: 54, size: 9, font: f.regular, color: INK });
  }
}

function bodyPage(doc: PDFDocument, f: Fonts, n: number, headings: string[]) {
  const page = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  headings.forEach((heading, i) => {
    const number = (n - 1) * 2 + i + 1;
    page.drawText(`${number}. ${heading.toUpperCase()}`, { x: MARGIN, y, size: 10.5, font: f.bold, color: INK });
    y -= 18;
    for (const lead of ["Subject to", "Without prejudice to"]) {
      for (const line of wrap(`${number}.${lead === "Subject to" ? 1 : 2} ${FILLER.replace("Subject to", lead)}`, f.regular, 10, A4[0] - MARGIN * 2)) {
        page.drawText(line, { x: MARGIN, y, size: 10, font: f.regular, color: INK });
        y -= 14;
      }
      y -= 6;
    }
    y -= 8;
  });
  footer(page, f, n);
}

function drawBlock(page: PDFPage, f: Fonts, x: number, top: number, lines: string[], nameLine: number): number {
  let y = top;
  lines.forEach((text, i) => {
    page.drawText(text, { x, y, size: 10, font: i === nameLine ? f.bold : f.regular, color: INK });
    y -= 15;
  });
  y -= 28;
  page.drawText("______________________________", { x, y, size: 10, font: f.regular, color: INK });
  const lineY = y;
  y -= 16;
  page.drawText("Name:", { x, y, size: 10, font: f.regular, color: INK });
  y -= 15;
  page.drawText("Designation:", { x, y, size: 10, font: f.regular, color: INK });
  return lineY;
}

async function buildAgreement(title: string, shortTitle: string, bodyHeadings: string[][], sigs: SigSpec[], trailer: (page: PDFPage, f: Fonts) => void) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${title} (sample)`);
  const f = await fonts(doc);
  bodyHeadings.forEach((h, i) => bodyPage(doc, f, i + 1, h));
  const placed: { page: number; blocks: Block[] }[] = [];
  sigs.forEach((spec, i) => {
    const page = doc.addPage(A4);
    let top = A4[1] - MARGIN;
    if (i === 0) {
      for (const line of wrap(
        "IN WITNESS WHEREOF the Parties have executed this Agreement on the day and year first above written.",
        f.regular,
        10,
        A4[0] - MARGIN * 2,
      )) {
        page.drawText(line, { x: MARGIN, y: top, size: 10, font: f.regular, color: INK });
        top -= 14;
      }
      top -= 24;
    }
    const blocks = spec.parties.map((p, k) => {
      const x = spec.parties.length > 1 ? (k === 0 ? MARGIN : 320) : MARGIN;
      return { party: p.party, x, lineY: drawBlock(page, f, x, top, p.lines, p.nameLine) };
    });
    footer(page, f, doc.getPageCount(), `[Signature page to the ${shortTitle}]`);
    placed.push({ page: doc.getPageCount() - 1, blocks });
  });
  const last = doc.addPage(A4);
  trailer(last, f);
  footer(last, f, doc.getPageCount());
  return { bytes: await doc.save(), placed };
}

function scribble(page: PDFPage, x: number, y: number, seed: number) {
  const a = 6 + (seed % 5);
  page.drawSvgPath(`M 0 0 C 10 -${a * 2} 20 ${a} 30 -${a} S 50 ${a * 2} 62 -2 S 84 -${a} 96 ${a} L 120 -4`, {
    x: x + 8,
    y: y + 14,
    borderColor: PEN,
    borderWidth: 1.4,
  });
}

async function signedPage(agreement: Uint8Array, pageIndex: number, block: Block, seed: number) {
  const out = await PDFDocument.create();
  const src = await PDFDocument.load(agreement);
  const [copied] = await out.copyPages(src, [pageIndex]);
  out.addPage(copied);
  scribble(copied, block.x, block.lineY, seed);
  return out.save();
}

/** Laid out like an e-stamp certificate: one "Label : Value" per line. */
async function specimenStamp(fields: { cert: string; purchasedBy: string; first: string; second: string; paidBy: string; amount: string; description: string }, sheets = 1) {
  const doc = await PDFDocument.create();
  const f = await fonts(doc);
  for (let s = 0; s < sheets; s += 1) {
    const page = doc.addPage(A4);
    page.drawRectangle({ x: 48, y: 400, width: A4[0] - 96, height: 390, borderColor: rgb(0.45, 0.4, 0.55), borderWidth: 1.5, color: rgb(0.95, 0.94, 0.9) });
    let y = 760;
    const line = (text: string, size = 10.5, font = f.regular) => {
      page.drawText(text, { x: 72, y, size, font, color: INK });
      y -= size + 12;
    };
    line("SPECIMEN - NOT A STAMP PAPER", 15, f.bold);
    line("Specimen e-stamp certificate for the Execute sample. No stamp duty has been paid.", 9);
    line(`Certificate No. : ${fields.cert}${sheets > 1 ? String(s + 1) : ""}`);
    line("Certificate Issued Date : 12-Sep-2026 11:04 AM");
    line(`Purchased by : ${fields.purchasedBy}`);
    line(`Description of Document : ${fields.description}`);
    line(`First Party : ${fields.first}`);
    line(`Second Party : ${fields.second}`);
    line(`Stamp Duty Paid By : ${fields.paidBy}`);
    line(`Stamp Duty Amount(Rs.) : ${fields.amount}`);
    line(`Sheet ${s + 1} of ${sheets}`);
  }
  return doc.save();
}

const one = (party: string, lines: string[], nameLine: number): SigSpec => ({ parties: [{ party, lines, nameLine }] });

export async function buildSampleSigning(): Promise<SampleSigning> {
  const sha = await buildAgreement(
    "Shareholders' Agreement",
    "Shareholders' Agreement",
    [
      ["Definitions and Interpretation", "Board of Directors"],
      ["Reserved Matters", "Transfer of Shares"],
      ["Pre-emptive Rights", "Tag-Along and Drag-Along Rights"],
      ["Information Rights", "Governing Law and Dispute Resolution"],
    ],
    [
      one("Meridian Foods Private Limited", ["SIGNED AND DELIVERED by the within named Company", "MERIDIAN FOODS PRIVATE LIMITED", "through its authorised signatory"], 1),
      {
        parties: [
          { party: "Rahul Mehta", lines: ["SIGNED AND DELIVERED by the", "within named Promoter,", "RAHUL MEHTA"], nameLine: 2 },
          { party: "Priya Nair", lines: ["SIGNED AND DELIVERED by the", "within named Promoter,", "PRIYA NAIR"], nameLine: 2 },
        ],
      },
      one("Banyan Capital Fund I", ["For and on behalf of BANYAN CAPITAL FUND I", "acting through its investment manager"], 0),
      one("Kestrel Ventures LLP", ["For and on behalf of", "KESTREL VENTURES LLP", "through its designated partner"], 1),
      one("Anand Iyer", ["SIGNED AND DELIVERED by the within named Investor, ANAND IYER"], 0),
      one("Tamarind Growth Partners", ["For and on behalf of TAMARIND GROWTH PARTNERS", "through its authorised signatory"], 0),
    ],
    (page, f) => {
      page.drawText("SCHEDULE 1 - SHAREHOLDING PATTERN", { x: MARGIN, y: A4[1] - MARGIN, size: 11, font: f.bold, color: INK });
      [
        ["Shareholder", "Equity Shares"],
        ["Rahul Mehta", "4,200"],
        ["Priya Nair", "2,800"],
        ["Banyan Capital Fund I", "1,500"],
        ["Kestrel Ventures LLP", "800"],
        ["Anand Iyer", "300"],
        ["Tamarind Growth Partners", "400"],
      ].forEach((row, i) =>
        row.forEach((cell, c) =>
          page.drawText(cell, { x: MARGIN + c * 220, y: A4[1] - MARGIN - 30 - i * 18, size: 10, font: i === 0 ? f.bold : f.regular, color: INK }),
        ),
      );
    },
  );

  const ssa = await buildAgreement(
    "Share Subscription Agreement",
    "Share Subscription Agreement",
    [
      ["Subscription", "Conditions Precedent"],
      ["Closing", "Use of Proceeds"],
    ],
    [
      one("Meridian Foods Private Limited", ["SIGNED AND DELIVERED by the within named Company", "MERIDIAN FOODS PRIVATE LIMITED", "through its authorised signatory"], 1),
      one("Banyan Capital Fund I", ["For and on behalf of BANYAN CAPITAL FUND I", "acting through its investment manager"], 0),
      one("Kestrel Ventures LLP", ["For and on behalf of", "KESTREL VENTURES LLP", "through its designated partner"], 1),
      one("Anand Iyer", ["SIGNED AND DELIVERED by the within named Subscriber, ANAND IYER"], 0),
    ],
    (page, f) => {
      page.drawText("SCHEDULE 1 - SUBSCRIPTION AMOUNTS", { x: MARGIN, y: A4[1] - MARGIN, size: 11, font: f.bold, color: INK });
    },
  );

  const returns: SampleFile[] = [];
  let seed = 1;
  let scan = 1;
  const scanName = () => `scan${String(scan++).padStart(4, "0")}.pdf`;

  // SHA: everyone but Tamarind has sent the countersigned page. Some senders
  // named their files; the scanner named the rest.
  for (const { page, blocks } of sha.placed) {
    for (const block of blocks) {
      if (block.party === "Tamarind Growth Partners") continue;
      const named = block.party === "Rahul Mehta" || block.party === "Priya Nair";
      returns.push({
        name: named ? `${block.party} - SHA signed.pdf` : scanName(),
        bytes: await signedPage(sha.bytes, page, block, seed++),
      });
    }
  }
  // SSA: all four have signed.
  for (const { page, blocks } of ssa.placed) {
    for (const block of blocks) returns.push({ name: scanName(), bytes: await signedPage(ssa.bytes, page, block, seed++) });
  }

  // Stamp papers: one per copy. The company buys its own; each investor buys
  // theirs. The company's SHA stamp duty is split across two sheets.
  const shaParties = ["Meridian Foods Private Limited", "Rahul Mehta", "Priya Nair", "Banyan Capital Fund I", "Kestrel Ventures LLP", "Anand Iyer", "Tamarind Growth Partners"];
  let cert = 402118;
  for (const party of shaParties) {
    returns.push({
      name: `e-Stamp ${party} SHA.pdf`,
      bytes: await specimenStamp(
        {
          cert: `IN-DEMO${cert}`,
          purchasedBy: party,
          first: "Meridian Foods Private Limited",
          second: party === "Meridian Foods Private Limited" ? "Rahul Mehta and others" : party,
          paidBy: party,
          amount: party.startsWith("Meridian") ? "1,000" : "500",
          description: "Article 5(h) Agreement - Shareholders' Agreement",
        },
        party.startsWith("Meridian") ? 2 : 1,
      ),
    });
    cert += 7;
  }
  for (const party of ["Meridian Foods Private Limited", "Banyan Capital Fund I", "Kestrel Ventures LLP", "Anand Iyer"]) {
    returns.push({
      name: scanName(),
      bytes: await specimenStamp({
        cert: `IN-DEMO${cert}`,
        purchasedBy: party,
        first: "Meridian Foods Private Limited",
        second: party,
        paidBy: party,
        amount: "500",
        description: "Article 5(h) Agreement - Share Subscription Agreement",
      }),
    });
    cert += 7;
  }

  const expectation = (placed: { page: number; blocks: Block[] }[]) => ({
    signaturePages: placed.map((p) => p.page),
    partiesByPage: Object.fromEntries(placed.map((p) => [p.page, p.blocks.map((b) => b.party)])),
  });

  return {
    documents: [
      { name: "SHA_Meridian Foods_Execution Version_v9.pdf", bytes: sha.bytes },
      { name: "SSA_Meridian Foods_Execution Version_v4.pdf", bytes: ssa.bytes },
    ],
    returns,
    expected: { "SHA Meridian Foods": expectation(sha.placed), "SSA Meridian Foods": expectation(ssa.placed) },
  };
}
