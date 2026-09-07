/**
 * Preflight whether an exact span can be realized as a tracked change or
 * classic comment (PWC-08). Unsupported anchors are suppressed, never moved.
 */
import { nodeAt, xmlAttrs, xmlChildren, xmlTag, type ProofSource, type SourceParagraph, type XmlNode } from "../source-map.ts";
import { ProofFindingSchema, type ProofFinding, type SourceSpan } from "../proof/contracts.ts";

export const EDIT_CAPABILITY_VERSION = "proof-edit-capabilities-v1";

export type EditOperation = "correction" | "comment" | "unsupported";

export type SpanEditCapability = {
  operation: EditOperation;
  reason: string | null;
};

function ancestors(tree: XmlNode[], path: number[]): XmlNode[] {
  const found: XmlNode[] = [];
  let nodes = tree;
  for (const index of path) {
    const node = nodes[index];
    if (!node) break;
    found.push(node);
    nodes = xmlChildren(node);
  }
  return found;
}

function rPrKey(tree: XmlNode[], path: number[]): string {
  const chain = ancestors(tree, path);
  const run = [...chain].reverse().find((node) => xmlTag(node) === "w:r");
  if (!run) return "";
  const properties = xmlChildren(run).find((child) => xmlTag(child) === "w:rPr");
  return properties ? JSON.stringify(xmlChildren(properties)) : "";
}

function overlappingNodes(paragraph: SourceParagraph, span: SourceSpan) {
  return paragraph.nodes.filter((node) => node.start < span.textEnd && node.end > span.textStart);
}

function paragraphFor(source: ProofSource, span: SourceSpan): SourceParagraph | undefined {
  return source.paragraphs.find((paragraph) =>
    paragraph.partUri === span.partUri &&
    JSON.stringify(paragraph.paragraphPath) === JSON.stringify(span.paragraphPath)
  );
}

function commentBoundaryConflict(tree: XmlNode[], paragraph: SourceParagraph, span: SourceSpan): boolean {
  for (const node of overlappingNodes(paragraph, span)) {
    const chain = ancestors(tree, node.nodePath);
    if (chain.some((candidate) => {
      const tag = xmlTag(candidate);
      return tag === "w:commentRangeStart" || tag === "w:commentRangeEnd" || tag === "w:commentReference";
    })) return true;
    const run = [...chain].reverse().find((candidate) => xmlTag(candidate) === "w:r");
    if (run && xmlChildren(run).some((child) => xmlTag(child) === "w:commentReference")) return true;
  }
  return false;
}

function revisionAuthor(tree: XmlNode[], path: number[]): string | null {
  const chain = ancestors(tree, path);
  const marked = [...chain].reverse().find((node) => xmlTag(node) === "w:ins" || xmlTag(node) === "w:del");
  return marked ? xmlAttrs(marked)["@_w:author"] ?? null : null;
}

function fieldOrProtected(tree: XmlNode[], path: number[]): boolean {
  return ancestors(tree, path).some((node) => {
    const tag = xmlTag(node);
    return tag === "w:fldSimple" || tag === "w:hyperlink" || tag === "w:sdt" || tag === "w:instrText" || tag === "w:fldChar";
  });
}

function runIsExportable(tree: XmlNode[], path: number[]): boolean {
  const chain = ancestors(tree, path);
  const run = [...chain].reverse().find((node) => xmlTag(node) === "w:r");
  if (!run) return false;
  return xmlChildren(run).every((child) => ["w:rPr", "w:t"].includes(xmlTag(child)));
}

export function classifySpanEdit(
  source: ProofSource,
  span: SourceSpan,
  intended: "correction" | "comment",
  replacement: string | null,
): SpanEditCapability {
  const paragraph = paragraphFor(source, span);
  if (!paragraph || !paragraph.safe) return { operation: "unsupported", reason: "unsafe_paragraph" };
  const quote = paragraph.text.slice(span.textStart, span.textEnd);
  if (!quote.trim()) return { operation: "unsupported", reason: "empty_visible_range" };
  const nodes = overlappingNodes(paragraph, span);
  if (!nodes.length) return { operation: "unsupported", reason: "empty_visible_range" };
  if (!nodes.every((node) => runIsExportable(source.tree, node.nodePath))) {
    return { operation: "unsupported", reason: "complex_run" };
  }
  if (commentBoundaryConflict(source.tree, paragraph, span)) {
    return { operation: "unsupported", reason: "classic_comment_boundary" };
  }
  if (nodes.some((node) => fieldOrProtected(source.tree, node.nodePath))) {
    return { operation: "unsupported", reason: "field_or_protected" };
  }
  if (nodes.some((node) => !node.editable && !node.revision)) {
    return { operation: "unsupported", reason: "protected_text" };
  }

  const priorRevision = nodes.some((node) => node.revision);
  const agmtPrior = nodes.some((node) => revisionAuthor(source.tree, node.nodePath) === "Agmt Proof");
  const mixedFormat = new Set(nodes.map((node) => rPrKey(source.tree, node.nodePath))).size > 1;

  if (priorRevision || agmtPrior) {
    return {
      operation: "unsupported",
      reason: agmtPrior ? "prior_agmt_revision" : "prior_revision",
    };
  }

  if (intended === "correction") {
    if (mixedFormat && replacement !== null && replacement.length > 0) {
      return { operation: "comment", reason: "mixed_format" };
    }
    if (!nodes.every((node) => node.editable)) return { operation: "comment", reason: "not_editable" };
    return { operation: "correction", reason: null };
  }

  return { operation: "comment", reason: null };
}

/** Direct children that a surgical rewrite can split must be plain text runs. */
export function paragraphChildrenExportable(source: ProofSource, span: SourceSpan): boolean {
  const paragraph = paragraphFor(source, span);
  if (!paragraph) return false;
  const node = nodeAt(source.tree, paragraph.paragraphPath);
  return xmlChildren(node).every((child, index) => {
    const prefix = [...paragraph.paragraphPath, index];
    const nodes = paragraph.nodes.filter((candidate) => JSON.stringify(candidate.nodePath.slice(0, prefix.length)) === JSON.stringify(prefix));
    const touched = nodes.some((candidate) => candidate.start < span.textEnd && candidate.end > span.textStart);
    if (!touched) return true;
    return xmlTag(child) === "w:r" && xmlChildren(child).every((part) => ["w:rPr", "w:t"].includes(xmlTag(part)));
  });
}

export function classifyExportAnchor(source: ProofSource, finding: ProofFinding): SpanEditCapability {
  const classified = classifySpanEdit(source, finding.primarySpan, finding.kind, finding.replacement);
  if (classified.operation === "unsupported") return classified;
  if (classified.operation !== finding.kind) {
    return { operation: "unsupported", reason: classified.reason ?? "action_not_exportable" };
  }
  if (!paragraphChildrenExportable(source, finding.primarySpan)) {
    return { operation: "unsupported", reason: "unanchorable_markup" };
  }
  return classified;
}

export function admitFinding(source: ProofSource, finding: ProofFinding): { finding: ProofFinding | null; skipped: string | null } {
  const capability = classifySpanEdit(source, finding.primarySpan, finding.kind, finding.replacement);
  if (capability.operation === "unsupported") return { finding: null, skipped: capability.reason };
  if (capability.operation === "comment" && finding.kind === "correction") {
    const comment = capability.reason === "mixed_format"
      ? `Possible correction: ‘${finding.exactQuote}’ → ‘${finding.replacement ?? ""}’. This span uses mixed formatting, so it is marked as a comment rather than a tracked change.`
      : finding.comment;
    return {
      finding: ProofFindingSchema.parse({
        ...finding,
        kind: "comment",
        replacement: null,
        comment,
      }),
      skipped: null,
    };
  }
  return { finding, skipped: null };
}
