/**
 * Proof OOXML extractor v2.
 *
 * This remains a TypeScript implementation, but fixes two launch-critical
 * properties of the prototype extractor:
 * - text-bearing body content is walked in XML source order;
 * - visible text is explicitly the accepted/final revision view.
 *
 * It also adds bounded ZIP/package checks before XML parsing. The long-term
 * production target remains an isolated parser worker with a differential
 * Open XML SDK oracle.
 */
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { ExtractedBlock, ExtractedDocument, SourceCapability } from "./types.ts";
import { FILE_BYTE_CAP } from "./config.ts";
import { estimatePageCount } from "./page-count.ts";
import { ZIP_LIMITS, inspectZipCentralDirectory } from "./zip-safety.ts";

const objectParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: false,
  trimValues: false,
  parseTagValue: false,
});

const orderedParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
});

type Obj = Record<string, unknown>;
type OrderedNode = Record<string, unknown>;

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

function asObjectArray(value: unknown): Obj[] {
  if (value == null) return [];
  return Array.isArray(value) ? (value as Obj[]) : [value as Obj];
}

function orderedArray(value: unknown): OrderedNode[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value as OrderedNode[];
  if (typeof value === "object") return [value as OrderedNode];
  return [{ "#text": String(value) }];
}

function firstTag(nodes: OrderedNode[], tag: string): OrderedNode[] {
  for (const node of nodes) {
    const value = node[tag];
    if (value != null) return orderedArray(value);
  }
  return [];
}

function attrs(node: OrderedNode): Record<string, string> {
  const value = node[":@"];
  return value && typeof value === "object" ? (value as Record<string, string>) : {};
}

function findTagAttribute(nodes: OrderedNode[], tag: string, attribute: string): string | null {
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node)) {
      if (key === ":@" || key === "#text") continue;
      if (key === tag) {
        const direct = attrs(node)[attribute];
        if (direct != null) return String(direct);
      }
      const nested = findTagAttribute(orderedArray(value), tag, attribute);
      if (nested != null) return nested;
    }
  }
  return null;
}

function walkOrderedText(
  nodes: OrderedNode[],
  output: string[],
  revisionView: "final" | "all" = "final",
): void {
  for (const node of nodes) {
    if (typeof node["#text"] === "string") output.push(node["#text"] as string);
    for (const [tag, value] of Object.entries(node)) {
      if (tag === ":@" || tag === "#text") continue;
      if (revisionView === "final" && (tag === "w:del" || tag === "w:moveFrom" || tag === "w:delText")) {
        continue;
      }
      if (tag === "w:tab") {
        output.push("\t");
        continue;
      }
      if (tag === "w:br" || tag === "w:cr") {
        output.push("\n");
        continue;
      }
      walkOrderedText(orderedArray(value), output, revisionView);
    }
  }
}

function hasPageBreakOrdered(nodes: OrderedNode[]): boolean {
  for (const node of nodes) {
    for (const [tag, value] of Object.entries(node)) {
      if (tag === ":@" || tag === "#text") continue;
      if (tag === "w:lastRenderedPageBreak") return true;
      if (tag === "w:br" && attrs(node)["@_w:type"] === "page") return true;
      if (hasPageBreakOrdered(orderedArray(value))) return true;
    }
  }
  return false;
}

function extractOrderedParagraph(
  paragraphNodes: OrderedNode[],
  index: number,
  path: string,
  story: "body" | "header" | "footer",
  isTable: boolean,
): { block: ExtractedBlock; hidden: ExtractedDocument["hiddenChars"] } {
  const parts: string[] = [];
  walkOrderedText(paragraphNodes, parts, "final");
  const text = parts.join("").replace(/\r/g, "");
  const styleId = findTagAttribute(paragraphNodes, "w:pStyle", "@_w:val");
  const numId = findTagAttribute(paragraphNodes, "w:numId", "@_w:val");
  const ilvl = findTagAttribute(paragraphNodes, "w:ilvl", "@_w:val");
  const numbering = numId != null || ilvl != null ? `${numId ?? ""}:${ilvl ?? ""}` : null;

  const hidden: ExtractedDocument["hiddenChars"] = [];
  HIDDEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HIDDEN_RE.exec(text))) {
    hidden.push({
      blockIndex: index,
      start: match.index,
      end: match.index + match[0].length,
      kind: HIDDEN_KIND[match[0]] ?? "hidden",
    });
  }

  return {
    block: {
      index,
      text,
      xmlAnchor: {
        kind: story === "body" ? (isTable ? "cell" : "paragraph") : story,
        path,
      },
      styleId,
      numbering,
      isTable,
      isHeaderFooter: story !== "body",
      pageBreakBefore: hasPageBreakOrdered(paragraphNodes),
      sourceStart: 0,
      sourceEnd: 0,
    },
    hidden,
  };
}

function paragraphsInOrder(
  nodes: OrderedNode[],
  path: string,
  isTable = false,
): { nodes: OrderedNode[]; path: string; isTable: boolean }[] {
  const output: { nodes: OrderedNode[]; path: string; isTable: boolean }[] = [];
  const counters = new Map<string, number>();

  for (const node of nodes) {
    for (const [tag, value] of Object.entries(node)) {
      if (tag === ":@" || tag === "#text") continue;
      const index = counters.get(tag) ?? 0;
      counters.set(tag, index + 1);
      const nextPath = `${path}/${tag}[${index}]`;
      const children = orderedArray(value);

      if (tag === "w:p") {
        output.push({ nodes: children, path: nextPath, isTable });
        continue;
      }

      // Preserve source order through tables, content controls and other
      // containers. A paragraph is a leaf for this block model, so text boxes
      // nested inside a paragraph remain part of that paragraph's visible text.
      output.push(...paragraphsInOrder(children, nextPath, isTable || tag === "w:tbl" || tag === "w:tc"));
    }
  }

  return output;
}

function walkObjectText(node: unknown, output: string[], revisionView: "final" | "all" = "final"): void {
  if (node == null) return;
  if (typeof node === "string") {
    output.push(node);
    return;
  }
  if (typeof node !== "object") return;
  const object = node as Obj;
  if (typeof object["#text"] === "string") output.push(object["#text"] as string);
  for (const [key, value] of Object.entries(object)) {
    if (key === "#text" || key.startsWith("@_")) continue;
    if (revisionView === "final" && (key === "w:del" || key === "w:moveFrom" || key === "w:delText")) {
      continue;
    }
    if (key === "w:tab") output.push("\t");
    else if (key === "w:br" || key === "w:cr") output.push("\n");
    else walkObjectText(value, output, revisionView);
  }
}

function collectInstructions(node: unknown, output: string[]): void {
  if (node == null || typeof node !== "object") return;
  const object = node as Obj;
  if (object["w:instrText"] != null) {
    const text: string[] = [];
    walkObjectText(object["w:instrText"], text, "final");
    output.push(text.join(""));
  }
  for (const [key, value] of Object.entries(object)) {
    if (key.startsWith("@_") || key === "w:del" || key === "w:moveFrom") continue;
    collectInstructions(value, output);
  }
}

function collectRevisions(node: unknown, output: ExtractedDocument["revisions"]): void {
  if (node == null || typeof node !== "object") return;
  const object = node as Obj;
  for (const type of ["ins", "del"] as const) {
    const key = `w:${type}`;
    for (const revision of asObjectArray(object[key])) {
      const text: string[] = [];
      walkObjectText(revision, text, "all");
      output.push({ type, text: text.join("").slice(0, 200) });
    }
  }
  for (const [key, value] of Object.entries(object)) {
    if (key.startsWith("@_") || key === "w:ins" || key === "w:del") continue;
    collectRevisions(value, output);
  }
}

type ZipEntryReader = {
  async(type: "uint8array"): Promise<Uint8Array>;
};

function parserError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

async function readEntryText(entry: ZipEntryReader, expectedBytes: number): Promise<string> {
  let data: Uint8Array;
  try {
    data = await entry.async("uint8array");
  } catch {
    throw parserError("corrupt", "ZIP entry could not be decompressed or failed its CRC");
  }
  if (data.byteLength !== expectedBytes || data.byteLength > ZIP_LIMITS.MAX_ENTRY_BYTES) {
    throw parserError("package_entry_size_mismatch", "ZIP entry size differs from its central-directory declaration");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw parserError("invalid_xml_encoding", "XML entry is not valid UTF-8");
  }
}

function parseObject(xml: string): Obj {
  return objectParser.parse(xml) as Obj;
}

export async function extractDocx(bytes: Buffer): Promise<ExtractedDocument> {
  if (bytes.byteLength > FILE_BYTE_CAP) {
    throw Object.assign(new Error("file_too_large"), { code: "file_too_large" });
  }
  if (bytes.subarray(0, 2).toString("utf8") !== "PK") {
    throw Object.assign(new Error("not_docx"), { code: "not_docx" });
  }

  const manifest = inspectZipCentralDirectory(bytes);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
  } catch {
    throw Object.assign(new Error("corrupt"), { code: "corrupt" });
  }

  for (const entry of manifest.entries) {
    if (!entry.isDirectory && !zip.file(entry.name)) {
      throw parserError("corrupt", "ZIP entry could not be loaded by the package reader");
    }
  }
  const names = manifest.entries.map((entry) => entry.name);
  const metadataByName = new Map(manifest.entries.map((entry) => [entry.name, entry]));
  if (names.some((name) => name.toLowerCase().includes("vbaproject"))) {
    throw Object.assign(new Error("macro"), { code: "macro" });
  }
  if (names.some((name) => /encryptioninfo|encryptedpackage/i.test(name))) {
    throw Object.assign(new Error("encrypted"), { code: "encrypted" });
  }
  if (names.some((name) => /(^|\/)activeX\/|(^|\/)embeddings\//i.test(name))) {
    throw Object.assign(new Error("unsupported_embedded_content"), {
      code: "unsupported_embedded_content",
    });
  }

  const documentMetadata = metadataByName.get("word/document.xml");
  const documentFile = zip.file("word/document.xml");
  if (!documentFile || !documentMetadata || documentMetadata.isDirectory) {
    throw Object.assign(new Error("not_docx"), { code: "not_docx" });
  }

  const documentXml = await readEntryText(documentFile, documentMetadata.uncompressedSize);
  const orderedDocument = orderedParser.parse(documentXml) as OrderedNode[];
  const documentChildren = firstTag(orderedDocument, "w:document");
  const bodyChildren = firstTag(documentChildren, "w:body");
  if (!bodyChildren.length) {
    throw Object.assign(new Error("corrupt"), { code: "corrupt" });
  }

  const objectDocument = parseObject(documentXml);
  const documentObject = (objectDocument["w:document"] ?? objectDocument) as Obj;
  const bodyObject = (documentObject["w:body"] ?? documentObject) as Obj;

  const blocks: ExtractedBlock[] = [];
  const hiddenChars: ExtractedDocument["hiddenChars"] = [];
  let blockIndex = 0;

  for (const paragraph of paragraphsInOrder(bodyChildren, "/w:document/w:body")) {
    const extracted = extractOrderedParagraph(
      paragraph.nodes,
      blockIndex,
      paragraph.path,
      "body",
      paragraph.isTable,
    );
    blocks.push(extracted.block);
    hiddenChars.push(...extracted.hidden);
    blockIndex += 1;
  }

  const headersFooters: string[] = [];
  for (const name of names.sort()) {
    const match = name.match(/^word\/(header|footer)\d*\.xml$/i);
    if (!match) continue;
    const story = match[1].toLowerCase() === "footer" ? "footer" : "header";
    const headerMetadata = metadataByName.get(name);
    const headerFile = zip.file(name);
    if (!headerFile || !headerMetadata || headerMetadata.isDirectory) {
      throw parserError("corrupt", "Header/footer entry could not be loaded");
    }
    const xml = await readEntryText(headerFile, headerMetadata.uncompressedSize);
    const ordered = orderedParser.parse(xml) as OrderedNode[];
    const root = firstTag(ordered, story === "header" ? "w:hdr" : "w:ftr");
    for (const paragraph of paragraphsInOrder(root, name)) {
      const extracted = extractOrderedParagraph(
        paragraph.nodes,
        blockIndex,
        paragraph.path,
        story,
        false,
      );
      if (extracted.block.text.trim()) headersFooters.push(extracted.block.text);
      blocks.push(extracted.block);
      hiddenChars.push(...extracted.hidden);
      blockIndex += 1;
    }
  }

  const comments: ExtractedDocument["comments"] = [];
  const commentsFile = zip.file("word/comments.xml");
  if (commentsFile) {
    const commentsMetadata = metadataByName.get("word/comments.xml");
    if (!commentsMetadata || commentsMetadata.isDirectory) {
      throw parserError("corrupt", "Comments entry could not be loaded");
    }
    const parsed = parseObject(await readEntryText(commentsFile, commentsMetadata.uncompressedSize));
    const root = (parsed["w:comments"] ?? parsed) as Obj;
    for (const comment of asObjectArray(root["w:comment"])) {
      const text: string[] = [];
      walkObjectText(comment, text, "final");
      comments.push({
        id: String((comment as Record<string, string>)["@_w:id"] ?? ""),
        author: String((comment as Record<string, string>)["@_w:author"] ?? ""),
        text: text.join(""),
      });
    }
  }

  const fields: ExtractedDocument["fields"] = [];
  const instructions: string[] = [];
  collectInstructions(bodyObject, instructions);
  for (const instruction of instructions) {
    const value = instruction.trim();
    if (!value) continue;
    const kind = value.split(/\s+/)[0]?.toUpperCase() ?? "";
    const benign = ["PAGEREF", "PAGE", "NUMPAGES", "TOC", "REF", "HYPERLINK", "SEQ", "STYLEREF"];
    const unresolved =
      /MERGEFIELD|DOCPROPERTY|INCLUDETEXT|INCLUDEPICTURE|LINK\b|AUTOTEXT/i.test(value) ||
      (!benign.includes(kind) && /https?:|\\\\|[A-Z]:\\/.test(value));
    fields.push({ instr: value.slice(0, 200), result: "", unresolved });
  }

  const revisions: ExtractedDocument["revisions"] = [];
  collectRevisions(bodyObject, revisions);

  let appPages: number | null = null;
  const appFile = zip.file("docProps/app.xml");
  if (appFile) {
    const appMetadata = metadataByName.get("docProps/app.xml");
    if (!appMetadata || appMetadata.isDirectory) {
      throw parserError("corrupt", "Application properties entry could not be loaded");
    }
    const xml = await readEntryText(appFile, appMetadata.uncompressedSize);
    const match = xml.match(/<Pages>(\d+)<\/Pages>/i);
    if (match) appPages = Number(match[1]);
  }

  let cursor = 0;
  for (const block of blocks) {
    block.sourceStart = cursor;
    block.sourceEnd = cursor + block.text.length;
    cursor = block.sourceEnd + 1;
  }

  const joined = blocks.map((block) => block.text).join("\n");
  const wordCount = (joined.match(/[A-Za-z0-9’']+/g) ?? []).length;
  const nonWhitespaceChars = joined.replace(/\s+/g, "").length;
  const explicitPageBreaks = blocks.filter((block) => block.pageBreakBefore).length;
  const { pageCount, method } = estimatePageCount({
    wordCount,
    nonWhitespaceChars,
    explicitPageBreaks,
    appPages,
  });

  const capabilities: SourceCapability[] = [
    {
      name: "comments",
      available: comments.length > 0,
      state: comments.length > 0 ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v2",
      suppressionReason: null,
    },
    {
      name: "revisions",
      available: revisions.length > 0,
      state: revisions.length > 0 ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v2-final",
      suppressionReason: null,
    },
    {
      name: "fields",
      available: fields.length > 0,
      state: fields.length > 0 ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v2-final",
      suppressionReason: null,
    },
    {
      name: "tables",
      available: blocks.some((block) => block.isTable),
      state: blocks.some((block) => block.isTable) ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v2-ordered",
      suppressionReason: null,
    },
    {
      name: "headers_footers",
      available: headersFooters.length > 0,
      state: headersFooters.length > 0 ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v2-story",
      suppressionReason: null,
    },
  ];

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
