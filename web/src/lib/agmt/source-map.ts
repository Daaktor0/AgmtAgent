import { createHash } from "node:crypto";
import { SourceSpanSchema, type SourceSpan } from "./proof/contracts.ts";

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
};
export type ProofSource = {
  xml: string;
  tree: XmlNode[];
  paragraphs: SourceParagraph[];
  complete: boolean;
  gaps: string[];
  digest: string;
};

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

/** Called only by docx-v2 after its ZIP, package and XML gates. Paths index its preserve-order tree. */
export function mapProofSource(xml: string, tree: XmlNode[]): ProofSource {
  const paragraphs: SourceParagraph[] = [];
  const gaps = new Set<string>();
  let scope = "main_body";
  const unsafe = new Set(["w:sdt", "w:txbxContent", "w:altChunk", "mc:AlternateContent", "w:customXml"]);
  function visit(nodes: XmlNode[], prefix: number[], inTable: boolean, excluded: boolean): void {
    nodes.forEach((node, index) => {
      const tag = xmlTag(node), path = [...prefix, index];
      if (unsafe.has(tag)) gaps.add("unsupported_text_container");
      if (["w:moveFrom", "w:moveTo", "w:pPrChange", "w:tblPrChange", "w:trPrChange", "w:cellIns", "w:cellDel"].includes(tag)) gaps.add("complex_revision");
      if (tag === "w:del" || tag === "w:moveFrom") return;
      if (tag !== "w:p") {
        if (tag === "w:ins" && xmlChildren(node).some((n) => xmlTag(n) === "w:p")) gaps.add("complex_revision");
        visit(xmlChildren(node), path, inTable || tag === "w:tbl", excluded || unsafe.has(tag));
        return;
      }
      const p: SourceParagraph = { partUri: "/word/document.xml", paragraphPath: path, text: "", nodes: [], isTable: inTable, scope, style: null, safe: !excluded };
      let fieldDepth = 0;
      function texts(children: XmlNode[], base: number[], revision: boolean, blocked: boolean): void {
        children.forEach((child, i) => {
          const childTag = xmlTag(child), childPath = [...base, i];
          if (childTag === "w:del" || childTag === "w:moveFrom") return;
          if (childTag === "w:pStyle") p.style = xmlAttrs(child)["@_w:val"] ?? null;
          if (childTag === "w:fldChar") {
            const kind = xmlAttrs(child)["@_w:fldCharType"];
            if (kind === "begin") fieldDepth++;
            if (kind === "end") fieldDepth--;
            if (fieldDepth < 0) { p.safe = false; gaps.add("unbalanced_field"); }
          }
          if (unsafe.has(childTag)) { gaps.add("unsupported_text_container"); p.safe = false; }
          if (/^w:(?:moveFrom|moveTo|pPrChange|rPrChange|sectPrChange)$/.test(childTag)) gaps.add("complex_revision");
          const changed = revision || childTag === "w:ins" || childTag === "w:moveTo";
          const noEdit = blocked || unsafe.has(childTag) || childTag === "w:fldSimple" || childTag === "w:hyperlink";
          let text: string | null = null;
          if (childTag === "w:t") text = textValue(child);
          if (childTag === "w:tab") text = "\t";
          if (childTag === "w:br" || childTag === "w:cr") text = "\n";
          if (text !== null) {
            const start = p.text.length;
            p.text += text;
            if (text.length) p.nodes.push({ nodePath: childPath, start, end: p.text.length, text, editable: childTag === "w:t" && !changed && !noEdit && fieldDepth === 0, revision: changed });
          } else if (childTag !== "w:instrText" && childTag !== "w:delText") texts(xmlChildren(child), childPath, changed, noEdit);
        });
      }
      texts(xmlChildren(node), path, false, excluded);
      if (fieldDepth !== 0) { p.safe = false; gaps.add("unbalanced_field"); }
      const heading = p.text.match(/^\s*(SCHEDULE|ANNEX(?:URE)?|EXHIBIT)\s+([A-Za-z0-9]+)\s*(?:$|[—–:-])/i);
      if (heading) scope = `${heading[1].toLowerCase()}:${heading[2].toLowerCase()}:${paragraphs.length}`;
      p.scope = scope;
      paragraphs.push(p);
    });
  }
  visit(tree, [], false, false);
  if (paragraphs.reduce((n, p) => n + [...p.text].length, 0) > 1_000_000) throw new Error("extracted_text_limit");
  return deepFreeze({ xml, tree, paragraphs, complete: gaps.size === 0, gaps: [...gaps].sort(), digest: createHash("sha256").update(xml).digest("hex") });
}

export function sourceSpan(p: SourceParagraph, start: number, end: number): SourceSpan {
  if (!p.safe || start < 0 || end > p.text.length || end <= start || !surrogateBoundary(p.text, start) || !surrogateBoundary(p.text, end)) throw new Error("invalid_source_span");
  return SourceSpanSchema.parse({
    partUri: p.partUri, paragraphPath: [...p.paragraphPath], textStart: start, textEnd: end, projection: "final",
    nodeSegments: p.nodes.filter((n) => n.start < end && n.end > start).map((n) => ({ nodePath: [...n.nodePath], start: Math.max(0, start - n.start), end: Math.min(n.text.length, end - n.start) })),
  });
}

export function validateSourceSpan(source: ProofSource, span: SourceSpan, quote: string): SourceParagraph {
  SourceSpanSchema.parse(span);
  const p = source.paragraphs.find((p) => p.partUri === span.partUri && JSON.stringify(p.paragraphPath) === JSON.stringify(span.paragraphPath));
  if (!p) throw new Error("invalid_source_paragraph");
  const expected = sourceSpan(p, span.textStart, span.textEnd);
  if (JSON.stringify(expected) !== JSON.stringify(span)) throw new Error("source_node_mismatch");
  const actual = span.nodeSegments.map((s) => {
    const node = nodeAt(source.tree, s.nodePath);
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
