/**
 * The closing index: one page (or a few) listing every executed copy, who it
 * is for, the stamp paper certificate in front of it and the file name. It
 * goes into the zip with the copies so the set explains itself.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Signing } from "./model.ts";
import { copyFileName, copyParties, partyName, signedFor, stampsFor } from "./signing.ts";

const A4: [number, number] = [595.28, 841.89];
const M = 56;
const INK = rgb(0.11, 0.1, 0.09);
const STONE = rgb(0.43, 0.45, 0.47);
const RULE = rgb(0.85, 0.82, 0.77);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** pdf-lib's standard fonts cover WinAnsi only; keep the index legible for any name. */
function ascii(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/₹/g, "Rs. ")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "");
}

export async function buildClosingIndex(s: Signing, now = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${s.name} - Closing index`);
  doc.setProducer("Agmt");
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;
  const ensure = (h: number) => {
    if (y - h < M) {
      page = doc.addPage(A4);
      y = A4[1] - M;
    }
  };
  const text = (t: string, x: number, size: number, font: PDFFont, color = INK) =>
    page.drawText(ascii(t), { x, y, size, font, color });

  text("Closing index", M, 26, serif);
  y -= 30;
  text(s.name, M, 13, sans, STONE);
  y -= 18;
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  text(`Prepared ${date} with Agmt. Assembled on the preparer's computer.`, M, 9, sans, STONE);
  y -= 28;

  const cols = [
    { label: "Copy for", x: M, w: 150 },
    { label: "Copy", x: M + 156, w: 72 },
    { label: "Stamp paper", x: M + 234, w: 130 },
    { label: "File", x: M + 370, w: A4[0] - M - (M + 370) },
  ];

  s.documents.forEach((d, i) => {
    ensure(60);
    page.drawLine({ start: { x: M, y: y + 12 }, end: { x: A4[0] - M, y: y + 12 }, thickness: 0.6, color: RULE });
    text(`${i + 1}. ${d.title}`, M, 14, serif);
    y -= 16;
    const signers = [...new Set(Object.values(d.sigPages).flat())];
    const received = signers.filter((p) => signedFor(s, d.id, p).length).length;
    text(`${d.pageCount} pages. Countersigned pages received from ${received} of ${signers.length} parties.`, M, 9, sans, STONE);
    y -= 20;
    cols.forEach((c) => text(c.label.toUpperCase(), c.x, 7.5, bold, STONE));
    y -= 12;
    for (const partyId of copyParties(d)) {
      const stamps = stampsFor(s, d.id, partyId);
      const stampText = stamps.length
        ? stamps
            .map((r) => [r.estamp?.certificateNo ?? r.fileName, r.estamp?.amount ? `Rs. ${r.estamp.amount}` : null].filter(Boolean).join(", "))
            .join("\n")
        : "Awaited";
      const cells = [
        partyName(s, partyId),
        d.copies[partyId] === "original" ? "Original" : "Counterpart",
        stampText,
        copyFileName(s, d, partyId),
      ];
      const lines = cells.map((c, k) => wrap(ascii(c), sans, 8.5, cols[k].w));
      const h = Math.max(...lines.map((l) => l.length)) * 11 + 6;
      ensure(h);
      lines.forEach((ls, k) => ls.forEach((l, n) => page.drawText(l, { x: cols[k].x, y: y - n * 11, size: 8.5, font: sans, color: INK })));
      y -= h;
    }
    y -= 14;
  });
  return doc.save();
}
