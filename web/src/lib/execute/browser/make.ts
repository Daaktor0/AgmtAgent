/**
 * Browser side of making signature pages: reading who signs from the stored
 * agreement, and reading a lawyer's PDF template (its text, where each run
 * sits, and in what font). Everything stays on this device.
 */
import { layoutSegments, type TextItem } from "../detect.ts";
import { pageItems } from "../extract.ts";
import { fontStyle, guessSampleName, type StyledItem } from "../generate.ts";
import { agreementName, namesFromSchedule, readPartiesClause, refLabel, signatureFooter, type ClauseEntry } from "../parties.ts";
import { countPages } from "../render.ts";
import { IntakeError, isPdf } from "./intake.ts";
import { openPdf } from "./pdf.ts";

export type FoundParty = { name: string; group: string | null };

export type FoundParties = {
  parties: FoundParty[];
  /** The footer for plain pages, naming the agreement and its parties. Never a date. */
  footer: string;
  /** Nothing like a parties clause was found. */
  empty: boolean;
  /** A group was named ("the Investors") but its schedule had no readable names. */
  unreadGroups: string[];
};

/** Who signs, from the agreement's parties clause and any schedule it points to. */
export async function readAgreementParties(bytes: Uint8Array, fallbackTitle: string): Promise<FoundParties> {
  const pdf = await openPdf(bytes);
  try {
    const items: TextItem[][] = [];
    for (let n = 1; n <= pdf.numPages; n += 1) items.push(await pageItems(pdf, n));
    const texts = items.map((i) => layoutSegments(i).map((s) => s.text).join("\n"));
    const clause = readPartiesClause(texts);
    const title = agreementName(texts, fallbackTitle);
    if (!clause) return { parties: [], footer: signatureFooter(title, []), empty: true, unreadGroups: [] };
    const parties: FoundParty[] = [];
    const unreadGroups: string[] = [];
    const footerParties: Parameters<typeof signatureFooter>[1] = [];
    for (const entry of clause.entries as ClauseEntry[]) {
      if (entry.type === "named") {
        parties.push({ name: entry.name, group: null });
        footerParties.push({ name: entry.name });
        continue;
      }
      const label = `${entry.term ?? "Parties"} · ${refLabel(entry.ref)}`;
      const names = namesFromSchedule(items, texts, entry.ref, clause.pageIndex);
      if (!names.length) unreadGroups.push(label);
      for (const name of names) parties.push({ name, group: label });
      footerParties.push({ name: "", group: { term: entry.term, ref: entry.ref } });
    }
    return { parties, footer: signatureFooter(title, footerParties), empty: false, unreadGroups };
  } finally {
    void pdf.destroy();
  }
}

export type ReadTemplate = {
  bytes: Uint8Array;
  pageIndex: number;
  pageCount: number;
  items: StyledItem[];
  width: number;
  text: string;
  guess: string | null;
};

/** A signature page template from a dropped file. */
export async function readTemplate(file: File): Promise<ReadTemplate> {
  if (!isPdf(file)) throw new IntakeError(`“${file.name}” is not a PDF. Export your signature page from Word as PDF and add it again.`);
  if (file.size > 20 * 1024 * 1024) throw new IntakeError(`“${file.name}” is larger than 20 MB. A signature page template should be one page.`);
  return readTemplateBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

/** A signature page template: the first page that has text on it. */
export async function readTemplateBytes(bytes: Uint8Array, fileName: string): Promise<ReadTemplate> {
  const file = { name: fileName };
  const pageCount = await countPages({ type: "pdf", bytes }, file.name);
  const pdf = await openPdf(bytes);
  try {
    for (let n = 1; n <= Math.min(pdf.numPages, 5); n += 1) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      // Fonts are known only once the page's drawing instructions are read.
      await page.getOperatorList();
      const items: StyledItem[] = [];
      for (const raw of content.items) {
        if (!("str" in raw)) continue;
        const [a, b, c, d, e, f] = raw.transform as number[];
        const font = page.commonObjs.has(raw.fontName) ? (page.commonObjs.get(raw.fontName) as { name?: string; bold?: boolean; italic?: boolean }) : null;
        items.push({
          str: raw.str,
          x: e,
          y: f,
          width: raw.width,
          height: raw.height || Math.hypot(c, d) || Math.hypot(a, b),
          style: fontStyle(font, content.styles[raw.fontName]?.fontFamily),
        });
      }
      const width = page.getViewport({ scale: 1 }).width;
      page.cleanup();
      const text = layoutSegments(items).map((s) => s.text).join("\n");
      if (text.trim().length < 10) continue;
      return { bytes, pageIndex: n - 1, pageCount, items, width, text, guess: guessSampleName(items) };
    }
    throw new IntakeError(`“${file.name}” has no text Agmt can read (it may be a scan). Export the signature page from Word as PDF and add it again.`);
  } finally {
    void pdf.destroy();
  }
}
