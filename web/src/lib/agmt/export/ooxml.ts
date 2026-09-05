import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { nodeAt, xmlTag, xmlChildren, xmlAttrs, type XmlNode } from "../source-map.ts";

export const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", preserveOrder: true, trimValues: false, parseTagValue: false });
export const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_", preserveOrder: true, format: false, suppressEmptyNode: true });
export function element(tag: string, children: XmlNode[] = [], attrs: Record<string, string> = {}): XmlNode {
  return { [tag]: children, ...(Object.keys(attrs).length ? { ":@": attrs } : {}) };
}
export function textRun(text: string, template?: XmlNode): XmlNode {
  const properties = template ? xmlChildren(template).filter((n) => xmlTag(n) === "w:rPr") : [];
  return element("w:r", [...structuredClone(properties), element("w:t", [{ "#text": text }], { "@_xml:space": "preserve" })], template ? { ...xmlAttrs(template) } : {});
}
export function walk(nodes: XmlNode[], fn: (node: XmlNode) => void): void {
  for (const node of nodes) { fn(node); walk(xmlChildren(node), fn); }
}
export function ids(nodes: XmlNode[], tag: string): Set<string> {
  const found = new Set<string>();
  walk(nodes, (n) => { if (xmlTag(n) === tag) found.add(xmlAttrs(n)["@_w:id"]); });
  return found;
}

/** Lexical locations only: parsing/projection belongs to docx-v2. Keep every untouched XML byte. */
export function replaceParagraphXml(xml: string, original: XmlNode[], modified: XmlNode[], paths: number[][]): string {
  const orderedPaths: number[][] = [];
  function visit(nodes: XmlNode[], path: number[]): void {
    nodes.forEach((n, i) => { const next = [...path, i]; if (xmlTag(n) === "w:p") orderedPaths.push(next); visit(xmlChildren(n), next); });
  }
  visit(original, []);
  const ranges: { start: number; end: number }[] = [], stack: number[] = [];
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
  for (const m of xml.matchAll(tokens)) {
    if (/^<w:p(?=[\s/>])/.test(m[0])) {
      const index = ranges.length; ranges.push({ start: m.index, end: m.index + m[0].length });
      if (!/\/>$/.test(m[0])) stack.push(index);
    } else if (/^<\/w:p\s*>$/.test(m[0])) {
      const index = stack.pop(); if (index === undefined) throw new Error("paragraph_xml_mismatch");
      ranges[index].end = m.index + m[0].length;
    }
  }
  if (ranges.length !== orderedPaths.length || stack.length) throw new Error("paragraph_xml_mismatch");
  const replacements = paths.map((path) => {
    const index = orderedPaths.findIndex((p) => JSON.stringify(p) === JSON.stringify(path));
    if (index < 0) throw new Error("paragraph_xml_missing");
    return { ...ranges[index], text: builder.build([nodeAt(modified, path)]) as string };
  }).sort((a, b) => b.start - a.start);
  for (let i = 0; i < replacements.length; i++) {
    const r = replacements[i];
    if (i > 0 && r.end > replacements[i - 1].start) throw new Error("nested_paragraph_edits");
    xml = xml.slice(0, r.start) + r.text + xml.slice(r.end);
  }
  return xml;
}

/** Ignore lexical attribute order and equivalent split runs, preserve all prior review structure. */
export function semantic(nodes: XmlNode[]): unknown {
  const normalized: XmlNode[] = [];
  for (const n of nodes) {
    const tag = xmlTag(n);
    if (tag === "?xml") continue;
    if (tag === "#text") { normalized.push(n); continue; }
    const attrs = Object.fromEntries(Object.entries(xmlAttrs(n)).filter(([k]) => k !== "@_xml:space").sort(([a], [b]) => a.localeCompare(b)));
    const children = semantic(xmlChildren(n)) as XmlNode[];
    const current = element(tag, children, attrs);
    const previous = normalized.at(-1);
    if (tag === "w:r" && previous && xmlTag(previous) === "w:r") {
      const prevChildren = xmlChildren(previous);
      const props = children.filter((c) => xmlTag(c) === "w:rPr");
      const prevProps = prevChildren.filter((c) => xmlTag(c) === "w:rPr");
      const text = children.filter((c) => xmlTag(c) !== "w:rPr");
      const prevText = prevChildren.filter((c) => xmlTag(c) !== "w:rPr");
      if (JSON.stringify(xmlAttrs(previous)) === JSON.stringify(attrs) && JSON.stringify(props) === JSON.stringify(prevProps) && text.every((c) => xmlTag(c) === "w:t") && prevText.every((c) => xmlTag(c) === "w:t")) {
        const value = [...prevText, ...text].flatMap(xmlChildren).map((c) => c["#text"] ?? "").join("");
        previous["w:r"] = [...prevProps, element("w:t", [{ "#text": value }])];
        continue;
      }
    }
    normalized.push(current);
  }
  return normalized;
}

/** Only remove IDs allocated for this export, never all changes by an author name. */
export function resolveAdded(nodes: XmlNode[], revisionIds: Set<string>, commentIds: Set<string>, accept: boolean): XmlNode[] {
  const output: XmlNode[] = [];
  for (const original of nodes) {
    const node = structuredClone(original), tag = xmlTag(node), id = xmlAttrs(node)["@_w:id"];
    if (["w:commentRangeStart", "w:commentRangeEnd", "w:commentReference"].includes(tag) && commentIds.has(id)) continue;
    if (["w:ins", "w:del"].includes(tag) && revisionIds.has(id)) {
      if ((tag === "w:ins") === accept) {
        const children = xmlChildren(node);
        if (tag === "w:del") walk(children, (n) => { if (xmlTag(n) === "w:delText") { n["w:t"] = n["w:delText"]; delete n["w:delText"]; } });
        output.push(...resolveAdded(children, revisionIds, commentIds, accept));
      }
      continue;
    }
    if (tag !== "#text") node[tag] = resolveAdded(xmlChildren(node), revisionIds, commentIds, accept);
    if (tag === "w:r" && xmlChildren(node).length === 0) continue;
    output.push(node);
  }
  return output;
}
