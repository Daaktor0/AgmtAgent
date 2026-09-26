/**
 * PWC-38 story fixtures. Independent of packed PEE rule cases.
 */
import JSZip from "jszip";
import { buildDocx } from "../../docx.ts";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";
const OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function packageOf(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, xml] of Object.entries(files)) {
    zip.file(name, xml, { date: new Date(0), createFolders: false });
  }
  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "STORE" }));
}

export const HEADER_TYPO_SENTENCE = "Please recieve the execution copy of this agreement today.";
export const HEADER_CLEAN_SENTENCE = "Please receive the execution copy of this agreement today.";
export const BODY_CLEAN = "The Company shall deliver the notice in writing before completion.";
export const FOOTNOTE_TYPO = "Please recieve the footnote notice in writing today.";

export async function headerTypoDocx(): Promise<Buffer> {
  return buildDocx([BODY_CLEAN], { header: HEADER_TYPO_SENTENCE });
}

export async function headerCleanDocx(): Promise<Buffer> {
  return buildDocx([BODY_CLEAN], { header: HEADER_CLEAN_SENTENCE });
}

export async function sharedHeaderDocx(): Promise<Buffer> {
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="${W}"><w:p><w:r><w:t xml:space="preserve">${escapeXml(HEADER_TYPO_SENTENCE)}</w:t></w:r></w:p></w:hdr>`;
  return packageOf({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${TYPES}">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELS}">
<Relationship Id="rId1" Type="${OFFICE}/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELS}">
<Relationship Id="rIdHdr" Type="${OFFICE}/header" Target="header1.xml"/>
</Relationships>`,
    "word/header1.xml": header,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>
<w:p><w:r><w:t xml:space="preserve">${escapeXml(BODY_CLEAN)}</w:t></w:r></w:p>
<w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/></w:sectPr></w:pPr></w:p>
<w:p><w:r><w:t xml:space="preserve">The Buyer shall keep the records with the file after completion.</w:t></w:r></w:p>
<w:sectPr><w:headerReference w:type="even" r:id="rIdHdr"/></w:sectPr>
</w:body></w:document>`,
  });
}

export async function footnoteSeparatorDocx(): Promise<Buffer> {
  return packageOf({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${TYPES}">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELS}">
<Relationship Id="rId1" Type="${OFFICE}/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELS}">
<Relationship Id="rIdFootnotes" Type="${OFFICE}/footnotes" Target="footnotes.xml"/>
</Relationships>`,
    "word/footnotes.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="${W}">
<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
<w:footnote w:id="1"><w:p><w:r><w:t xml:space="preserve">${escapeXml(FOOTNOTE_TYPO)}</w:t></w:r></w:p></w:footnote>
</w:footnotes>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>
<w:p><w:r><w:t xml:space="preserve">${escapeXml(BODY_CLEAN)}</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p>
<w:sectPr/>
</w:body></w:document>`,
  });
}

export async function emptyHeaderDocx(): Promise<Buffer> {
  return buildDocx([BODY_CLEAN], { header: " " });
}
