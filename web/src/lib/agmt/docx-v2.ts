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
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { mapProofSource, type ProofSource } from "./source-map.ts";
import type { ExtractedBlock, ExtractedBookmark, ExtractedDocument, ExtractedNote, PackageRelationship, SourceCapability } from "./types.ts";
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
  story: "body" | "header" | "footer" | "footnote" | "endnote",
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
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw parserError("invalid_xml_encoding", "XML entry is not valid UTF-8");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw parserError("invalid_xml", "Malformed XML or forbidden declaration");
  }
  return xml;
}

function parseObject(xml: string): Obj {
  return objectParser.parse(xml) as Obj;
}

type PackageEntryMetadata = {
  name: string;
  isDirectory: boolean;
  uncompressedSize: number;
};

type InspectedRelationship = PackageRelationship & {
  resolvedTarget: string;
};

function packageText(value: unknown, field: string, maximumLength = 512): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximumLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw parserError("invalid_ooxml_package", field + " is invalid");
  }
  return value.trim();
}

function packageEntryType(
  value: unknown,
  field: string,
): string {
  return packageText(value, field, 256);
}

function inspectContentTypes(
  xml: string,
  entries: PackageEntryMetadata[],
): Map<string, string> {
  const parsed = parseObject(xml);
  const root = parsed["Types"];
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw parserError("invalid_content_types", "Content types root is missing");
  }
  const types = root as Obj;
  const defaults = new Map<string, string>();
  for (const item of asObjectArray(types["Default"])) {
    const extension = packageText(item["@_Extension"], "content type extension", 64).toLowerCase();
    const contentType = packageEntryType(item["@_ContentType"], "content type");
    const prior = defaults.get(extension);
    if (prior && prior !== contentType) {
      throw parserError("invalid_content_types", "Content type defaults conflict");
    }
    defaults.set(extension, contentType);
  }

  const overrides = new Map<string, string>();
  for (const item of asObjectArray(types["Override"])) {
    const partName = packageText(item["@_PartName"], "content type part name", 1024);
    if (!partName.startsWith("/") || partName.length === 1) {
      throw parserError("invalid_content_types", "Content type part name must be absolute");
    }
    const name = partName.slice(1);
    const contentType = packageEntryType(item["@_ContentType"], "content type");
    if (!entries.some((entry) => entry.name === name && !entry.isDirectory)) {
      throw parserError("missing_content_type", "Content type override targets a missing part");
    }
    const prior = overrides.get(name);
    if (prior && prior !== contentType) {
      throw parserError("invalid_content_types", "Content type overrides conflict");
    }
    overrides.set(name, contentType);
  }

  const contentTypes = new Map<string, string>();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const extension = entry.name.includes(".")
      ? entry.name.slice(entry.name.lastIndexOf(".") + 1).toLowerCase()
      : "";
    const contentType = overrides.get(entry.name) ?? defaults.get(extension);
    if (!contentType) {
      throw parserError("missing_content_type", "Package part has no declared content type");
    }
    if (/macroEnabled|vbaProject|activeX/i.test(contentType)) {
      throw parserError("unsupported_active_content", "Active or macro content is not supported");
    }
    contentTypes.set(entry.name, contentType);
  }

  const mainContentType = contentTypes.get("word/document.xml");
  if (mainContentType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml") {
    throw parserError("invalid_content_types", "Main document content type is invalid");
  }
  return contentTypes;
}

function relationshipSourceName(name: string): string {
  if (name === "_rels/.rels") return "";
  const marker = "/_rels/";
  const markerIndex = name.indexOf(marker);
  if (markerIndex <= 0 || !name.endsWith(".rels")) {
    throw parserError("invalid_relationships", "Relationship part name is invalid");
  }
  const source = name.slice(0, markerIndex) + "/" + name.slice(markerIndex + marker.length, -5);
  if (!source) throw parserError("invalid_relationships", "Relationship source is missing");
  return source;
}

function resolveInternalRelationship(
  source: string,
  target: string,
  names: Set<string>,
): string {
  if (
    !target ||
    target.startsWith("/") ||
    target.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(target) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) ||
    /[\u0000-\u001f\u007f]/.test(target)
  ) {
    throw parserError("unsafe_relationship_target", "Internal relationship target is unsafe");
  }

  const segments = source ? source.slice(0, source.lastIndexOf("/") + 1).split("/").filter(Boolean) : [];
  let usedParent = false;
  for (const segment of target.split("/")) {
    if (!segment || segment === ".") {
      throw parserError("unsafe_relationship_target", "Internal relationship target is unsafe");
    }
    if (segment === "..") {
      usedParent = true;
      if (!segments.length) {
        throw parserError("unsafe_relationship_target", "Internal relationship target escapes the package");
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  const resolved = segments.join("/");
  if (!names.has(resolved)) {
    throw parserError(
      usedParent ? "unsafe_relationship_target" : "missing_relationship_target",
      "Internal relationship target is not a package part",
    );
  }
  return resolved;
}

function externalRelationshipTarget(target: string): boolean {
  return /^(https?|mailto):/i.test(target);
}

async function inspectRelationships(
  zip: JSZip,
  entries: PackageEntryMetadata[],
  names: Set<string>,
): Promise<InspectedRelationship[]> {
  const relationships: InspectedRelationship[] = [];
  for (const entry of entries.filter((item) => item.name.endsWith(".rels")).sort((left, right) => left.name.localeCompare(right.name))) {
    const source = relationshipSourceName(entry.name);
    if (source && !names.has(source)) {
      throw parserError("missing_relationship_source", "Relationship part has no source part");
    }
    const relationshipFile = zip.file(entry.name);
    if (!relationshipFile || entry.isDirectory) {
      throw parserError("invalid_relationships", "Relationship part could not be loaded");
    }
    const parsed = parseObject(await readEntryText(relationshipFile, entry.uncompressedSize));
    const root = parsed["Relationships"];
    if (!root || typeof root !== "object" || Array.isArray(root)) {
      throw parserError("invalid_relationships", "Relationships root is missing");
    }
    const relationItems = asObjectArray((root as Obj)["Relationship"]);
    const seenIds = new Set<string>();
    for (const item of relationItems) {
      const id = packageText(item["@_Id"], "relationship id", 256);
      const type = packageText(item["@_Type"], "relationship type", 512);
      const target = packageText(item["@_Target"], "relationship target", 4096);
      if (seenIds.has(id)) {
        throw parserError("invalid_relationships", "Relationship IDs must be unique within a part");
      }
      seenIds.add(id);
      const rawTargetMode = item["@_TargetMode"];
      const targetMode =
        rawTargetMode == null || String(rawTargetMode).trim() === ""
          ? "Internal"
          : String(rawTargetMode).trim().toLowerCase() === "external"
            ? "External"
            : String(rawTargetMode).trim().toLowerCase() === "internal"
              ? "Internal"
              : null;
      if (!targetMode) {
        throw parserError("invalid_relationships", "Relationship target mode is invalid");
      }

      if (targetMode === "External") {
        if (!externalRelationshipTarget(target)) {
          throw parserError("unsupported_external_content", "External relationship target is not allowed");
        }
        if (/oleObject|attachedTemplate|control|activeX|vbaProject/i.test(type)) {
          throw parserError("unsupported_external_content", "External active content is not supported");
        }
        relationships.push({
          source,
          id,
          type,
          target,
          targetMode,
          external: true,
          resolvedTarget: target,
        });
      } else {
        const resolvedTarget = resolveInternalRelationship(targetMode === "Internal" ? source : "", target, names);
        relationships.push({
          source,
          id,
          type,
          target,
          targetMode,
          external: false,
          resolvedTarget,
        });
      }
    }
  }
  return relationships;
}

function countOrderedTag(nodes: OrderedNode[], tag: string): number {
  let count = 0;
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node)) {
      if (key === ":@" || key === "#text") continue;
      if (key === tag) count += 1;
      count += countOrderedTag(orderedArray(value), tag);
    }
  }
  return count;
}

function collectBookmarks(node: unknown, output: ExtractedBookmark[]): void {
  if (node == null || typeof node !== "object") return;
  const object = node as Obj;
  for (const bookmark of asObjectArray(object["w:bookmarkStart"])) {
    const id = packageText(bookmark["@_w:id"], "bookmark id", 64);
    const name = packageText(bookmark["@_w:name"], "bookmark name", 256);
    if (!/^-?\d+$/.test(id)) {
      throw parserError("invalid_bookmarks", "Bookmark ID is invalid");
    }
    output.push({ id, name });
  }
  for (const [key, value] of Object.entries(object)) {
    if (key.startsWith("@_") || key === "w:bookmarkStart") continue;
    collectBookmarks(value, output);
  }
}

function extractNotesStory(
  xml: string,
  fileName: string,
  rootTag: "w:footnotes" | "w:endnotes",
  noteTag: "w:footnote" | "w:endnote",
  story: "footnote" | "endnote",
  startIndex: number,
): {
  blocks: ExtractedBlock[];
  hidden: ExtractedDocument["hiddenChars"];
  notes: ExtractedNote[];
  nextIndex: number;
} {
  const ordered = orderedParser.parse(xml) as OrderedNode[];
  const root = firstTag(ordered, rootTag);
  if (!root.length) throw parserError("invalid_ooxml_package", rootTag + " root is missing");
  const noteNodes: OrderedNode[] = [];
  for (const node of root) {
    const value = node[noteTag];
    if (value == null) continue;
    const noteNode: OrderedNode = { [noteTag]: value };
    if (node[":@"] != null) noteNode[":@"] = node[":@"];
    noteNodes.push(noteNode);
  }
  const blocks: ExtractedBlock[] = [];
  const hidden: ExtractedDocument["hiddenChars"] = [];
  const notes: ExtractedNote[] = [];
  let blockIndex = startIndex;
  for (const noteNode of noteNodes) {
    const id = packageText(attrs(noteNode)["@_w:id"], story + " id", 64);
    if (!/^-?\d+$/.test(id)) {
      throw parserError("invalid_ooxml_package", story + " ID is invalid");
    }
    const noteParagraphs = paragraphsInOrder([noteNode], fileName + "/" + noteTag + "[" + id + "]");
    const noteText: string[] = [];
    for (const paragraph of noteParagraphs) {
      const extracted = extractOrderedParagraph(
        paragraph.nodes,
        blockIndex,
        paragraph.path,
        story,
        false,
      );
      blocks.push(extracted.block);
      hidden.push(...extracted.hidden);
      noteText.push(extracted.block.text);
      blockIndex += 1;
    }
    notes.push({ type: story, id, text: noteText.join("\n") });
  }
  return { blocks, hidden, notes, nextIndex: blockIndex };
}

export async function extractDocx(bytes: Buffer, captureProofSource?: (source: ProofSource) => void): Promise<ExtractedDocument> {
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
  const packageNames = new Set(names);
  const contentTypesFile = zip.file("[Content_Types].xml");
  const contentTypesMetadata = metadataByName.get("[Content_Types].xml");
  if (!contentTypesFile || !contentTypesMetadata || contentTypesMetadata.isDirectory) {
    throw parserError("invalid_content_types", "Content types part is missing");
  }
  const contentTypes = inspectContentTypes(
    await readEntryText(contentTypesFile, contentTypesMetadata.uncompressedSize),
    manifest.entries,
  );
  const relationships = await inspectRelationships(zip, manifest.entries, packageNames);
  const officeDocumentRelationship = relationships.find(
    (relationship) =>
      relationship.source === "" &&
      //officeDocument$/i.test(relationship.type) &&
      relationship.resolvedTarget === "word/document.xml",
  );
  if (!officeDocumentRelationship) {
    throw parserError("invalid_relationships", "Package root does not identify word/document.xml");
  }
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
  // Optional memory-only source map. Existing durable ingestion never receives or persists it.
  if (captureProofSource) captureProofSource(mapProofSource(documentXml, orderedDocument));
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
  const notes: ExtractedNote[] = [];
  const bookmarks: ExtractedBookmark[] = [];
  const sectionCount = countOrderedTag(bodyChildren, "w:sectPr");
  const storyObjects: Obj[] = [bodyObject];
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
    storyObjects.push(parseObject(xml));
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

  for (const noteSpec of [
    {
      name: "word/footnotes.xml",
      rootTag: "w:footnotes" as const,
      noteTag: "w:footnote" as const,
      story: "footnote" as const,
    },
    {
      name: "word/endnotes.xml",
      rootTag: "w:endnotes" as const,
      noteTag: "w:endnote" as const,
      story: "endnote" as const,
    },
  ]) {
    const noteMetadata = metadataByName.get(noteSpec.name);
    const noteFile = zip.file(noteSpec.name);
    if (!noteMetadata && !noteFile) continue;
    if (!noteMetadata || !noteFile || noteMetadata.isDirectory) {
      throw parserError("invalid_ooxml_package", noteSpec.name + " could not be loaded");
    }
    const notesXml = await readEntryText(noteFile, noteMetadata.uncompressedSize);
    storyObjects.push(parseObject(notesXml));
    const extractedNotes = extractNotesStory(
      notesXml,
      noteSpec.name,
      noteSpec.rootTag,
      noteSpec.noteTag,
      noteSpec.story,
      blockIndex,
    );
    blocks.push(...extractedNotes.blocks);
    hiddenChars.push(...extractedNotes.hidden);
    notes.push(...extractedNotes.notes);
    blockIndex = extractedNotes.nextIndex;
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
    const commentIds = new Set<string>();
    for (const comment of asObjectArray(root["w:comment"])) {
      const id = packageText(comment["@_w:id"], "comment id", 64);
      if (!/^-?\d+$/.test(id) || commentIds.has(id)) {
        throw parserError("invalid_comments", "Comment IDs must be unique decimal identifiers");
      }
      commentIds.add(id);
      const author = packageText(comment["@_w:author"], "comment author", 256);
      const text: string[] = [];
      walkObjectText(comment, text, "final");
      comments.push({
        id,
        author,
        text: text.join(""),
      });
    }
  }

  const fields: ExtractedDocument["fields"] = [];
  const instructions: string[] = [];
  const revisions: ExtractedDocument["revisions"] = [];
  for (const story of storyObjects) {
    collectBookmarks(story, bookmarks);
    collectInstructions(story, instructions);
    collectRevisions(story, revisions);
  }
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
      name: "content_types",
      available: contentTypes.size > 0,
      state: contentTypes.size > 0 ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v3-content-types",
      suppressionReason: null,
    },
    {
      name: "relationships",
      available: relationships.length > 0,
      state: relationships.length > 0 ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v3-relationships",
      suppressionReason: null,
    },
    {
      name: "external_relationships",
      available: relationships.some((relationship) => relationship.external),
      state: relationships.some((relationship) => relationship.external) ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v3-relationships",
      suppressionReason: null,
    },
    {
      name: "active_content",
      available: false,
      state: "evaluated_absent",
      detectorVersion: "ooxml-v3-reject",
      suppressionReason: null,
    },
    {
      name: "comments",
      available: commentsFile != null,
      state: commentsFile != null ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v3",
      suppressionReason: null,
    },
    {
      name: "revisions",
      available: revisions.length > 0,
      state: revisions.length > 0 ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v3-final",
      suppressionReason: null,
    },
    {
      name: "footnotes",
      available: names.includes("word/footnotes.xml"),
      state: names.includes("word/footnotes.xml") ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v3-notes",
      suppressionReason: null,
    },
    {
      name: "endnotes",
      available: names.includes("word/endnotes.xml"),
      state: names.includes("word/endnotes.xml") ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v3-notes",
      suppressionReason: null,
    },
    {
      name: "bookmarks",
      available: bookmarks.length > 0,
      state: bookmarks.length > 0 ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v3-bookmarks",
      suppressionReason: null,
    },
    {
      name: "sections",
      available: sectionCount > 0,
      state: sectionCount > 0 ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "ooxml-v3-sections",
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
      detectorVersion: "ooxml-v3-ordered",
      suppressionReason: null,
    },
    {
      name: "headers_footers",
      available: names.some((name) => /^word\/(header|footer)\d*\.xml$/i.test(name)),
      state: names.some((name) => /^word\/(header|footer)\d*\.xml$/i.test(name))
        ? "evaluated_present"
        : "evaluated_absent",
      detectorVersion: "ooxml-v3-story",
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
    relationships: relationships.map(({ resolvedTarget: _resolvedTarget, ...relationship }) => relationship),
    notes,
    bookmarks,
    sectionCount,
    sourceQualityHint: "ok",
  };
}
