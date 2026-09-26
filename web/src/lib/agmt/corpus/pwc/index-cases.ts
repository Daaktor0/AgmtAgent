/**
 * Independently labelled PEE-02 index cases.
 * Expected inventories are authored here, not copied from engine output.
 */
import JSZip from "jszip";
import { buildDocx } from "../../docx.ts";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DETERMINISTIC_ZIP_DATE = new Date(0);

export const INDEX_CASES_VERSION = "proof-index-cases-v1";

export type IndexCase = {
  id: string;
  paragraphs: string[];
  tableRows?: string[][];
  expected: {
    clauseLabels: readonly { scopePrefix: string; label: string }[];
    scheduleLabels: readonly string[];
    missing: readonly { scopePrefix: string; label: string }[];
    importedTerms: readonly string[];
    localTerms: readonly string[];
    range?: { rawIncludes: string; endpoints: readonly string[] };
    coordinated?: { rawIncludes: string; endpoints: readonly string[] };
    externalRawIncludes?: readonly string[];
    relativeRawIncludes?: readonly string[];
    parties?: readonly string[];
    ambiguousDates?: readonly string[];
    parsedDates?: readonly string[];
    amounts?: readonly string[];
    percentages?: readonly string[];
  };
};

export const INDEX_CASES: readonly IndexCase[] = Object.freeze([
  {
    id: "schedule_restart",
    paragraphs: [
      "1. The Company shall deliver notice under this Agreement.",
      "2. The Company shall pay interest on overdue amounts.",
      "SCHEDULE 1",
      "1. The Company shall keep records of each notice.",
      "2. The Company shall provide access to those records.",
    ],
    expected: {
      clauseLabels: [
        { scopePrefix: "main_body", label: "1" },
        { scopePrefix: "main_body", label: "2" },
        { scopePrefix: "schedule:1", label: "1" },
        { scopePrefix: "schedule:1", label: "2" },
      ],
      scheduleLabels: ["1"],
      missing: [],
      importedTerms: [],
      localTerms: [],
    },
  },
  {
    id: "reserved_number",
    paragraphs: [
      "1. First operative clause.",
      "2. Second operative clause.",
      "4. Fourth operative clause, number 3 reserved.",
    ],
    expected: {
      clauseLabels: [
        { scopePrefix: "main_body", label: "1" },
        { scopePrefix: "main_body", label: "2" },
        { scopePrefix: "main_body", label: "4" },
      ],
      scheduleLabels: [],
      missing: [{ scopePrefix: "main_body", label: "3" }],
      importedTerms: [],
      localTerms: [],
    },
  },
  {
    id: "imported_definition",
    paragraphs: [
      '1. "Confidential Information" has the meaning given in the NDA.',
      '2. "Notice" means a written notice under this Agreement.',
    ],
    expected: {
      clauseLabels: [
        { scopePrefix: "main_body", label: "1" },
        { scopePrefix: "main_body", label: "2" },
      ],
      scheduleLabels: [],
      missing: [],
      importedTerms: ["Confidential Information"],
      localTerms: ["Notice"],
    },
  },
  {
    id: "range_and_coordinated",
    paragraphs: [
      "1.1 First subclause.",
      "1.2 Second subclause.",
      "1.3 Third subclause.",
      "1.4 Fourth subclause.",
      "2. The Company shall act under Clauses 1.2 to 1.4.",
      "3. The Company shall act under Clause 1.2 and 1.5.",
    ],
    expected: {
      clauseLabels: [
        { scopePrefix: "main_body", label: "1.1" },
        { scopePrefix: "main_body", label: "1.2" },
        { scopePrefix: "main_body", label: "1.3" },
        { scopePrefix: "main_body", label: "1.4" },
        { scopePrefix: "main_body", label: "2" },
        { scopePrefix: "main_body", label: "3" },
      ],
      scheduleLabels: [],
      missing: [{ scopePrefix: "main_body", label: "1.5" }],
      importedTerms: [],
      localTerms: [],
      range: { rawIncludes: "Clauses 1.2 to 1.4", endpoints: ["1.2", "1.4"] },
      coordinated: { rawIncludes: "Clause 1.2 and 1.5", endpoints: ["1.2", "1.5"] },
    },
  },
  {
    id: "external_and_relative",
    paragraphs: [
      "1. Section 42 of the Companies Act, 2013 applies.",
      "2. The Company shall comply with this Clause.",
    ],
    expected: {
      clauseLabels: [
        { scopePrefix: "main_body", label: "1" },
        { scopePrefix: "main_body", label: "2" },
      ],
      scheduleLabels: [],
      missing: [],
      importedTerms: [],
      localTerms: [],
      externalRawIncludes: ["Section 42"],
      relativeRawIncludes: ["this Clause"],
    },
  },
  {
    id: "cross_scope_same_number",
    paragraphs: [
      "1. The Company shall act under Clause 3.",
      "SCHEDULE 1",
      "3. Local schedule obligation.",
    ],
    expected: {
      clauseLabels: [
        { scopePrefix: "main_body", label: "1" },
        { scopePrefix: "schedule:1", label: "3" },
      ],
      scheduleLabels: ["1"],
      missing: [{ scopePrefix: "main_body", label: "3" }],
      importedTerms: [],
      localTerms: [],
    },
  },
  {
    id: "definition_in_table",
    paragraphs: ["The operative clauses follow."],
    tableRows: [['"Services" means the services listed in Schedule 1.']],
    expected: {
      clauseLabels: [],
      scheduleLabels: [],
      missing: [],
      importedTerms: [],
      localTerms: ["Services"],
    },
  },
  {
    id: "parties_and_figures",
    paragraphs: [
      'This Agreement is between Example Purchaser Limited ("Purchaser") and Example Seller Limited ("Seller").',
      '"Purchaser" means Example Purchaser Limited.',
      "Completion shall occur on 03/04/2026.",
      "Longstop is 23 April 2026.",
      "The fee is £1,000 and interest is 10%.",
    ],
    expected: {
      clauseLabels: [],
      scheduleLabels: [],
      missing: [],
      importedTerms: [],
      localTerms: ["Purchaser", "Seller"],
      parties: ["Purchaser", "Seller"],
      ambiguousDates: ["03/04/2026"],
      parsedDates: ["23 April 2026"],
      amounts: ["£1,000"],
      percentages: ["10%"],
    },
  },
]);

export async function indexCaseBytes(id: string): Promise<Buffer> {
  const spec = INDEX_CASES.find((item) => item.id === id);
  if (!spec) throw new Error(`unknown_index_case:${id}`);
  return buildDocx(spec.paragraphs, spec.tableRows ? { tableRows: spec.tableRows } : undefined);
}

export async function numberedListBytes(): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await buildDocx(["The Provider shall perform the Services.", "The Provider shall issue a report."]));
  zip.file(
    "word/numbering.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
    { date: DETERMINISTIC_ZIP_DATE },
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">The Provider shall perform the Services.</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">The Provider shall issue a report.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
    { date: DETERMINISTIC_ZIP_DATE },
  );
  const contentTypes = await zip.file("[Content_Types].xml")!.async("string");
  if (!contentTypes.includes("numbering.xml")) {
    zip.file(
      "[Content_Types].xml",
      contentTypes.replace(
        "</Types>",
        '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>',
      ),
      { date: DETERMINISTIC_ZIP_DATE },
    );
  }
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  if (!rels.includes("numbering.xml")) {
    zip.file(
      "word/_rels/document.xml.rels",
      rels.replace(
        "</Relationships>",
        '<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>',
      ),
      { date: DETERMINISTIC_ZIP_DATE },
    );
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
