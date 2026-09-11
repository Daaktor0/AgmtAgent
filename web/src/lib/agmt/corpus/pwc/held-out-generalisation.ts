/**
 * Held-out labelled documents for spelling and punctuation generalisation.
 * Words are not copied into the typo allowlist to make this set pass.
 */
import JSZip from "jszip";
import { buildDocx } from "../../docx.ts";
import type { LaunchRuleId } from "../../proof/contracts.ts";

export const HELD_OUT_VERSION = "proof-held-out-generalisation-v1";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export type HeldOutExpect = {
  ruleId: LaunchRuleId;
  quote: string;
  kind: "correction" | "comment";
};

export type HeldOutDocument = {
  id: string;
  genre: "agreement" | "letter" | "notice" | "prose" | "clean" | "table" | "revision" | "split_runs";
  paragraphs?: string[];
  bytes?: () => Promise<Buffer>;
  expected: HeldOutExpect[];
  forbiddenQuotes: string[];
};

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const HELD_OUT_DOCUMENTS: readonly HeldOutDocument[] = [
  {
    id: "agreement_mixed",
    genre: "agreement",
    paragraphs: [
      "THIS AGREEMENT is made on 1 March 2026 between the Supplier and the Buyer.",
      "The Supplier shall deliver the maintainance schedule in writing.",
      "The Buyer must pay,, the outstanding amount immediately.",
      "Northwind Traders Limited shall keep the Confidential Information.",
      "The Supplier shall organise the colour notice under this agreement.",
    ],
    expected: [
      { ruleId: "spelling.dictionary", quote: "maintainance", kind: "comment" },
      { ruleId: "punctuation.duplicate_mark", quote: ",,", kind: "correction" },
    ],
    forbiddenQuotes: ["Northwind", "Traders", "Limited", "Confidential", "organise", "colour", "Agreement"],
  },
  {
    id: "letter_mixed",
    genre: "letter",
    paragraphs: [
      "Dear Ms Patel,",
      "Please find the questionaire attached for the review meeting.",
      "Kindly return the form before Friday this week.",
      "Yours sincerely,",
      "Jordan Blake",
    ],
    expected: [
      { ruleId: "spelling.dictionary", quote: "questionaire", kind: "comment" },
    ],
    forbiddenQuotes: ["Patel", "Jordan", "Blake", "Friday"],
  },
  {
    id: "notice_mixed",
    genre: "notice",
    paragraphs: [
      "NOTICE TO THE BUYER",
      "The Buyer must yeild the keys on completion of the sale.",
      "The Buyer must pay , the deposit immediately after notice.",
      "The amount is 3.14 percent of the price stated below.",
      "Please wait... then collect the papers from the office.",
    ],
    expected: [
      { ruleId: "spelling.dictionary", quote: "yeild", kind: "comment" },
      { ruleId: "punctuation.space_before", quote: " ,", kind: "correction" },
    ],
    forbiddenQuotes: ["3.14", "...", "NOTICE"],
  },
  {
    id: "prose_mixed",
    genre: "prose",
    paragraphs: [
      "This note records the millenium review meeting for the file.",
      "Please send the rythm report with the minutes.",
      "The team will keep the Company's records with the file.",
      "Further work is to follow after the meeting on Monday.",
    ],
    expected: [
      { ruleId: "spelling.dictionary", quote: "millenium", kind: "comment" },
      { ruleId: "spelling.dictionary", quote: "rythm", kind: "comment" },
    ],
    forbiddenQuotes: ["Company's", "Monday", "Further"],
  },
  {
    id: "clean_prose",
    genre: "clean",
    paragraphs: [
      "The Company shall deliver the notice in writing.",
      "Please send the colour certificate to the buyer.",
      "The Buyer must pay the amount, then file the report.",
      "See Clause 1.1 and the figure of 3.14 percent.",
      "The Company shall use e.g. the attached form.",
      "Mr. Smith shall notify the Buyer before completion.",
    ],
    expected: [],
    forbiddenQuotes: ["colour", "Clause", "3.14", "e.g", "Smith"],
  },
  {
    id: "clean_names",
    genre: "clean",
    paragraphs: [
      "Zyxxco Blorple Limited shall keep the Confidential Information.",
      "Please visit https://example.com/recieve for the file copy.",
      "The Company shall use \"goverment\" only as a quoted example.",
    ],
    expected: [],
    forbiddenQuotes: ["Zyxxco", "Blorple", "recieve", "goverment"],
  },
];

export async function heldOutBytes(doc: HeldOutDocument): Promise<Buffer> {
  if (doc.bytes) return doc.bytes();
  return buildDocx(doc.paragraphs ?? []);
}

export async function tableSpacingDocument(): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await buildDocx(["The Company shall deliver the notice."]));
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>`
    + `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid>`
    + `<w:tr><w:tc><w:tcPr><w:tcW w:w="9000" w:type="dxa"/></w:tcPr>`
    + `<w:p><w:r><w:t xml:space="preserve">${escapeXml("Name    Amount    Date")}</w:t></w:r></w:p>`
    + `</w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`,
    { date: new Date(0) },
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function splitRunSpellingDocument(): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await buildDocx(["The Company shall calender the notice."]));
  const xml = await zip.file("word/document.xml")!.async("string");
  zip.file(
    "word/document.xml",
    xml.replace(
      ">The Company shall calender the notice.<",
      ">The Company shall cal</w:t></w:r><w:r><w:t xml:space=\"preserve\">ender the notice.<",
    ),
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function revisionHeldOutDocument(): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await buildDocx(["The Company shall seperate the assets on completion."]));
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>`
    + `<w:p><w:r><w:t xml:space="preserve">${escapeXml("The Company shall seperate the assets on completion.")}</w:t></w:r></w:p>`
    + `<w:p><w:ins w:id="7" w:author="Prior Reviewer" w:date="2026-01-01T00:00:00Z"><w:r><w:t xml:space="preserve">${escapeXml("The Company shall occured the inserted notice.")}</w:t></w:r></w:ins></w:p>`
    + `<w:sectPr/></w:body></w:document>`,
    { date: new Date(0) },
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
