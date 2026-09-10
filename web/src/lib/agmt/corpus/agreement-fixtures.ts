/**
 * Representative complete-agreement fixtures for capacity measurement.
 *
 * Page counts are descriptive Word-page targets (PAGE_CHARS_PER_PAGE), not
 * admission criteria. Fixtures are synthetic. Labelled errors are planted
 * independently of engine output.
 */
import JSZip from "jszip";
import { PAGE_CHARS_PER_PAGE } from "../config.ts";
import { DocxPackage, uncompressedXmlBytes } from "../docx-package.ts";
import { EXTRACTED_TEXT_LIMIT, projectPart } from "../projection.ts";
import type { ZipLimitSet } from "../zip-safety.ts";
import { XMLParser } from "fast-xml-parser";
import type { XmlNode } from "../source-map.ts";
import { DEMO_EXPECTED, DEMO_SENTENCE, launchFixture } from "./launch-fixtures.ts";

export const AGREEMENT_PAGE_TARGETS = [25, 75, 150, 300] as const;
export type AgreementPageTarget = (typeof AGREEMENT_PAGE_TARGETS)[number];
export type AgreementKind = "clean" | "labelled";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";

const FILLER =
  "The Company shall deliver notice under Clause 1.1 and shall comply with Schedule 1 in connection with Company business. ";

const orderedParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
});

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const RPR = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="en-GB"/></w:rPr>';
const PPR = `<w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/>${RPR}</w:pPr>`;

function run(text: string, properties = RPR): string {
  return `<w:r>${properties}<w:t xml:space="preserve">${escape(text)}</w:t></w:r>`;
}

function paragraph(text: string, properties = RPR): string {
  return `<w:p>${PPR}${run(text, properties)}</w:p>`;
}

function heading(text: string): string {
  return paragraph(text, '<w:rPr><w:b/><w:sz w:val="28"/><w:rFonts w:ascii="Times New Roman"/><w:lang w:val="en-GB"/></w:rPr>');
}

function pageBreak(): string {
  return "<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>";
}

function tinyPng(): Uint8Array {
  const out = new Uint8Array(4096);
  for (let index = 0; index < out.byteLength; index += 1) out[index] = (index * 73 + 19) & 0xff;
  out[0] = 0x89;
  out[1] = 0x50;
  out[2] = 0x4e;
  out[3] = 0x47;
  return out;
}

function drawing(): string {
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="Schedule emblem"/><a:graphic><a:graphicData uri="${PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function scheduleTable(rows: number): string {
  const body: string[] = [];
  body.push("<w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Description</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Amount</w:t></w:r></w:p></w:tc></w:tr>");
  for (let row = 1; row <= rows; row += 1) {
    body.push(
      `<w:tr><w:tc><w:p><w:r><w:t>S1-${row}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t xml:space="preserve">Services described in Clause 1.1 and Schedule 1 of this Agreement.</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${(row * 250) % 9000}.00</w:t></w:r></w:p></w:tc></w:tr>`,
    );
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${body.join("")}</w:tbl>`;
}

export type AgreementFixtureMeta = {
  pagesTarget: AgreementPageTarget;
  kind: AgreementKind;
  estimatedPages: number;
  visibleCodePoints: number;
  paragraphCount: number;
  tableCount: number;
  existingRevisionCount: number;
  existingCommentCount: number;
  planted: typeof DEMO_EXPECTED | [];
};

export type AgreementFixture = {
  bytes: Uint8Array;
  meta: AgreementFixtureMeta;
};

function buildBody(pages: AgreementPageTarget, kind: AgreementKind): { xml: string; meta: AgreementFixtureMeta } {
  const parts: string[] = [];
  let visible = 0;
  let paragraphs = 0;
  let lastBreakAt = 0;
  const targetChars = pages * PAGE_CHARS_PER_PAGE;

  const pushParagraph = (xml: string, text: string): void => {
    parts.push(xml);
    paragraphs += 1;
    visible += [...text].length;
    if (visible - lastBreakAt >= PAGE_CHARS_PER_PAGE && visible < targetChars) {
      parts.push(pageBreak());
      lastBreakAt = visible;
    }
  };

  pushParagraph(heading("Services Agreement"), "Services Agreement");
  pushParagraph(
    paragraph('This Agreement is between Example Limited ("Company") and Counterpart Limited ("Supplier").'),
    'This Agreement is between Example Limited ("Company") and Counterpart Limited ("Supplier").',
  );
  pushParagraph(
    paragraph("The parties have agreed the terms set out in this Agreement, including Schedule 1."),
    "The parties have agreed the terms set out in this Agreement, including Schedule 1.",
  );
  pushParagraph(heading("1. Definitions and interpretation"), "1. Definitions and interpretation");
  pushParagraph(
    paragraph('1.1 "Agreement" means this agreement including Schedule 1.'),
    '"Agreement" means this agreement including Schedule 1.',
  );
  pushParagraph(
    paragraph('1.2 "Company" means Example Limited.'),
    '"Company" means Example Limited.',
  );
  pushParagraph(
    paragraph("1.3 Clause 1.1 and Clause 1.2 apply to the whole of this Agreement."),
    "1.3 Clause 1.1 and Clause 1.2 apply to the whole of this Agreement.",
  );
  pushParagraph(heading("2. Services"), "2. Services");
  if (kind === "labelled") {
    pushParagraph(paragraph(DEMO_SENTENCE), DEMO_SENTENCE);
  } else {
    pushParagraph(
      paragraph("2.1 The Company shall receive notice under Clause 1.1 by the date in Schedule 1."),
      "2.1 The Company shall receive notice under Clause 1.1 by the date in Schedule 1.",
    );
  }
  pushParagraph(
    paragraph("2.2 The Supplier shall perform the services described in Schedule 1."),
    "2.2 The Supplier shall perform the services described in Schedule 1.",
  );
  pushParagraph(
    paragraph("2.3 Defined terms in Clause 1.1 have the meaning given in this Agreement."),
    "2.3 Defined terms in Clause 1.1 have the meaning given in this Agreement.",
  );
  pushParagraph(heading("Schedule 1"), "Schedule 1");
  parts.push(drawing());
  const tableRows = Math.max(12, Math.min(80, pages));
  parts.push(scheduleTable(tableRows));
  paragraphs += 1;
  visible += tableRows * 48;

  parts.push(
    `<w:p><w:commentRangeStart w:id="0"/>${run("Unrelated prior review.")}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r><w:ins w:id="7" w:author="Prior Reviewer" w:date="2026-01-01T00:00:00Z">${run(" Added earlier.")}</w:ins><w:del w:id="8" w:author="Prior Reviewer" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>Removed earlier.</w:delText></w:r></w:del></w:p>`,
  );
  paragraphs += 1;
  visible += [..."Unrelated prior review. Added earlier."].length;

  let clause = 3;
  while (visible < targetChars) {
    const n = clause;
    clause += 1;
    const text = `${n}.1 ${FILLER}Ref ${n}-${(n * 7919) % 9973}.`;
    if (n % 7 === 0) {
      parts.push(
        `<w:p>${PPR}<w:ins w:id="${1000 + n}" w:author="Prior Reviewer" w:date="2026-01-01T00:00:00Z">${run(`Added ${n}. `)}</w:ins><w:del w:id="${2000 + n}" w:author="Prior Reviewer" w:date="2026-01-01T00:00:00Z"><w:r>${RPR}<w:delText>Removed ${n}.</w:delText></w:r></w:del>${run(text)}</w:p>`,
      );
      paragraphs += 1;
      visible += [...text].length + 16;
      if (visible - lastBreakAt >= PAGE_CHARS_PER_PAGE && visible < targetChars) {
        parts.push(pageBreak());
        lastBreakAt = visible;
      }
    } else {
      pushParagraph(paragraph(text), text);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"><w:body>${parts.join("")}<w:sectPr/></w:body></w:document>`;
  return {
    xml,
    meta: {
      pagesTarget: pages,
      kind,
      estimatedPages: Math.ceil(visible / PAGE_CHARS_PER_PAGE),
      visibleCodePoints: visible,
      paragraphCount: paragraphs,
      tableCount: 1,
      existingRevisionCount: (xml.match(/<w:ins\b/g) ?? []).length + (xml.match(/<w:del\b/g) ?? []).length,
      existingCommentCount: 1,
      planted: kind === "labelled" ? DEMO_EXPECTED : [],
    },
  };
}

export async function completeAgreementFixture(
  pages: AgreementPageTarget,
  kind: AgreementKind,
): Promise<AgreementFixture> {
  const zip = await JSZip.loadAsync(await launchFixture("prior_review"));
  const { xml, meta } = buildBody(pages, kind);
  zip.file("word/document.xml", xml, { compression: "STORE", date: new Date(0) });
  zip.file("word/media/image1.png", tinyPng(), { compression: "STORE", date: new Date(0), createFolders: false });
  const types = await zip.file("[Content_Types].xml")!.async("string");
  const withPng = types.includes('Extension="png"')
    ? types
    : types.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
  zip.file("[Content_Types].xml", withPng, { date: new Date(0) });
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  const withImage = rels.includes("rIdImage")
    ? rels
    : rels.replace(
      "</Relationships>",
      '<Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>',
    );
  zip.file("word/_rels/document.xml.rels", withImage, { date: new Date(0) });
  zip.file(
    "docProps/app.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Pages>${pages}</Pages></Properties>`,
    { date: new Date(0) },
  );
  const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
  return { bytes, meta };
}

export type PackageCapacitySnapshot = {
  sourceZipBytes: number;
  expandedBytes: number;
  entries: number;
  documentXmlBytes: number;
  totalXmlBytes: number;
  extractedCodePoints: number | null;
  extractedGate: "ok" | "extracted_text_limit";
  paragraphCount: number;
  tableCount: number;
  revisionCount: number;
  commentAnchorCount: number;
  xmlAdmitGate: "ok" | "package_too_complex";
};

export function packageCapacitySnapshot(bytes: Uint8Array, policy: {
  zip: ZipLimitSet;
  maxDocumentXmlBytes: number;
  maxTotalXmlBytes: number;
}): PackageCapacitySnapshot {
  const pkg = DocxPackage.open(bytes, { limits: policy.zip, verify: false });
  const xmlBytes = uncompressedXmlBytes(pkg.directory);
  const documentXml = pkg.text("word/document.xml");
  const xmlAdmitGate = xmlBytes.documentXml > policy.maxDocumentXmlBytes || xmlBytes.totalXml > policy.maxTotalXmlBytes
    ? "package_too_complex"
    : "ok";
  let extractedCodePoints: number | null = null;
  let extractedGate: "ok" | "extracted_text_limit" = "ok";
  let paragraphCount = 0;
  try {
    const tree = orderedParser.parse(documentXml) as XmlNode[];
    const story = projectPart({
      xml: documentXml,
      tree,
      partUri: "/word/document.xml",
      storyKind: "body",
      storyId: "body:main",
    });
    paragraphCount = story.paragraphs.length;
    extractedCodePoints = story.paragraphs.reduce((count, paragraph) => count + [...paragraph.text].length, 0);
  } catch (error) {
    if (error instanceof Error && error.message === "extracted_text_limit") {
      extractedGate = "extracted_text_limit";
      extractedCodePoints = EXTRACTED_TEXT_LIMIT + 1;
    } else {
      throw error;
    }
  }
  return {
    sourceZipBytes: bytes.byteLength,
    expandedBytes: pkg.directory.expandedBytes,
    entries: pkg.directory.entries.length,
    documentXmlBytes: xmlBytes.documentXml,
    totalXmlBytes: xmlBytes.totalXml,
    extractedCodePoints,
    extractedGate,
    paragraphCount,
    tableCount: (documentXml.match(/<w:tbl\b/g) ?? []).length,
    revisionCount: (documentXml.match(/<w:ins\b/g) ?? []).length + (documentXml.match(/<w:del\b/g) ?? []).length,
    commentAnchorCount: (documentXml.match(/<w:commentRangeStart\b/g) ?? []).length,
    xmlAdmitGate,
  };
}

export function classifyCapacityFailure(code: string): "source_size" | "xml_complexity" | "extracted_text" | "zip_safety" | "time" | "other" {
  if (code === "source_too_large" || code === "output_too_large") return "source_size";
  if (code === "package_too_complex") return "xml_complexity";
  if (code === "extracted_text_limit") return "extracted_text";
  if (
    code === "package_expanded_too_large"
    || code === "package_entry_too_large"
    || code === "suspicious_compression_ratio"
    || code === "zip64_unsupported"
    || code === "invalid_docx_zip"
  ) {
    return "zip_safety";
  }
  if (code === "proof_timeout") return "time";
  return "other";
}
