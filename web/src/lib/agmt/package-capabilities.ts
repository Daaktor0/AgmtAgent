/**
 * Namespace-aware OOXML package capability inventory (PWC-05).
 *
 * Preserve, read/check and edit/comment are separate. Parsing XML is not
 * coverage. Unknown or unsupported parts never imply a complete profile.
 * Original part bytes are hashed and never rewritten.
 */
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { inspectZipCentralDirectory, ZIP_LIMITS } from "./zip-safety.ts";

export const PACKAGE_CAPABILITY_INVENTORY_VERSION = "proof-package-capabilities-v1";
export const SUPPORTED_PROFILE_ID = "proof-docx-phase-a-v1";

export const NS = Object.freeze({
  WML: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  PKG_RELS: "http://schemas.openxmlformats.org/package/2006/relationships",
  PKG_TYPES: "http://schemas.openxmlformats.org/package/2006/content-types",
  MC: "http://schemas.openxmlformats.org/markup-compatibility/2006",
  OFFICE_RELS: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
});

const MAIN_DOCUMENT_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

export type PreserveCapability = "full" | "opaque" | "none";
export type ReadCapability = "full" | "limited" | "none";
export type EditCapability = "surgical" | "comment" | "none";
export type PartDisposition = "supported" | "limited" | "refused" | "unknown";
export type PackageDisposition = "supported" | "limited" | "refused";

export class PackageCapabilityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PackageCapabilityError";
    this.code = code;
  }
}

export type PartCapability = {
  partUri: string;
  contentType: string;
  relationshipTypes: readonly string[];
  preserve: PreserveCapability;
  read: ReadCapability;
  edit: EditCapability;
  disposition: PartDisposition;
  unsupportedReason: string | null;
  sha256: string;
  byteSize: number;
};

export type RelationshipCapability = {
  source: string;
  id: string;
  type: string;
  target: string;
  targetMode: "Internal" | "External";
  resolvedTarget: string;
  preserve: PreserveCapability;
  read: ReadCapability;
  edit: EditCapability;
  disposition: PartDisposition;
  unsupportedReason: string | null;
};

export type NamespaceBinding = {
  partUri: string;
  prefix: string;
  uri: string;
  aliasOfWml: boolean;
  spoofOfW: boolean;
};

export type PackageCapabilityReceipt = {
  version: typeof PACKAGE_CAPABILITY_INVENTORY_VERSION;
  profileId: typeof SUPPORTED_PROFILE_ID;
  disposition: PackageDisposition;
  receiptHash: string;
  packageSha256: string;
  parts: readonly PartCapability[];
  relationships: readonly RelationshipCapability[];
  namespaces: readonly NamespaceBinding[];
  coverageReasons: readonly string[];
  refusedReason: string | null;
};

type Obj = Record<string, unknown>;

const objectParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: false,
  trimValues: false,
  parseTagValue: false,
});

function reject(code: string, message: string): never {
  throw new PackageCapabilityError(code, message);
}

function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function asObjectArray(value: unknown): Obj[] {
  if (value == null) return [];
  return Array.isArray(value) ? (value as Obj[]) : [value as Obj];
}

function packageText(value: unknown, field: string, maximumLength = 512): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximumLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    reject("invalid_ooxml_package", field + " is invalid");
  }
  return value.trim();
}

function decodeXml(data: Uint8Array, expectedBytes: number): string {
  if (data.byteLength !== expectedBytes || data.byteLength > ZIP_LIMITS.MAX_ENTRY_BYTES) {
    reject("package_entry_size_mismatch", "ZIP entry size differs from its central-directory declaration");
  }
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    reject("invalid_xml_encoding", "XML entry is not valid UTF-8");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    reject("invalid_xml", "Malformed XML or forbidden declaration");
  }
  return xml;
}

function relationshipSourceName(name: string): string {
  if (name === "_rels/.rels") return "";
  const marker = "/_rels/";
  const markerIndex = name.indexOf(marker);
  if (markerIndex <= 0 || !name.endsWith(".rels")) {
    reject("invalid_relationships", "Relationship part name is invalid");
  }
  const source = name.slice(0, markerIndex) + "/" + name.slice(markerIndex + marker.length, -5);
  if (!source) reject("invalid_relationships", "Relationship source is missing");
  return source;
}

function resolveInternalTarget(source: string, target: string, names: Set<string>): string {
  if (
    !target ||
    target.startsWith("/") ||
    target.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(target) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) ||
    /[\u0000-\u001f\u007f]/.test(target)
  ) {
    reject("unsafe_relationship_target", "Internal relationship target is unsafe");
  }
  const segments = source ? source.slice(0, source.lastIndexOf("/") + 1).split("/").filter(Boolean) : [];
  let usedParent = false;
  for (const segment of target.split("/")) {
    if (!segment || segment === ".") {
      reject("unsafe_relationship_target", "Internal relationship target is unsafe");
    }
    if (segment === "..") {
      usedParent = true;
      if (!segments.length) reject("unsafe_relationship_target", "Internal relationship target escapes the package");
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  const resolved = segments.join("/");
  if (!names.has(resolved)) {
    reject(
      usedParent ? "unsafe_relationship_target" : "missing_relationship_target",
      usedParent ? "Internal relationship target escapes the package" : "Internal relationship target is not a package part",
    );
  }
  return resolved;
}

type ContentTypes = Map<string, string>;

function inspectContentTypes(xml: string, names: readonly string[]): ContentTypes {
  const parsed = objectParser.parse(xml) as Obj;
  const root = parsed["Types"];
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    reject("invalid_content_types", "Content types root is missing");
  }
  const types = root as Obj;
  const defaults = new Map<string, string>();
  for (const item of asObjectArray(types["Default"])) {
    const extension = packageText(item["@_Extension"], "content type extension", 64).toLowerCase();
    const contentType = packageText(item["@_ContentType"], "content type", 256);
    defaults.set(extension, contentType);
  }
  const overrides = new Map<string, string>();
  for (const item of asObjectArray(types["Override"])) {
    const partName = packageText(item["@_PartName"], "content type part name", 1024);
    if (!partName.startsWith("/") || partName.length === 1) {
      reject("invalid_content_types", "Content type part name must be absolute");
    }
    const name = partName.slice(1);
    if (!names.includes(name)) {
      reject("missing_content_type", "Content type override targets a missing part");
    }
    overrides.set(name, packageText(item["@_ContentType"], "content type", 256));
  }
  const contentTypes: ContentTypes = new Map();
  for (const name of names) {
    const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
    const contentType = overrides.get(name) ?? defaults.get(extension);
    if (!contentType) reject("missing_content_type", "Package part has no declared content type");
    contentTypes.set(name, contentType);
  }
  return contentTypes;
}

type InspectedRelationship = {
  source: string;
  id: string;
  type: string;
  target: string;
  targetMode: "Internal" | "External";
  resolvedTarget: string;
};

function inspectRelationships(
  relXmlByName: Map<string, string>,
  names: Set<string>,
): InspectedRelationship[] {
  const relationships: InspectedRelationship[] = [];
  for (const [name, xml] of [...relXmlByName.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const source = relationshipSourceName(name);
    if (source && !names.has(source)) {
      reject("missing_relationship_source", "Relationship part has no source part");
    }
    const parsed = objectParser.parse(xml) as Obj;
    const root = parsed["Relationships"];
    if (!root || typeof root !== "object" || Array.isArray(root)) {
      reject("invalid_relationships", "Relationships root is missing");
    }
    const seenIds = new Set<string>();
    for (const item of asObjectArray((root as Obj)["Relationship"])) {
      const id = packageText(item["@_Id"], "relationship id", 256);
      const type = packageText(item["@_Type"], "relationship type", 512);
      const target = packageText(item["@_Target"], "relationship target", 4096);
      if (seenIds.has(id)) reject("invalid_relationships", "Relationship IDs must be unique within a part");
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
      if (!targetMode) reject("invalid_relationships", "Relationship target mode is invalid");
      if (targetMode === "External") {
        relationships.push({
          source,
          id,
          type,
          target,
          targetMode,
          resolvedTarget: target,
        });
      } else {
        relationships.push({
          source,
          id,
          type,
          target,
          targetMode,
          resolvedTarget: resolveInternalTarget(source, target, names),
        });
      }
    }
  }
  return relationships;
}

type NamespaceScan = {
  bindings: NamespaceBinding[];
  spoofOfW: boolean;
  aliasOfWml: boolean;
  hasAlternateContent: boolean;
  hasCustomXmlElement: boolean;
  hasProtection: boolean;
  hasWmlVisibleText: boolean;
  rootIsWmlDocument: boolean;
};

function scanXmlNamespaces(partUri: string, xml: string): NamespaceScan {
  const bindings: NamespaceBinding[] = [];
  let spoofOfW = false;
  let aliasOfWml = false;
  let hasAlternateContent = false;
  let hasCustomXmlElement = false;
  let hasProtection = false;
  let hasWmlVisibleText = false;
  let rootIsWmlDocument = false;
  let seenRoot = false;

  const tagRe = /<([A-Za-z_][\w.-]*)(?::([A-Za-z_][\w.-]*))?\b([^>]*?)(\/?)\s*>/g;
  const xmlnsRe = /\sxmlns(?::([A-Za-z_][\w.-]*))?=(["'])([^"']*)\2/g;
  const stack: Array<Map<string, string>> = [new Map([["", ""]])];

  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(xml))) {
    const full = match[0];
    if (full.startsWith("</") || full.startsWith("<?") || full.startsWith("<!")) continue;
    const first = match[1];
    const second = match[2];
    const attrs = match[3] ?? "";
    const selfClosing = match[4] === "/";
    const prefix = second ? first : "";
    const localName = second ?? first;
    const scope = new Map(stack[stack.length - 1]);
    xmlnsRe.lastIndex = 0;
    let ns: RegExpExecArray | null;
    while ((ns = xmlnsRe.exec(attrs))) {
      const declaredPrefix = ns[1] ?? "";
      const uri = ns[3];
      scope.set(declaredPrefix, uri);
      const aliasOfWmlBinding = uri === NS.WML && declaredPrefix !== "w";
      const spoofOfWBinding = declaredPrefix === "w" && uri !== NS.WML;
      if (aliasOfWmlBinding) aliasOfWml = true;
      if (spoofOfWBinding) spoofOfW = true;
      bindings.push({
        partUri,
        prefix: declaredPrefix,
        uri,
        aliasOfWml: aliasOfWmlBinding,
        spoofOfW: spoofOfWBinding,
      });
    }
    const uri = scope.get(prefix) ?? "";
    if (!seenRoot) {
      seenRoot = true;
      rootIsWmlDocument = localName === "document" && uri === NS.WML;
    }
    if (localName === "AlternateContent" && uri === NS.MC) hasAlternateContent = true;
    if (localName === "customXml" && uri === NS.WML) hasCustomXmlElement = true;
    if ((localName === "documentProtection" || localName === "writeProtection") && uri === NS.WML) {
      hasProtection = true;
    }
    if (uri === NS.WML && (localName === "tab" || localName === "br" || localName === "cr")) {
      hasWmlVisibleText = true;
    }
    if (uri === NS.WML && (localName === "t" || localName === "delText" || localName === "instrText")) {
      const close = xml.indexOf("<", match.index + full.length);
      const inner = close >= 0 ? xml.slice(match.index + full.length, close) : "";
      if (inner.replace(/\s+/g, "").length > 0) hasWmlVisibleText = true;
    }
    if (!selfClosing && !full.startsWith("</")) stack.push(scope);
    if (selfClosing && stack.length > 1) {
      // no-op: self-closing does not push
    }
  }

  return {
    bindings,
    spoofOfW,
    aliasOfWml,
    hasAlternateContent,
    hasCustomXmlElement,
    hasProtection,
    hasWmlVisibleText,
    rootIsWmlDocument,
  };
}

function relationshipKind(type: string): string {
  const slash = type.lastIndexOf("/");
  return slash >= 0 ? type.slice(slash + 1) : type;
}

function classifyRelationship(rel: InspectedRelationship): RelationshipCapability {
  const kind = relationshipKind(rel.type);
  if (rel.targetMode === "External") {
    if (/^(oleObject|attachedTemplate|control|activeX|vbaProject)$/i.test(kind)) {
      return {
        ...rel,
        preserve: "none",
        read: "none",
        edit: "none",
        disposition: "refused",
        unsupportedReason: kind.toLowerCase() === "attachedtemplate" ? "external_template" : "active_content",
      };
    }
    if (kind.toLowerCase() === "hyperlink" && /^(https?|mailto):/i.test(rel.target)) {
      return {
        ...rel,
        preserve: "opaque",
        read: "none",
        edit: "none",
        disposition: "limited",
        unsupportedReason: "passive_hyperlink",
      };
    }
    return {
      ...rel,
      preserve: "none",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "unsupported_external_content",
    };
  }
  if (/^(oleObject|control|activeX|vbaProject|altChunk)$/i.test(kind)) {
    return {
      ...rel,
      preserve: "none",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "active_content",
    };
  }
  if (/^attachedTemplate$/i.test(kind)) {
    return {
      ...rel,
      preserve: "none",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "external_template",
    };
  }
  return {
    ...rel,
    preserve: "full",
    read: "full",
    edit: "none",
    disposition: "supported",
    unsupportedReason: null,
  };
}

const EXPECTED_CONTENT_TYPES: Readonly<Record<string, string>> = {
  "word/document.xml": MAIN_DOCUMENT_CONTENT_TYPE,
  "word/comments.xml": "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
  "word/header1.xml": "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",
  "word/footer1.xml": "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
  "word/footnotes.xml": "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml",
  "word/endnotes.xml": "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml",
  "word/settings.xml": "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml",
};

function classifyPart(input: {
  name: string;
  contentType: string;
  relationshipTypes: readonly string[];
  sha256: string;
  byteSize: number;
  scan: NamespaceScan | null;
}): PartCapability {
  const { name, contentType, relationshipTypes, sha256, byteSize, scan } = input;
  const base = {
    partUri: "/" + name,
    contentType,
    relationshipTypes,
    sha256,
    byteSize,
  };

  if (/macroEnabled|vbaProject|activeX/i.test(contentType) || /vbaProject|activeX/i.test(name)) {
    return {
      ...base,
      preserve: "none",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "active_content",
    };
  }
  if (/(^|\/)embeddings\//i.test(name) || /oleObject/i.test(contentType)) {
    return {
      ...base,
      preserve: "none",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "embedded_object",
    };
  }
  if (/customXml\//i.test(name) || /customXml/i.test(contentType)) {
    return {
      ...base,
      preserve: "none",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "custom_xml",
    };
  }
  if (/_xmlsignatures/i.test(name)) {
    return {
      ...base,
      preserve: "none",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "digitally_signed",
    };
  }
  if (/encryptioninfo|encryptedpackage/i.test(name)) {
    return {
      ...base,
      preserve: "none",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "encrypted",
    };
  }
  if (/commentsExtended|commentsIds|commentsExtensible|people\.xml/i.test(name)) {
    return {
      ...base,
      preserve: "none",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "modern_comments",
    };
  }

  if (name === "word/document.xml" && contentType !== MAIN_DOCUMENT_CONTENT_TYPE) {
    return {
      ...base,
      preserve: "none",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "content_type_mismatch",
    };
  }
  const expectedType = EXPECTED_CONTENT_TYPES[name];
  if (expectedType && contentType !== expectedType) {
    return {
      ...base,
      preserve: "opaque",
      read: "none",
      edit: "none",
      disposition: "limited",
      unsupportedReason: "content_type_mismatch",
    };
  }

  if (scan?.spoofOfW) {
    return {
      ...base,
      preserve: "opaque",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "namespace_spoof",
    };
  }
  if (scan?.hasCustomXmlElement) {
    return {
      ...base,
      preserve: "none",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "custom_xml",
    };
  }
  if (scan?.hasProtection) {
    return {
      ...base,
      preserve: "none",
      read: "none",
      edit: "none",
      disposition: "refused",
      unsupportedReason: "protected_document",
    };
  }

  if (name === "word/document.xml") {
    if (scan && !scan.rootIsWmlDocument) {
      return {
        ...base,
        preserve: "none",
        read: "none",
        edit: "none",
        disposition: "refused",
        unsupportedReason: "malformed_namespaces",
      };
    }
    if (scan && !scan.hasWmlVisibleText) {
      return {
        ...base,
        preserve: "opaque",
        read: "none",
        edit: "none",
        disposition: "refused",
        unsupportedReason: "unsupported_empty_body",
      };
    }
    if (scan?.hasAlternateContent) {
      return {
        ...base,
        preserve: "opaque",
        read: "none",
        edit: "none",
        disposition: "limited",
        unsupportedReason: "alternate_content",
      };
    }
    return {
      ...base,
      preserve: "full",
      read: "full",
      edit: "surgical",
      disposition: "supported",
      unsupportedReason: null,
    };
  }

  if (/^word\/(header|footer)\d*\.xml$/i.test(name)) {
    return {
      ...base,
      preserve: "opaque",
      read: "none",
      edit: "none",
      disposition: "limited",
      unsupportedReason: "headers_footers_not_checked",
    };
  }
  if (name === "word/footnotes.xml" || name === "word/endnotes.xml") {
    return {
      ...base,
      preserve: "opaque",
      read: "none",
      edit: "none",
      disposition: "limited",
      unsupportedReason: "notes_not_checked",
    };
  }
  if (name === "word/comments.xml") {
    return {
      ...base,
      preserve: "opaque",
      read: "limited",
      edit: "none",
      disposition: "limited",
      unsupportedReason: "existing_comments_preserved",
    };
  }
  if (name === "[Content_Types].xml" || name.endsWith(".rels")) {
    return {
      ...base,
      preserve: "full",
      read: "full",
      edit: "none",
      disposition: "supported",
      unsupportedReason: null,
    };
  }
  if (
    name === "word/styles.xml" ||
    name === "word/numbering.xml" ||
    name === "word/settings.xml" ||
    name === "word/fontTable.xml" ||
    name === "word/webSettings.xml" ||
    name === "docProps/core.xml" ||
    name === "docProps/app.xml"
  ) {
    return {
      ...base,
      preserve: "full",
      read: "limited",
      edit: "none",
      disposition: "supported",
      unsupportedReason: null,
    };
  }
  if (/^word\/media\//i.test(name) || /image\//i.test(contentType)) {
    return {
      ...base,
      preserve: "opaque",
      read: "none",
      edit: "none",
      disposition: "limited",
      unsupportedReason: "media_not_checked",
    };
  }

  return {
    ...base,
    preserve: "opaque",
    read: "none",
    edit: "none",
    disposition: "unknown",
    unsupportedReason: "unknown_part",
  };
}

function rollupDisposition(
  parts: readonly PartCapability[],
  relationships: readonly RelationshipCapability[],
): { disposition: PackageDisposition; coverageReasons: string[]; refusedReason: string | null } {
  const refused = [...parts, ...relationships].find((item) => item.disposition === "refused");
  if (refused) {
    return {
      disposition: "refused",
      coverageReasons: [refused.unsupportedReason ?? "unsupported_package"],
      refusedReason: refused.unsupportedReason ?? "unsupported_package",
    };
  }
  const reasons = new Set<string>();
  for (const item of [...parts, ...relationships]) {
    if (item.disposition === "limited" || item.disposition === "unknown") {
      reasons.add(item.unsupportedReason ?? item.disposition);
    }
  }
  if (reasons.size > 0) {
    return { disposition: "limited", coverageReasons: [...reasons].sort(), refusedReason: null };
  }
  return { disposition: "supported", coverageReasons: [], refusedReason: null };
}

/**
 * Inventory every package part and relationship. Does not fetch external
 * targets, does not strip unknown/active parts, and does not mutate `bytes`.
 */
export async function inventoryPackageCapabilities(bytes: Uint8Array): Promise<PackageCapabilityReceipt> {
  const frozen = Buffer.from(bytes);
  const packageSha256 = sha256Hex(frozen);
  const manifest = inspectZipCentralDirectory(frozen);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(frozen, { checkCRC32: true, createFolders: false });
  } catch {
    reject("corrupt", "ZIP archive could not be loaded");
  }

  const names = manifest.entries.filter((entry) => !entry.isDirectory).map((entry) => entry.name);
  const nameSet = new Set(names);
  const partBytes = new Map<string, Buffer>();
  const xmlByName = new Map<string, string>();

  for (const entry of manifest.entries) {
    if (entry.isDirectory) continue;
    const file = zip.file(entry.name);
    if (!file) reject("corrupt", "ZIP entry could not be loaded by the package reader");
    let data: Uint8Array;
    try {
      data = await file.async("uint8array");
    } catch {
      reject("corrupt", "ZIP entry could not be decompressed or failed its CRC");
    }
    const copy = Buffer.from(data);
    partBytes.set(entry.name, copy);
    if (/\.xml$|\.rels$/i.test(entry.name) || entry.name === "[Content_Types].xml") {
      xmlByName.set(entry.name, decodeXml(copy, entry.uncompressedSize));
    }
  }

  const contentTypesXml = xmlByName.get("[Content_Types].xml");
  if (!contentTypesXml) reject("invalid_content_types", "Content types part is missing");
  const contentTypes = inspectContentTypes(contentTypesXml, names);

  const relXml = new Map<string, string>();
  for (const [name, xml] of xmlByName) {
    if (name.endsWith(".rels")) relXml.set(name, xml);
  }
  const inspectedRels = inspectRelationships(relXml, nameSet);
  const officeDocument = inspectedRels.find(
    (relationship) =>
      relationship.source === "" &&
      /officeDocument$/i.test(relationship.type) &&
      relationship.resolvedTarget === "word/document.xml",
  );
  if (!officeDocument) {
    reject("invalid_relationships", "Package root does not identify word/document.xml");
  }

  const relsByPart = new Map<string, string[]>();
  for (const rel of inspectedRels) {
    const targetName = rel.targetMode === "Internal" ? rel.resolvedTarget : "";
    if (!targetName) continue;
    const list = relsByPart.get(targetName) ?? [];
    list.push(rel.type);
    relsByPart.set(targetName, list);
  }

  const namespaces: NamespaceBinding[] = [];
  const scans = new Map<string, NamespaceScan>();
  for (const [name, xml] of xmlByName) {
    if (name.endsWith(".rels") || name === "[Content_Types].xml") continue;
    const scan = scanXmlNamespaces("/" + name, xml);
    scans.set(name, scan);
    namespaces.push(...scan.bindings);
  }

  const parts: PartCapability[] = names
    .slice()
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const raw = partBytes.get(name);
      if (!raw) reject("corrupt", "Package part bytes are missing");
      return classifyPart({
        name,
        contentType: contentTypes.get(name) ?? "",
        relationshipTypes: relsByPart.get(name) ?? [],
        sha256: sha256Hex(raw),
        byteSize: raw.byteLength,
        scan: scans.get(name) ?? null,
      });
    });

  const relationships = inspectedRels.map(classifyRelationship);
  const rollup = rollupDisposition(parts, relationships);
  const receiptHash = sha256Hex(
    JSON.stringify({
      version: PACKAGE_CAPABILITY_INVENTORY_VERSION,
      profileId: SUPPORTED_PROFILE_ID,
      disposition: rollup.disposition,
      refusedReason: rollup.refusedReason,
      coverageReasons: rollup.coverageReasons,
      parts: parts.map((part) => ({
        partUri: part.partUri,
        contentType: part.contentType,
        disposition: part.disposition,
        preserve: part.preserve,
        read: part.read,
        edit: part.edit,
        unsupportedReason: part.unsupportedReason,
        sha256: part.sha256,
      })),
      relationships: relationships.map((rel) => ({
        id: rel.id,
        type: rel.type,
        targetMode: rel.targetMode,
        disposition: rel.disposition,
        unsupportedReason: rel.unsupportedReason,
      })),
    }),
  );

  return {
    version: PACKAGE_CAPABILITY_INVENTORY_VERSION,
    profileId: SUPPORTED_PROFILE_ID,
    disposition: rollup.disposition,
    receiptHash,
    packageSha256,
    parts,
    relationships,
    namespaces,
    coverageReasons: rollup.coverageReasons,
    refusedReason: rollup.refusedReason,
  };
}

export function assertOriginalBytesUntouched(before: Uint8Array, after: Uint8Array): void {
  if (before.byteLength !== after.byteLength) {
    reject("source_bytes_mutated", "Package bytes changed during inventory");
  }
  for (let index = 0; index < before.byteLength; index += 1) {
    if (before[index] !== after[index]) {
      reject("source_bytes_mutated", "Package bytes changed during inventory");
    }
  }
}
