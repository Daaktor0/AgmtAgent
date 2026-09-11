/**
 * Exact non-main story maps (PWC-38 / PEE-31).
 *
 * Headers, footers, footnotes and endnotes are mapped to their parts and
 * paragraphs. Linked section headers share one part and are not double-counted.
 * Lexical checks and export are enabled per story only after Word can anchor
 * the result in that story. Unanchorable findings are suppressed, never moved
 * into the main body.
 */
import { createHash } from "node:crypto";
import type { DocxPackage } from "./docx-package.ts";
import { parser } from "./export/ooxml.ts";
import { projectPart, type StoryKind } from "./projection.ts";
import {
  deepFreeze,
  xmlAttrs,
  xmlChildren,
  xmlTag,
  type ProofPartSource,
  type ProofSource,
  type SourceParagraph,
  type XmlNode,
} from "./source-map.ts";

export const STORY_MAP_VERSION = "proof-story-map-v1";

export const STORY_EXPORT_POLICY = {
  body: { lexical: true, correction: true, comment: true },
  header: { lexical: true, correction: true, comment: false },
  footer: { lexical: false, correction: false, comment: false },
  footnote: { lexical: false, correction: false, comment: false },
  endnote: { lexical: false, correction: false, comment: false },
} as const;

export type StoryExportPolicy = typeof STORY_EXPORT_POLICY;

export type StoryCoverageState = "checked" | "mapped_unchecked" | "unanchorable" | "absent";

export type StoryRecord = {
  storyId: string;
  storyKind: StoryKind;
  partUri: string;
  relationshipIds: string[];
  sectionTypes: string[];
  noteId: string | null;
  linked: boolean;
  separator: boolean;
  xml: string;
  tree: XmlNode[];
  paragraphs: SourceParagraph[];
  complete: boolean;
  gaps: string[];
  digest: string;
  lexical: boolean;
  exportCorrection: boolean;
  exportComment: boolean;
};

export type StoryCoverage = {
  storyKind: StoryKind;
  state: StoryCoverageState;
  reason: string | null;
  partUris: string[];
};

export type StoryMap = {
  version: typeof STORY_MAP_VERSION;
  stories: StoryRecord[];
  coverage: StoryCoverage[];
};

const NOTE_SEPARATOR_TYPES = new Set(["separator", "continuationSeparator", "continuationNotice"]);
const HEADER_REL = /\/header$/i;
const FOOTER_REL = /\/footer$/i;
const FOOTNOTE_REL = /\/footnotes$/i;
const ENDNOTE_REL = /\/endnotes$/i;

export function storyKindOf(storyId: string): StoryKind {
  if (storyId.startsWith("header:")) return "header";
  if (storyId.startsWith("footer:")) return "footer";
  if (storyId.startsWith("footnote:")) return "footnote";
  if (storyId.startsWith("endnote:")) return "endnote";
  return "body";
}

function walk(nodes: XmlNode[], fn: (node: XmlNode, path: number[]) => void, prefix: number[] = []): void {
  nodes.forEach((node, index) => {
    const path = [...prefix, index];
    fn(node, path);
    walk(xmlChildren(node), fn, path);
  });
}

function pathPrefix(path: readonly number[], prefix: readonly number[]): boolean {
  return prefix.length <= path.length && prefix.every((value, index) => path[index] === value);
}

function partName(partUri: string): string {
  return partUri.replace(/^\//, "");
}

function relationshipTarget(sourceName: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const base = sourceName ? sourceName.replace(/\/?$/, "/") : "";
  const joined = `${base}${target}`.replace(/\/+/g, "/");
  const parts: string[] = [];
  for (const piece of joined.split("/")) {
    if (piece === "" || piece === ".") continue;
    if (piece === "..") parts.pop();
    else parts.push(piece);
  }
  return parts.join("/");
}

type Rel = { id: string; type: string; target: string; resolved: string };

function readRelationships(pkg: DocxPackage, relName: string): Rel[] {
  if (!pkg.has(relName)) return [];
  const tree: XmlNode[] = parser.parse(pkg.text(relName));
  const root = tree.find((node) => xmlTag(node) === "Relationships");
  if (!root) return [];
  const source = relName.replace(/_rels\/[^/]+\.rels$/, "").replace(/\/$/, "");
  return xmlChildren(root).filter((node) => xmlTag(node) === "Relationship").map((node) => {
    const attrs = xmlAttrs(node);
    const target = attrs["@_Target"] ?? "";
    return {
      id: attrs["@_Id"] ?? "",
      type: attrs["@_Type"] ?? "",
      target,
      resolved: relationshipTarget(source, target),
    };
  });
}

function sectionReferences(tree: XmlNode[]): { id: string; kind: "header" | "footer"; type: string }[] {
  const found: { id: string; kind: "header" | "footer"; type: string }[] = [];
  walk(tree, (node) => {
    const tag = xmlTag(node);
    if (tag !== "w:headerReference" && tag !== "w:footerReference") return;
    const attrs = xmlAttrs(node);
    found.push({
      id: attrs["@_r:id"] ?? "",
      kind: tag === "w:footerReference" ? "footer" : "header",
      type: attrs["@_w:type"] ?? "default",
    });
  });
  return found;
}

function noteMeta(node: XmlNode): { id: string; type: string; path: number[] } | null {
  const tag = xmlTag(node);
  if (tag !== "w:footnote" && tag !== "w:endnote") return null;
  const attrs = xmlAttrs(node);
  return { id: attrs["@_w:id"] ?? "", type: attrs["@_w:type"] ?? "", path: [] };
}

function isSeparatorNote(id: string, type: string): boolean {
  return NOTE_SEPARATOR_TYPES.has(type) || id === "-1" || id === "0";
}

function projectXml(xml: string, partUri: string, storyKind: StoryKind, storyId: string): {
  tree: XmlNode[];
  paragraphs: SourceParagraph[];
  complete: boolean;
  gaps: string[];
  digest: string;
} {
  const tree: XmlNode[] = parser.parse(xml);
  const projected = projectPart({ xml, tree, partUri, storyKind, storyId });
  return {
    tree,
    paragraphs: projected.paragraphs,
    complete: projected.complete,
    gaps: projected.gaps,
    digest: projected.digest,
  };
}

function coverageFor(stories: StoryRecord[]): StoryCoverage[] {
  const kinds: StoryKind[] = ["header", "footer", "footnote", "endnote"];
  return kinds.map((storyKind) => {
    const group = stories.filter((story) => story.storyKind === storyKind && !story.separator);
    if (!group.length) return { storyKind, state: "absent", reason: null, partUris: [] };
    const partUris = [...new Set(group.map((story) => story.partUri))];
    const policy = STORY_EXPORT_POLICY[storyKind];
    if (!policy.lexical) {
      return {
        storyKind,
        state: "mapped_unchecked",
        reason: storyKind === "footer" ? "footers_not_checked" : storyKind === "header" ? "headers_footers_not_checked" : "notes_not_checked",
        partUris,
      };
    }
    if (!policy.comment) {
      return {
        storyKind,
        state: "unanchorable",
        reason: "header_comments_unanchorable",
        partUris,
      };
    }
    return { storyKind, state: "checked", reason: null, partUris };
  });
}

export function mapDocumentStories(pkg: DocxPackage, document: { xml: string; tree: XmlNode[] }): StoryMap {
  const documentRels = readRelationships(pkg, "word/_rels/document.xml.rels");
  const refs = sectionReferences(document.tree);
  const stories: StoryRecord[] = [];
  const seenParts = new Set<string>();

  const headerFooterRels = documentRels.filter((rel) => HEADER_REL.test(rel.type) || FOOTER_REL.test(rel.type));
  for (const rel of headerFooterRels) {
    const name = rel.resolved;
    if (!pkg.has(name)) continue;
    const partUri = `/${name}`;
    const storyKind: StoryKind = HEADER_REL.test(rel.type) ? "header" : "footer";
    const policy = STORY_EXPORT_POLICY[storyKind];
    const xml = pkg.text(name);
    const projected = projectXml(xml, partUri, storyKind, `${storyKind}:${name}`);
    const matchingRels = headerFooterRels.filter((item) => item.resolved === name);
    const sectionTypes = refs.filter((item) => matchingRels.some((candidate) => candidate.id === item.id)).map((item) => item.type);
    const record: StoryRecord = {
      storyId: `${storyKind}:${name}`,
      storyKind,
      partUri,
      relationshipIds: [...new Set(matchingRels.map((item) => item.id))],
      sectionTypes: [...new Set(sectionTypes.length ? sectionTypes : ["default"])],
      noteId: null,
      linked: refs.filter((item) => matchingRels.some((candidate) => candidate.id === item.id)).length > 1,
      separator: false,
      xml,
      tree: projected.tree,
      paragraphs: projected.paragraphs,
      complete: projected.complete,
      gaps: projected.gaps,
      digest: projected.digest,
      lexical: policy.lexical,
      exportCorrection: policy.correction,
      exportComment: policy.comment,
    };
    if (seenParts.has(partUri)) continue;
    seenParts.add(partUri);
    stories.push(record);
  }

  for (const spec of [
    { name: "word/footnotes.xml", kind: "footnote" as const, rel: FOOTNOTE_REL, noteTag: "w:footnote" },
    { name: "word/endnotes.xml", kind: "endnote" as const, rel: ENDNOTE_REL, noteTag: "w:endnote" },
  ]) {
    if (!pkg.has(spec.name)) continue;
    const partUri = `/${spec.name}`;
    const xml = pkg.text(spec.name);
    const projected = projectXml(xml, partUri, spec.kind, `${spec.kind}:${spec.name}`);
    const noteNodes: { node: XmlNode; path: number[]; id: string; type: string }[] = [];
    walk(projected.tree, (node, path) => {
      if (xmlTag(node) !== spec.noteTag) return;
      const attrs = xmlAttrs(node);
      noteNodes.push({ node, path, id: attrs["@_w:id"] ?? "", type: attrs["@_w:type"] ?? "" });
    });
    const relIds = documentRels.filter((rel) => spec.rel.test(rel.type)).map((rel) => rel.id);
    const policy = STORY_EXPORT_POLICY[spec.kind];
    if (!noteNodes.length) {
      stories.push({
        storyId: `${spec.kind}:${spec.name}`,
        storyKind: spec.kind,
        partUri,
        relationshipIds: relIds,
        sectionTypes: [],
        noteId: null,
        linked: false,
        separator: false,
        xml,
        tree: projected.tree,
        paragraphs: [],
        complete: projected.complete,
        gaps: projected.gaps,
        digest: projected.digest,
        lexical: policy.lexical,
        exportCorrection: policy.correction,
        exportComment: policy.comment,
      });
      continue;
    }
    for (const note of noteNodes) {
      const separator = isSeparatorNote(note.id, note.type);
      const paragraphs = projected.paragraphs.filter((paragraph) => pathPrefix(paragraph.paragraphPath, note.path));
      stories.push({
        storyId: `${spec.kind}:${note.id || spec.name}`,
        storyKind: spec.kind,
        partUri,
        relationshipIds: relIds,
        sectionTypes: [],
        noteId: note.id || null,
        linked: false,
        separator,
        xml,
        tree: projected.tree,
        paragraphs,
        complete: projected.complete,
        gaps: projected.gaps,
        digest: createHash("sha256").update(`${spec.name}:${note.id}`).digest("hex"),
        lexical: separator ? false : policy.lexical,
        exportCorrection: separator ? false : policy.correction,
        exportComment: separator ? false : policy.comment,
      });
    }
  }

  return deepFreeze({
    version: STORY_MAP_VERSION,
    stories,
    coverage: coverageFor(stories),
  });
}

export function attachStoryParts(source: ProofSource, storyMap: StoryMap): ProofSource {
  const parts: Record<string, ProofPartSource> = {
    "/word/document.xml": source.parts["/word/document.xml"] ?? { partUri: "/word/document.xml", xml: source.xml, tree: source.tree },
  };
  for (const story of storyMap.stories) {
    if (parts[story.partUri]) continue;
    parts[story.partUri] = { partUri: story.partUri, xml: story.xml, tree: story.tree };
  }
  const storyParagraphs = lexicalParagraphs(source, storyMap).filter((paragraph) => paragraph.partUri !== "/word/document.xml");
  return deepFreeze({ ...source, parts, storyParagraphs });
}

export function lexicalParagraphs(source: ProofSource, storyMap: StoryMap | undefined): SourceParagraph[] {
  const extra = (storyMap?.stories ?? [])
    .filter((story) => story.lexical && !story.separator)
    .flatMap((story) => story.paragraphs);
  return [...source.paragraphs, ...extra];
}

export function storyParagraphs(storyMap: StoryMap | undefined): SourceParagraph[] {
  return (storyMap?.stories ?? []).flatMap((story) => story.paragraphs);
}

export function storyCoverageReasons(storyMap: StoryMap | undefined): string[] {
  const reasons = new Set<string>();
  for (const item of storyMap?.coverage ?? []) {
    if (item.state === "absent" || item.state === "checked") continue;
    if (item.reason) reasons.add(item.reason);
  }
  return [...reasons].sort();
}

export function storyAllows(
  storyId: string,
  action: "correction" | "comment",
): boolean {
  const kind = storyKindOf(storyId);
  const policy = STORY_EXPORT_POLICY[kind];
  return action === "correction" ? policy.correction : policy.comment;
}

export function partFileName(partUri: string): string {
  return partName(partUri);
}
