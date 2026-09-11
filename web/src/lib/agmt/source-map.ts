import { SourceSpanSchema, type SourceSpan } from "./proof/contracts.ts";
import { PROJECTION_VERSION, projectPart } from "./projection.ts";

export type XmlNode = Record<string, unknown>;
export type SourceNode = {
  nodePath: number[];
  start: number;
  end: number;
  text: string;
  editable: boolean;
  revision: boolean;
};
export type SourceParagraph = {
  partUri: string;
  paragraphPath: number[];
  text: string;
  nodes: SourceNode[];
  isTable: boolean;
  scope: string;
  style: string | null;
  safe: boolean;
  storyId: string;
  language?: string | null;
};
export type ProofPartSource = {
  partUri: string;
  xml: string;
  tree: XmlNode[];
};

export type ProofSource = {
  xml: string;
  tree: XmlNode[];
  paragraphs: SourceParagraph[];
  complete: boolean;
  gaps: string[];
  digest: string;
  projectionVersion?: string;
  parts: Readonly<Record<string, ProofPartSource>>;
  storyParagraphs: SourceParagraph[];
};

export function treeFor(source: ProofSource, partUri: string): XmlNode[] {
  if (partUri === "/word/document.xml") return source.tree;
  const part = source.parts[partUri];
  if (!part) throw new Error("unknown_source_part");
  return part.tree;
}

export function xmlFor(source: ProofSource, partUri: string): string {
  if (partUri === "/word/document.xml") return source.xml;
  const part = source.parts[partUri];
  if (!part) throw new Error("unknown_source_part");
  return part.xml;
}

export function findSourceParagraph(
  source: ProofSource,
  partUri: string,
  paragraphPath: readonly number[],
  extra: readonly SourceParagraph[] = [],
): SourceParagraph | undefined {
  const key = JSON.stringify(paragraphPath);
  return [...source.paragraphs, ...source.storyParagraphs, ...extra].find(
    (paragraph) => paragraph.partUri === partUri && JSON.stringify(paragraph.paragraphPath) === key,
  );
}

export function xmlTag(node: XmlNode): string {
  return Object.keys(node).find((key) => key !== ":@") ?? "";
}
export function xmlChildren(node: XmlNode): XmlNode[] {
  const value = node[xmlTag(node)];
  return Array.isArray(value) ? value : [];
}
export function xmlAttrs(node: XmlNode): Record<string, string> {
  return (node[":@"] ?? {}) as Record<string, string>;
}
export function nodeAt(tree: XmlNode[], path: number[]): XmlNode {
  let nodes = tree;
  let found: XmlNode | undefined;
  for (const index of path) {
    found = nodes[index];
    if (!found) throw new Error("invalid_source_path");
    nodes = xmlChildren(found);
  }
  if (!found) throw new Error("invalid_source_path");
  return found;
}
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
function textValue(node: XmlNode): string {
  return xmlChildren(node).map((child) => typeof child["#text"] === "string" ? child["#text"] : "").join("");
}
function surrogateBoundary(text: string, offset: number): boolean {
  return offset <= 0 || offset >= text.length || !(text.charCodeAt(offset - 1) >= 0xd800 && text.charCodeAt(offset - 1) <= 0xdbff && text.charCodeAt(offset) >= 0xdc00 && text.charCodeAt(offset) <= 0xdfff);
}

const graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Half-open offsets must not split UTF-16 surrogates or grapheme clusters. */
export function graphemeBoundary(text: string, offset: number): boolean {
  if (!surrogateBoundary(text, offset)) return false;
  if (offset <= 0 || offset >= text.length) return true;
  for (const { index, segment } of graphemeSegmenter.segment(text)) {
    if (offset > index && offset < index + segment.length) return false;
    if (index >= offset) break;
  }
  return true;
}

/** Called only by docx-v2 after its ZIP, package and XML gates. Paths index its preserve-order tree. */
export function mapProofSource(xml: string, tree: XmlNode[], inheritedLanguage: string | null = null): ProofSource {
  const story = projectPart({
    xml,
    tree,
    partUri: "/word/document.xml",
    storyKind: "body",
    storyId: "body:main",
    inheritedLanguage,
  });
  const part = { partUri: "/word/document.xml", xml, tree };
  return deepFreeze({
    xml,
    tree,
    paragraphs: story.paragraphs,
    complete: story.complete,
    gaps: story.gaps,
    digest: story.digest,
    projectionVersion: PROJECTION_VERSION,
    parts: { "/word/document.xml": part },
    storyParagraphs: [],
  });
}

export function sourceSpan(p: SourceParagraph, start: number, end: number): SourceSpan {
  if (!p.safe || start < 0 || end > p.text.length || end <= start || !graphemeBoundary(p.text, start) || !graphemeBoundary(p.text, end)) throw new Error("invalid_source_span");
  return SourceSpanSchema.parse({
    partUri: p.partUri, paragraphPath: [...p.paragraphPath], textStart: start, textEnd: end, projection: "final",
    nodeSegments: p.nodes.filter((n) => n.start < end && n.end > start).map((n) => ({ nodePath: [...n.nodePath], start: Math.max(0, start - n.start), end: Math.min(n.text.length, end - n.start) })),
  });
}

export function validateSourceSpan(
  source: ProofSource,
  span: SourceSpan,
  quote: string,
  extra: readonly SourceParagraph[] = [],
): SourceParagraph {
  SourceSpanSchema.parse(span);
  const p = findSourceParagraph(source, span.partUri, span.paragraphPath, extra);
  if (!p) throw new Error("invalid_source_paragraph");
  const expected = sourceSpan(p, span.textStart, span.textEnd);
  if (JSON.stringify(expected) !== JSON.stringify(span)) throw new Error("source_node_mismatch");
  const tree = treeFor(source, span.partUri);
  const actual = span.nodeSegments.map((s) => {
    const node = nodeAt(tree, s.nodePath);
    const tag = xmlTag(node);
    const value = tag === "w:t" ? textValue(node) : tag === "w:tab" ? "\t" : ["w:br", "w:cr"].includes(tag) ? "\n" : null;
    if (value === null) throw new Error("invalid_source_text_node");
    return value.slice(s.start, s.end);
  }).join("");
  if (actual !== quote || actual !== p.text.slice(span.textStart, span.textEnd)) throw new Error("source_quote_mismatch");
  return p;
}

export function evaluatedScope(source: ProofSource, scope: string, matches: number) {
  if (!source.complete || !source.paragraphs.some((p) => p.scope === scope)) throw new Error("incomplete_scope");
  return { evaluatedScopes: [scope], inventoryDigest: source.digest, matchCount: matches };
}
