/**
 * Immutable final-view story projection (PWC-06).
 *
 * Visible text is the accepted revision view. Deletion, field instructions and
 * vanished runs are excluded and recorded. Stories stay separate. The source
 * XML is never normalised.
 */
import { createHash } from "node:crypto";
import type { SourceNode, SourceParagraph, XmlNode } from "./source-map.ts";

function xmlTag(node: XmlNode): string {
  return Object.keys(node).find((key) => key !== ":@") ?? "";
}
function xmlChildren(node: XmlNode): XmlNode[] {
  const value = node[xmlTag(node)];
  return Array.isArray(value) ? value : [];
}
function xmlAttrs(node: XmlNode): Record<string, string> {
  return (node[":@"] ?? {}) as Record<string, string>;
}

export const PROJECTION_VERSION = "proof-projection-v1";

export type StoryKind = "body" | "header" | "footer" | "footnote" | "endnote";

export type SkippedRegion = {
  reason: "deletion" | "instruction" | "hidden" | "unsupported" | "unbalanced_field" | "move_revision";
  nodePath: number[];
};

export type ProjectedParagraph = SourceParagraph & {
  storyId: string;
  language: string | null;
};

export type StoryProjection = {
  projectionVersion: typeof PROJECTION_VERSION;
  storyId: string;
  storyKind: StoryKind;
  partUri: string;
  paragraphs: ProjectedParagraph[];
  skipped: SkippedRegion[];
  complete: boolean;
  gaps: string[];
  digest: string;
};

const UNSAFE = new Set(["w:sdt", "w:txbxContent", "w:altChunk", "mc:AlternateContent", "w:customXml"]);
const MOVE_OR_PROP_CHANGE = new Set([
  "w:moveFrom",
  "w:moveTo",
  "w:pPrChange",
  "w:tblPrChange",
  "w:trPrChange",
  "w:cellIns",
  "w:cellDel",
  "w:rPrChange",
  "w:sectPrChange",
]);

function textValue(node: XmlNode): string {
  return xmlChildren(node).map((child) => (typeof child["#text"] === "string" ? child["#text"] : "")).join("");
}

function findLang(nodes: XmlNode[], inherited: string | null): string | null {
  for (const node of nodes) {
    const tag = xmlTag(node);
    if (tag === "w:lang") {
      const value = xmlAttrs(node)["@_w:val"];
      return value && value.trim() ? value.trim() : inherited;
    }
    if (tag === "w:pPr" || tag === "w:rPr") {
      const nested = findLang(xmlChildren(node), inherited);
      if (nested != null) return nested;
    }
  }
  return inherited;
}

function runIsHidden(runChildren: XmlNode[]): boolean {
  for (const child of runChildren) {
    if (xmlTag(child) !== "w:rPr") continue;
    if (xmlChildren(child).some((node) => xmlTag(node) === "w:vanish" || xmlTag(node) === "w:webHidden")) {
      return true;
    }
  }
  return false;
}

export function projectPart(input: {
  xml: string;
  tree: XmlNode[];
  partUri: string;
  storyKind: StoryKind;
  storyId: string;
}): StoryProjection {
  const paragraphs: ProjectedParagraph[] = [];
  const skipped: SkippedRegion[] = [];
  const gaps = new Set<string>();
  let scope = input.storyKind === "body" ? "main_body" : input.storyKind;
  let fieldDepth = 0;

  function skip(reason: SkippedRegion["reason"], nodePath: number[]): void {
    skipped.push({ reason, nodePath });
    if (reason === "unsupported") gaps.add("unsupported_text_container");
    if (reason === "unbalanced_field") gaps.add("unbalanced_field");
    if (reason === "move_revision") gaps.add("complex_revision");
  }

  function visit(nodes: XmlNode[], prefix: number[], inTable: boolean, excluded: boolean, language: string | null): void {
    nodes.forEach((node, index) => {
      const tag = xmlTag(node);
      const path = [...prefix, index];
      const children = xmlChildren(node);
      const nextLanguage = findLang(tag === "w:p" || tag === "w:r" ? children : [node], language);

      if (UNSAFE.has(tag)) {
        skip("unsupported", path);
        visit(children, path, inTable, true, nextLanguage);
        return;
      }
      if (MOVE_OR_PROP_CHANGE.has(tag) && tag !== "w:moveTo") {
        skip(tag === "w:moveFrom" ? "move_revision" : "move_revision", path);
        if (tag === "w:moveFrom") return;
      }
      if (tag === "w:del") {
        skip("deletion", path);
        return;
      }
      if (tag !== "w:p") {
        if (tag === "w:ins" && children.some((child) => xmlTag(child) === "w:p")) gaps.add("complex_revision");
        visit(children, path, inTable || tag === "w:tbl" || tag === "w:tc", excluded, nextLanguage);
        return;
      }

      const paragraph: ProjectedParagraph = {
        partUri: input.partUri,
        paragraphPath: path,
        text: "",
        nodes: [],
        isTable: inTable,
        scope,
        style: null,
        safe: !excluded,
        storyId: input.storyId,
        language: nextLanguage,
      };

      function texts(kids: XmlNode[], base: number[], revision: boolean, blocked: boolean, runLanguage: string | null): void {
        kids.forEach((child, i) => {
          const childTag = xmlTag(child);
          const childPath = [...base, i];
          const childKids = xmlChildren(child);
          if (childTag === "w:del" || childTag === "w:moveFrom") {
            skip(childTag === "w:del" ? "deletion" : "move_revision", childPath);
            return;
          }
          if (childTag === "w:pStyle") paragraph.style = xmlAttrs(child)["@_w:val"] ?? null;
          if (childTag === "w:lang") {
            const value = xmlAttrs(child)["@_w:val"];
            if (value) paragraph.language = value;
          }
          if (childTag === "w:fldChar") {
            const kind = xmlAttrs(child)["@_w:fldCharType"];
            if (kind === "begin") fieldDepth += 1;
            if (kind === "end") fieldDepth -= 1;
            if (fieldDepth < 0) {
              paragraph.safe = false;
              skip("unbalanced_field", childPath);
            }
          }
          if (UNSAFE.has(childTag)) {
            skip("unsupported", childPath);
            paragraph.safe = false;
          }
          if (MOVE_OR_PROP_CHANGE.has(childTag)) gaps.add("complex_revision");
          const changed = revision || childTag === "w:ins" || childTag === "w:moveTo";
          const hiddenRun = childTag === "w:r" && runIsHidden(childKids);
          if (hiddenRun) {
            skip("hidden", childPath);
            return;
          }
          const noEdit = blocked || UNSAFE.has(childTag) || childTag === "w:fldSimple" || childTag === "w:hyperlink";
          const nodeLanguage = childTag === "w:r" ? findLang(childKids, runLanguage) : runLanguage;
          let text: string | null = null;
          if (childTag === "w:t") text = textValue(child);
          if (childTag === "w:tab") text = "\t";
          if (childTag === "w:br" || childTag === "w:cr") text = "\n";
          if (childTag === "w:instrText") {
            skip("instruction", childPath);
            return;
          }
          if (text !== null) {
            const start = paragraph.text.length;
            paragraph.text += text;
            if (text.length) {
              const sourceNode: SourceNode = {
                nodePath: childPath,
                start,
                end: paragraph.text.length,
                text,
                editable: childTag === "w:t" && !changed && !noEdit && fieldDepth === 0,
                revision: changed,
              };
              paragraph.nodes.push(sourceNode);
              if (nodeLanguage && paragraph.language == null) paragraph.language = nodeLanguage;
            }
          } else if (childTag !== "w:delText") {
            texts(childKids, childPath, changed, noEdit, nodeLanguage);
          } else {
            skip("deletion", childPath);
          }
        });
      }

      texts(children, path, false, excluded, nextLanguage);
      const heading = paragraph.text.match(/^\s*(SCHEDULE|ANNEX(?:URE)?|EXHIBIT)\s+([A-Za-z0-9]+)\s*(?:$|[—–:-])/i);
      if (heading && input.storyKind === "body") {
        scope = `${heading[1].toLowerCase()}:${heading[2].toLowerCase()}:${paragraphs.length}`;
      }
      paragraph.scope = scope;
      paragraphs.push(paragraph);
    });
  }

  visit(input.tree, [], false, false, null);
  if (fieldDepth !== 0) {
    gaps.add("unbalanced_field");
    skipped.push({ reason: "unbalanced_field", nodePath: [] });
  }
  if (paragraphs.reduce((count, paragraph) => count + [...paragraph.text].length, 0) > 1_000_000) {
    throw new Error("extracted_text_limit");
  }

  return {
    projectionVersion: PROJECTION_VERSION,
    storyId: input.storyId,
    storyKind: input.storyKind,
    partUri: input.partUri,
    paragraphs,
    skipped,
    complete: gaps.size === 0,
    gaps: [...gaps].sort(),
    digest: createHash("sha256").update(input.xml).digest("hex"),
  };
}

export function storySeparator(left: ProjectedParagraph, right: ProjectedParagraph): "none" | "cell" | "story" {
  if (left.storyId !== right.storyId || left.partUri !== right.partUri) return "story";
  if (left.isTable || right.isTable) return "cell";
  return "none";
}
