/**
 * Native OOXML extraction. python-docx is the SPEC source of truth on AgmtAgent;
 * this port uses JSZip + XML for the sandbox web app. No Docling, no OCR.
 */
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { ExtractedBlock, ExtractedDocument, SourceCapability } from "./types.ts";
import { FILE_BYTE_CAP } from "./config.ts";
import { estimatePageCount } from "./page-count.ts";

const DETERMINISTIC_ZIP_DATE = new Date(0);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: false,
  trimValues: false,
  parseTagValue: false,
});

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function asArray(v: unknown): Record<string, unknown>[] {
  if (v == null) return [];
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [v as Record<string, unknown>];
}

function walkText(node: unknown, acc: string[]): void {
  if (node == null) return;
  if (typeof node === "string") {
    acc.push(node);
    return;
  }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if (typeof o["#text"] === "string") acc.push(o["#text"]);
  // w:t
  if (o["w:t"] != null) walkText(o["w:t"], acc);
  if (o["w:tab"] != null) acc.push("\t");
  if (o["w:br"] != null) {
    const br = o["w:br"] as Record<string, string> | Record<string, string>[];
    const first = Array.isArray(br) ? br[0] : br;
    if (first && first["@_w:type"] === "page") acc.push("\n");
    else acc.push("\n");
  }
  if (o["w:cr"] != null) acc.push("\n");
  for (const [k, v] of Object.entries(o)) {
    if (k === "#text" || k.startsWith("@_")) continue;
    if (k === "w:t" || k === "w:tab" || k === "w:br" || k === "w:cr") continue;
    walkText(v, acc);
  }
}

function collectInstr(node: unknown, acc: string[]): void {
  if (node == null || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if (o["w:instrText"] != null) {
    const t: string[] = [];
    walkText(o["w:instrText"], t);
    acc.push(t.join(""));
  }
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("@_")) continue;
    collectInstr(v, acc);
  }
}

function hasPageBreak(node: unknown): boolean {
  if (node == null || typeof node !== "object") return false;
  const o = node as Record<string, unknown>;
  if (o["w:br"]) {
    for (const br of asArray(o["w:br"])) {
      if (br["@_w:type"] === "page") return true;
    }
  }
  if (o["w:lastRenderedPageBreak"] != null) return true;
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("@_")) continue;
    if (hasPageBreak(v)) return true;
  }
  return false;
}

const HIDDEN_RE = /[\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2060\u00AD\uFEFF]/g;
const HIDDEN_KIND: Record<string, string> = {
  "\u200B": "zero_width_space",
  "\u200C": "zero_width_non_joiner",
  "\u200D": "zero_width_joiner",
  "\u200E": "ltr_mark",
  "\u200F": "rtl_mark",
  "\u202A": "lre",
  "\u202B": "rle",
  "\u202C": "pdf",
  "\u202D": "lro",
  "\u202E": "rlo",
  "\u2060": "word_joiner",
  "\u00AD": "soft_hyphen",
  "\uFEFF": "bom",
};

function extractParagraph(
  p: Record<string, unknown>,
  index: number,
  path: string,
  isHeaderFooter: boolean,
  isTable: boolean,
): { block: ExtractedBlock; hidden: ExtractedDocument["hiddenChars"] } {
  const pPr = (p["w:pPr"] ?? {}) as Record<string, unknown>;
  const style = (pPr["w:pStyle"] ?? {}) as Record<string, string>;
  const styleId = style["@_w:val"] ?? null;
  const numPr = pPr["w:numPr"] as Record<string, unknown> | undefined;
  let numbering: string | null = null;
  if (numPr) {
    const ilvl = (numPr["w:ilvl"] as Record<string, string> | undefined)?.["@_w:val"];
    const numId = (numPr["w:numId"] as Record<string, string> | undefined)?.["@_w:val"];
    numbering = `${numId ?? ""}:${ilvl ?? ""}`;
  }
  const parts: string[] = [];
  walkText(p, parts);
  const text = parts.join("").replace(/\r/g, "");
  const hidden: ExtractedDocument["hiddenChars"] = [];
  HIDDEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HIDDEN_RE.exec(text))) {
    hidden.push({
      blockIndex: index,
      start: m.index,
      end: m.index + m[0].length,
      kind: HIDDEN_KIND[m[0]] ?? "hidden",
    });
  }
  const block: ExtractedBlock = {
    index,
    text,
    xmlAnchor: {
      kind: isHeaderFooter ? "header" : isTable ? "cell" : "paragraph",
      path,
    },
    styleId,
    numbering,
    isTable,
    isHeaderFooter,
    pageBreakBefore: hasPageBreak(p),
    sourceStart: 0,
    sourceEnd: 0,
  };
  return { block, hidden };
}

function paragraphsIn(node: unknown, path: string): { p: Record<string, unknown>; path: string }[] {
  const out: { p: Record<string, unknown>; path: string }[] = [];
  if (node == null || typeof node !== "object") return out;
  const o = node as Record<string, unknown>;
  if (o["w:p"]) {
    asArray(o["w:p"] as Record<string, unknown>).forEach((p, i) => {
      out.push({ p, path: `${path}/w:p[${i}]` });
    });
  }
  if (o["w:tbl"]) {
    asArray(o["w:tbl"] as Record<string, unknown>).forEach((tbl, ti) => {
      const rows = asArray(
        ((tbl as Record<string, unknown>)["w:tr"] ?? []) as Record<string, unknown>,
      );
      rows.forEach((tr, ri) => {
        const cells = asArray(
          ((tr as Record<string, unknown>)["w:tc"] ?? []) as Record<string, unknown>,
        );
        cells.forEach((tc, ci) => {
          out.push(
            ...paragraphsIn(tc, `${path}/w:tbl[${ti}]/w:tr[${ri}]/w:tc[${ci}]`).map((x) => ({
              ...x,
              p: { ...x.p, __table: true } as Record<string, unknown>,
            })),
          );
        });
      });
    });
  }
  if (o["w:sdt"]) {
    for (const sdt of asArray(o["w:sdt"] as Record<string, unknown>)) {
      const content = (sdt as Record<string, unknown>)["w:sdtContent"];
      out.push(...paragraphsIn(content, `${path}/w:sdt`));
    }
  }
  return out;
}

function parseXmlPart(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

export async function extractDocx(bytes: Buffer): Promise<ExtractedDocument> {
  if (bytes.byteLength > FILE_BYTE_CAP) {
    throw Object.assign(new Error("file_too_large"), { code: "file_too_large" });
  }
  if (bytes.subarray(0, 2).toString("utf8") !== "PK") {
    throw Object.assign(new Error("not_docx"), { code: "not_docx" });
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw Object.assign(new Error("corrupt"), { code: "corrupt" });
  }
  const names = Object.keys(zip.files);
  if (names.some((n) => n.toLowerCase().includes("vbaproject"))) {
    throw Object.assign(new Error("macro"), { code: "macro" });
  }
  if (names.some((n) => /encryptioninfo|encryptedpackage/i.test(n))) {
    throw Object.assign(new Error("encrypted"), { code: "encrypted" });
  }
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw Object.assign(new Error("not_docx"), { code: "not_docx" });
  }
  const docXml = await docFile.async("string");
  const doc = parseXmlPart(docXml);
  const document = (doc["w:document"] ?? doc) as Record<string, unknown>;
  const body = (document["w:body"] ?? document) as Record<string, unknown>;

  const blocks: ExtractedBlock[] = [];
  const hiddenChars: ExtractedDocument["hiddenChars"] = [];
  let idx = 0;
  const paras = paragraphsIn(body, "/w:document/w:body");
  for (const { p, path } of paras) {
    const isTable = Boolean((p as { __table?: boolean }).__table);
    const { block, hidden } = extractParagraph(p, idx, path, false, isTable);
    blocks.push(block);
    hiddenChars.push(...hidden);
    idx += 1;
  }

  const headersFooters: string[] = [];
  for (const name of names) {
    if (/word\/(header|footer)\d*\.xml$/.test(name)) {
      const xml = await zip.file(name)!.async("string");
      const parsed = parseXmlPart(xml);
      const hdr = (parsed["w:hdr"] ?? parsed["w:ftr"] ?? parsed) as Record<string, unknown>;
      for (const { p, path } of paragraphsIn(hdr, name)) {
        const { block, hidden } = extractParagraph(p, idx, path, true, false);
        if (block.text.trim()) headersFooters.push(block.text);
        blocks.push(block);
        hiddenChars.push(...hidden);
        idx += 1;
      }
    }
  }

  const comments: ExtractedDocument["comments"] = [];
  const commentsFile = zip.file("word/comments.xml");
  if (commentsFile) {
    const xml = await commentsFile.async("string");
    const parsed = parseXmlPart(xml);
    const root = (parsed["w:comments"] ?? parsed) as Record<string, unknown>;
    for (const c of asArray(root["w:comment"] as Record<string, unknown>)) {
      const t: string[] = [];
      walkText(c, t);
      comments.push({
        id: String((c as Record<string, string>)["@_w:id"] ?? ""),
        author: String((c as Record<string, string>)["@_w:author"] ?? ""),
        text: t.join(""),
      });
    }
  }

  const fields: ExtractedDocument["fields"] = [];
  const instrs: string[] = [];
  collectInstr(body, instrs);
  for (const instr of instrs) {
    const u = instr.trim();
    if (!u) continue;
    const kind = u.split(/\s+/)[0]?.toUpperCase() ?? "";
    const benign = ["PAGEREF", "PAGE", "NUMPAGES", "TOC", "REF", "HYPERLINK", "SEQ", "STYLEREF"];
    const unresolved =
      /MERGEFIELD|DOCPROPERTY|INCLUDETEXT|INCLUDEPICTURE|LINK\b|AUTOTEXT/i.test(u) ||
      (!benign.includes(kind) && /https?:|\\\\|[A-Z]:\\/.test(u));
    fields.push({ instr: u.slice(0, 200), result: "", unresolved });
  }

  const revisions: ExtractedDocument["revisions"] = [];
  function collectRev(node: unknown): void {
    if (node == null || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (o["w:ins"]) {
      for (const ins of asArray(o["w:ins"] as Record<string, unknown>)) {
        const t: string[] = [];
        walkText(ins, t);
        revisions.push({ type: "ins", text: t.join("").slice(0, 200) });
      }
    }
    if (o["w:del"]) {
      for (const del of asArray(o["w:del"] as Record<string, unknown>)) {
        const t: string[] = [];
        walkText(del, t);
        revisions.push({ type: "del", text: t.join("").slice(0, 200) });
      }
    }
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith("@_") || k === "w:ins" || k === "w:del") continue;
      collectRev(v);
    }
  }
  collectRev(body);

  let appPages: number | null = null;
  const appFile = zip.file("docProps/app.xml");
  if (appFile) {
    const xml = await appFile.async("string");
    const m = xml.match(/<Pages>(\d+)<\/Pages>/i);
    if (m) appPages = Number(m[1]);
  }

  let cursor = 0;
  for (const b of blocks) {
    b.sourceStart = cursor;
    b.sourceEnd = cursor + b.text.length;
    cursor = b.sourceEnd + 1;
  }

  const joined = blocks.map((b) => b.text).join("\n");
  const wordCount = (joined.match(/[A-Za-z0-9’']+/g) ?? []).length;
  const nonWhitespaceChars = joined.replace(/\s+/g, "").length;
  const explicitPageBreaks = blocks.filter((b) => b.pageBreakBefore).length;
  const { pageCount, method } = estimatePageCount({
    wordCount,
    nonWhitespaceChars,
    explicitPageBreaks,
    appPages,
  });

  const capabilities: SourceCapability[] = [
    {
      name: "comments",
      available: comments.length > 0 || Boolean(commentsFile),
      detectorVersion: "ooxml-v1",
      suppressionReason:
        commentsFile || comments.length ? null : "No comments part in the package",
    },
    {
      name: "revisions",
      available: revisions.length > 0,
      detectorVersion: "ooxml-v1",
      suppressionReason: revisions.length ? null : "No w:ins/w:del in document.xml",
    },
    {
      name: "fields",
      available: fields.length > 0,
      detectorVersion: "ooxml-v1",
      suppressionReason: fields.length ? null : "No field instructions",
    },
    {
      name: "tables",
      available: blocks.some((b) => b.isTable),
      detectorVersion: "ooxml-v1",
      suppressionReason: blocks.some((b) => b.isTable) ? null : "No tables extracted",
    },
    {
      name: "headers_footers",
      available: headersFooters.length > 0,
      detectorVersion: "ooxml-v1",
      suppressionReason: headersFooters.length ? null : "No header/footer parts",
    },
  ];

  void W;
  return {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    wordCount,
    nonWhitespaceChars,
    explicitPageBreaks,
    appPages,
    pageCount,
    pageCountMethod: method,
    blocks,
    comments,
    fields,
    revisions,
    headersFooters,
    hiddenChars,
    capabilities,
    sourceQualityHint: "ok",
  };
}

export type BuildDocxOpts = {
  pages?: number;
  header?: string;
  tableRows?: string[][];
  comments?: { author: string; text: string }[];
  fields?: string[];
};

/** Minimal DOCX writer used for fixtures and the in-app sample SHA. */
export async function buildDocx(paragraphs: string[], opts?: BuildDocxOpts): Promise<Buffer> {
  const zip = new JSZip();
  const writeZipFile = (name: string, data: string) =>
    zip.file(name, data, { date: DETERMINISTIC_ZIP_DATE });
  const bodyParas = paragraphs
    .map((text) => {
      const page = text === "\\page" ? `<w:br w:type="page"/>` : "";
      const xmlText = escapeXml(text === "\\page" ? "" : text);
      return `<w:p><w:r>${page}<w:t xml:space="preserve">${xmlText}</w:t></w:r></w:p>`;
    })
    .join("");
  const fieldParas = (opts?.fields ?? [])
    .map(
      (instr) =>
        `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${escapeXml(instr)} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`,
    )
    .join("");
  const tables = (opts?.tableRows ?? [])
    .map((row) => {
      const cells = row
        .map(
          (cell) =>
            `<w:tc><w:p><w:r><w:t xml:space="preserve">${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`,
        )
        .join("");
      return `<w:tbl><w:tr>${cells}</w:tr></w:tbl>`;
    })
    .join("");
  const rels: string[] = [];
  const overrides: string[] = [];
  let sectPr = "<w:sectPr/>";
  if (opts?.header) {
    rels.push(
      `<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`,
    );
    overrides.push(
      `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`,
    );
    writeZipFile(
      "word/header1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:p><w:r><w:t xml:space="preserve">${escapeXml(opts.header)}</w:t></w:r></w:p>
</w:hdr>`,
    );
    sectPr = `<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/></w:sectPr>`;
  }
  if (opts?.comments?.length) {
    rels.push(
      `<Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>`,
    );
    overrides.push(
      `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`,
    );
    const commentXml = opts.comments
      .map(
        (c, i) =>
          `<w:comment w:id="${i}" w:author="${escapeXml(c.author)}"><w:p><w:r><w:t xml:space="preserve">${escapeXml(c.text)}</w:t></w:r></w:p></w:comment>`,
      )
      .join("");
    writeZipFile(
      "word/comments.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${commentXml}</w:comments>`,
    );
  }
  writeZipFile(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${overrides.join("\n")}
</Types>`,
  );
  writeZipFile(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
  );
  writeZipFile(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`,
  );
  writeZipFile(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${bodyParas}${fieldParas}${tables}${sectPr}</w:body></w:document>`,
  );
  writeZipFile(
    "docProps/app.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Pages>${opts?.pages ?? 1}</Pages>
</Properties>`,
  );
  const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return Buffer.from(buf);
}

function escapeXml(s: string): string {
  const amp = String.fromCharCode(38);
  return s
    .replace(/&/g, amp + "amp;")
    .replace(/</g, amp + "lt;")
    .replace(/>/g, amp + "gt;")
    .replace(/"/g, amp + "quot;");
}
