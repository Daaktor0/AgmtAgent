/**
 * The closing index: a page (or a few) listing exactly the executed copies in
 * the zip, who each is for, the stamp paper in front of it and its file name,
 * then any copy that was left out and why. It goes into the zip with the
 * copies so the set explains itself to whoever receives it.
 *
 * Set in Source Serif 4 and Archivo when their bytes are passed in (any name
 * prints as written); otherwise in pdf-lib's built-in Times and Helvetica,
 * which cover plain Latin only.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { copyStatus, signingFlags } from "./checks.ts";
import type { Signing } from "./model.ts";
import { copyParties, partyName, signedFor, stampsFor } from "./signing.ts";

export type IndexEntry = { docId: string; partyId: string; fileName: string };
export type IndexFonts = { serif: Uint8Array; sans: Uint8Array; sansBold: Uint8Array };

const A4: [number, number] = [595.28, 841.89];
const M = 56;
const INK = rgb(0.11, 0.098, 0.09);
const STONE = rgb(0.337, 0.357, 0.373);
const RULE = rgb(0.851, 0.824, 0.769);
const RULE_STRONG = rgb(0.522, 0.49, 0.439);
const OXBLOOD = rgb(0.42, 0.169, 0.169);
const FOOTER = "Prepared with Execute by Agmt. Stamp duty figures are as read from each certificate.";

/** pdf-lib's standard fonts cover WinAnsi only; keep the index legible for any name. */
function ascii(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .replace(/₹/g, "Rs. ")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "");
}

type Fonts = { serif: PDFFont; sans: PDFFont; bold: PDFFont; clean: (t: string) => string };

async function loadFonts(doc: PDFDocument, bytes?: IndexFonts): Promise<Fonts> {
  if (bytes) {
    try {
      const { default: fontkit } = await import("@pdf-lib/fontkit");
      doc.registerFontkit(fontkit);
      return {
        serif: await doc.embedFont(bytes.serif, { subset: true }),
        sans: await doc.embedFont(bytes.sans, { subset: true }),
        bold: await doc.embedFont(bytes.sansBold, { subset: true }),
        // eslint-disable-next-line no-control-regex
        clean: (t) => t.replace(/[\u0000-\u001f]/g, " "),
      };
    } catch {
      // Fall through to the built-in fonts rather than fail the download.
    }
  }
  return {
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    clean: ascii,
  };
}

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

export async function buildClosingIndex(s: Signing, included: IndexEntry[], opts: { fonts?: IndexFonts; now?: Date } = {}): Promise<Uint8Array> {
  const now = opts.now ?? new Date();
  const doc = await PDFDocument.create();
  doc.setTitle(`${s.name} - Closing index`);
  doc.setProducer("Execute by Agmt");
  doc.setCreator("Execute by Agmt");
  const f = await loadFonts(doc, opts.fonts);
  const flags = signingFlags(s);

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;
  const right = A4[0] - M;
  const newPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - M;
  };
  const ensure = (h: number) => {
    if (y - h < M + 28) newPage();
  };
  const text = (t: string, x: number, size: number, font: PDFFont, color = INK, at = y) =>
    page.drawText(f.clean(t), { x, y: at, size, font, color });
  /** Small capitals with a little letter-spacing, for column labels. */
  const label = (t: string, x: number, at = y) => {
    let pen = x;
    for (const ch of f.clean(t.toUpperCase())) {
      page.drawText(ch, { x: pen, y: at, size: 6.5, font: f.bold, color: STONE });
      pen += f.bold.widthOfTextAtSize(ch, 6.5) + 0.9;
    }
  };
  const rule = (at: number, thickness = 0.5, color = RULE) =>
    page.drawLine({ start: { x: M, y: at }, end: { x: right, y: at }, thickness, color });

  // Title block, with the Execute mark at the right.
  text("Closing index", M, 28, f.serif, INK, y - 20);
  y -= 42;
  for (const line of wrap(f.clean(s.name), f.serif, 13, right - M - 60)) {
    text(line, M, 13, f.serif, STONE);
    y -= 16;
  }
  const mk = 22 / 32;
  const mx = right - 22;
  const my = A4[1] - M - 22;
  for (const [x, yy, w, h, signed] of [[6, 5, 4, 22, false], [11.5, 5, 15, 4, false], [11.5, 14, 11, 4, false], [11.5, 23, 15, 4, true]] as const) {
    page.drawRectangle({ x: mx + x * mk, y: my + (32 - yy - h) * mk, width: w * mk, height: h * mk, color: signed ? OXBLOOD : INK });
  }
  y -= 4;
  rule(y, 1.2, INK);
  y -= 26;

  // Facts row.
  const partyCount = new Set(s.documents.flatMap((d) => copyParties(d))).size;
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const facts: [string, string][] = [
    [String(s.documents.length), s.documents.length === 1 ? "document" : "documents"],
    [String(partyCount), partyCount === 1 ? "party" : "parties"],
    [String(included.length), included.length === 1 ? "executed copy" : "executed copies"],
    [date, "prepared"],
  ];
  const factW = (right - M) / facts.length;
  facts.forEach(([value, name], i) => {
    text(value, M + i * factW, 13, f.bold, INK, y);
    text(name, M + i * factW, 7.5, f.sans, STONE, y - 12);
  });
  y -= 40;

  const cols = [
    { label: "", x: M, w: 14 },
    { label: "Party", x: M + 16, w: 132 },
    { label: "Copy", x: M + 154, w: 60 },
    { label: "Stamp paper", x: M + 218, w: 116 },
    { label: "File name", x: M + 340, w: right - (M + 340) },
  ];
  const byDoc = new Map<string, IndexEntry[]>();
  for (const e of included) byDoc.set(e.docId, [...(byDoc.get(e.docId) ?? []), e]);
  const left: string[] = [];

  s.documents.forEach((d, i) => {
    const entries = byDoc.get(d.id) ?? [];
    const signers = [...new Set(Object.values(d.sigPages).flat())];
    const signedCount = signers.filter((p) => signedFor(s, d.id, p).length).length;
    for (const partyId of copyParties(d)) {
      if (entries.some((e) => e.partyId === partyId)) continue;
      const st = copyStatus(s, d, partyId, flags);
      const why = st.problems.length
        ? "a stamp paper or page to fix"
        : [
            ...(st.awaitingSigned.length
              ? [`the signed ${st.awaitingSigned.length === 1 ? "page" : "pages"} from ${st.awaitingSigned.map((p) => partyName(s, p)).join(", ")}`]
              : []),
            ...(st.awaitingStamp ? ["a stamp paper"] : []),
          ].join(" and ") || "not downloaded";
      left.push(`${partyName(s, partyId)} (${d.title}): ${st.problems.length ? why : `awaiting ${why}`}.`);
    }
    if (!entries.length) return;

    ensure(70);
    const head = `${i + 1} · ${d.title}`;
    text(head, M, 14, f.serif);
    const meta = `${d.pageCount} pages · ${signedCount} of ${signers.length} parties signed`;
    text(meta, right - f.sans.widthOfTextAtSize(f.clean(meta), 8), 8, f.sans, STONE, y + 1);
    y -= 8;
    rule(y);
    y -= 14;
    cols.forEach((c) => label(c.label, c.x));
    y -= 10;

    entries.forEach((e, n) => {
      const stamps = stampsFor(s, d.id, e.partyId);
      const stampText = stamps
        .map((r) => [r.estamp?.certificateNo ?? r.fileName, r.estamp?.amount ? `Rs. ${r.estamp.amount}` : null].filter(Boolean).join(" · "))
        .join("\n");
      const cells = [
        String(n + 1),
        partyName(s, e.partyId),
        d.copies[e.partyId] === "original" ? "Original" : "Counterpart",
        stampText || "-",
        e.fileName,
      ];
      const lines = cells.map((c, k) => wrap(c.split("\n").map((l) => f.clean(l).replace(/ {2,}/g, " ")).join("\n"), f.sans, 8.5, cols[k].w));
      const h = Math.max(...lines.map((l) => l.length)) * 11 + 8;
      ensure(h);
      page.drawLine({ start: { x: M, y: y + 9 }, end: { x: right, y: y + 9 }, thickness: 0.4, color: RULE });
      lines.forEach((ls, k) =>
        ls.forEach((l, j) => page.drawText(l, { x: cols[k].x, y: y - j * 11, size: 8.5, font: f.sans, color: k === 0 ? RULE_STRONG : INK })),
      );
      y -= h;
    });
    y -= 18;
  });

  if (left.length) {
    ensure(40);
    text("Not included", M, 12, f.serif);
    y -= 8;
    rule(y);
    y -= 14;
    for (const line of left) {
      const ls = wrap(f.clean(line), f.sans, 8.5, right - M);
      ensure(ls.length * 11 + 4);
      ls.forEach((l) => {
        text(l, M, 8.5, f.sans, STONE);
        y -= 11;
      });
      y -= 3;
    }
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M }, end: { x: right, y: M }, thickness: 0.4, color: RULE });
    p.drawText(f.clean(FOOTER), { x: M, y: M - 12, size: 7, font: f.sans, color: STONE });
    const n = `Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: right - f.sans.widthOfTextAtSize(n, 7), y: M - 12, size: 7, font: f.sans, color: STONE });
  });
  return doc.save();
}
