/**
 * Independent markup and reconstruction gate (PWC-11).
 *
 * Does not call rewriteParagraph, replaceParagraphXml, resolveAdded or semantic.
 * Accept/reject expectations are derived from the original source and the plan.
 */
import assert from "node:assert/strict";
import { DocxPackage } from "../docx-package.ts";
import { nodeAt, xmlAttrs, xmlChildren, xmlTag, type XmlNode } from "../source-map.ts";
import { parser, walk, ids } from "../export/ooxml.ts";
import type { ExportReceipt } from "../export/receipt.ts";
import type { ProofFinding, SourceSpan } from "../proof/contracts.ts";
import type { ProofSource } from "../source-map.ts";

type Analysis = { source: ProofSource };

function visibleText(nodes: XmlNode[], skipRevisionIds: Set<string>, mode: "accept" | "reject"): string {
  let text = "";
  function visit(current: XmlNode[]): void {
    for (const node of current) {
      const tag = xmlTag(node);
      const id = xmlAttrs(node)["@_w:id"];
      if (["w:commentRangeStart", "w:commentRangeEnd", "w:commentReference"].includes(tag)) continue;
      if (tag === "w:del" || tag === "w:moveFrom") {
        if (skipRevisionIds.has(id)) {
          if (mode === "reject") visit(xmlChildren(node));
          continue;
        }
        continue;
      }
      if (tag === "w:ins" || tag === "w:moveTo") {
        if (skipRevisionIds.has(id)) {
          if (mode === "accept") visit(xmlChildren(node));
          continue;
        }
        visit(xmlChildren(node));
        continue;
      }
      if (tag === "w:t" || tag === "w:delText") {
        text += xmlChildren(node).map((child) => child["#text"] ?? "").join("");
        continue;
      }
      if (["w:tab", "w:br", "w:cr"].includes(tag)) {
        text += tag === "w:tab" ? "\t" : "\n";
        continue;
      }
      if (tag === "w:instrText") continue;
      visit(xmlChildren(node));
    }
  }
  visit(nodes);
  return text;
}

function applyCorrections(text: string, findings: ProofFinding[], spanOf: (finding: ProofFinding) => SourceSpan): string {
  const edits = findings
    .filter((finding) => finding.kind === "correction")
    .sort((left, right) => spanOf(right).textStart - spanOf(left).textStart);
  let expected = text;
  for (const finding of edits) {
    const span = spanOf(finding);
    expected = expected.slice(0, span.textStart) + (finding.replacement ?? "") + expected.slice(span.textEnd);
  }
  return expected;
}

function shiftForCorrections(position: number, findings: ProofFinding[], paragraphPath: number[]): number {
  return findings
    .filter((finding) => finding.kind === "correction" && JSON.stringify(finding.primarySpan.paragraphPath) === JSON.stringify(paragraphPath) && finding.primarySpan.textEnd <= position)
    .reduce((sum, finding) => sum + (finding.replacement ?? "").length - finding.exactQuote.length, 0);
}

function commentRange(paragraph: XmlNode, id: string): { start: number | undefined; end: number | undefined } {
  let cursor = 0;
  let start: number | undefined;
  let end: number | undefined;
  function visit(nodes: XmlNode[]): void {
    for (const node of nodes) {
      const tag = xmlTag(node);
      if (tag === "w:del" || tag === "w:moveFrom") continue;
      if (tag === "w:commentRangeStart" && xmlAttrs(node)["@_w:id"] === id) start = cursor;
      if (tag === "w:commentRangeEnd" && xmlAttrs(node)["@_w:id"] === id) end = cursor;
      if (tag === "w:t") cursor += xmlChildren(node).map((child) => child["#text"] ?? "").join("").length;
      else if (["w:tab", "w:br", "w:cr"].includes(tag)) cursor++;
      else if (tag !== "w:instrText") visit(xmlChildren(node));
    }
  }
  visit(xmlChildren(paragraph));
  return { start, end };
}

function localRunProperties(node: XmlNode): string {
  const properties = xmlChildren(node).find((child) => xmlTag(child) === "w:rPr");
  return properties ? JSON.stringify(xmlChildren(properties)) : "";
}

function runText(node: XmlNode): string {
  return xmlChildren(node).filter((child) => xmlTag(child) === "w:t" || xmlTag(child) === "w:delText")
    .flatMap((child) => xmlChildren(child).map((part) => part["#text"] ?? ""))
    .join("");
}

function runSequence(nodes: XmlNode[], skipRevisionIds: Set<string>, mode: "accept" | "reject"): { rPr: string; text: string }[] {
  const runs: { rPr: string; text: string }[] = [];
  function visit(current: XmlNode[]): void {
    for (const node of current) {
      const tag = xmlTag(node);
      const id = xmlAttrs(node)["@_w:id"];
      if (["w:commentRangeStart", "w:commentRangeEnd", "w:commentReference"].includes(tag)) continue;
      if (tag === "w:del" || tag === "w:moveFrom") {
        if (skipRevisionIds.has(id) && mode === "reject") visit(xmlChildren(node));
        continue;
      }
      if (tag === "w:ins" || tag === "w:moveTo") {
        if (skipRevisionIds.has(id)) {
          if (mode === "accept") visit(xmlChildren(node));
          continue;
        }
        visit(xmlChildren(node));
        continue;
      }
      if (tag === "w:r") {
        const text = runText(node);
        if (text) runs.push({ rPr: localRunProperties(node), text });
        continue;
      }
      visit(xmlChildren(node));
    }
  }
  visit(nodes);
  const merged: { rPr: string; text: string }[] = [];
  for (const run of runs) {
    const previous = merged.at(-1);
    if (previous && previous.rPr === run.rPr) previous.text += run.text;
    else merged.push({ ...run });
  }
  return merged;
}

function revisionRecords(tree: XmlNode[]): Map<string, { tag: string; author: string; text: string }> {
  const records = new Map<string, { tag: string; author: string; text: string }>();
  walk(tree, (node) => {
    const tag = xmlTag(node);
    if (tag !== "w:ins" && tag !== "w:del") return;
    const id = xmlAttrs(node)["@_w:id"];
    if (!id || records.has(id)) return;
    records.set(id, {
      tag,
      author: xmlAttrs(node)["@_w:author"] ?? "",
      text: visibleText(xmlChildren(node), new Set(), "accept"),
    });
  });
  return records;
}

export async function validateOutputReconstruction(input: {
  sourceBytes: Buffer;
  output: Buffer;
  receipt: ExportReceipt;
  analysis: Analysis;
  sourcePkg?: DocxPackage;
  sourceZip?: DocxPackage;
}): Promise<void> {
  const limits = input.sourcePkg?.limits ?? input.sourceZip?.limits ?? undefined;
  const original = DocxPackage.open(input.sourceBytes, { limits, verify: false });
  const result = DocxPackage.open(input.output, { limits: original.limits, verify: false });
  const sourceTree = input.analysis.source.tree;
  const outputTree: XmlNode[] = parser.parse(result.text("word/document.xml"));
  const revisionSet = new Set(input.receipt.revisionIds);
  const commentSet = new Set([...input.receipt.commentIds, ...input.receipt.noticeIds]);

  for (const id of revisionSet) {
    let count = 0;
    walk(outputTree, (node) => {
      if (["w:ins", "w:del"].includes(xmlTag(node)) && xmlAttrs(node)["@_w:id"] === id) {
        assert.equal(xmlAttrs(node)["@_w:author"], "Agmt Proof");
        count++;
      }
    });
    assert.equal(count, 1, "missing_or_duplicate_revision");
  }

  const commentXml = result.has("word/comments.xml") ? result.text("word/comments.xml") : undefined;
  const commentTree: XmlNode[] = commentXml ? parser.parse(commentXml) : [];
  for (const id of commentSet) {
    for (const tag of ["w:commentRangeStart", "w:commentRangeEnd", "w:commentReference", "w:comment"] as const) {
      let count = 0;
      walk(tag === "w:comment" ? commentTree : outputTree, (node) => {
        if (xmlTag(node) === tag && xmlAttrs(node)["@_w:id"] === id) count++;
      });
      assert.equal(count, 1, "missing_or_duplicate_comment_anchor");
    }
  }

  assert.equal(input.analysis.source.paragraphs.length > 0, true, "missing_source_paragraphs");
  for (let index = 0; index < input.analysis.source.paragraphs.length; index++) {
    const paragraph = input.analysis.source.paragraphs[index]!;
    const sourceNode = nodeAt(sourceTree, paragraph.paragraphPath);
    const outputNode = nodeAt(outputTree, paragraph.paragraphPath);
    const rejected = visibleText(xmlChildren(outputNode), revisionSet, "reject");
    const accepted = visibleText(xmlChildren(outputNode), revisionSet, "accept");
    const planned = input.receipt.plan.findings.filter((finding) => JSON.stringify(finding.primarySpan.paragraphPath) === JSON.stringify(paragraph.paragraphPath));
    assert.equal(rejected, visibleText(xmlChildren(sourceNode), new Set(), "accept"), "rejecting_only_Agmt_must_restore_source");
    assert.equal(accepted, applyCorrections(paragraph.text, planned, (finding) => finding.primarySpan), "accepting_only_Agmt_must_match_plan");
    assert.deepEqual(
      runSequence(xmlChildren(outputNode), revisionSet, "reject"),
      runSequence(xmlChildren(sourceNode), new Set(), "accept"),
      "rejecting_only_Agmt_must_restore_run_formatting",
    );
  }

  const sourceRevisions = revisionRecords(sourceTree);
  const outputRevisions = revisionRecords(outputTree);
  for (const [id, record] of sourceRevisions) {
    assert.ok(!revisionSet.has(id), "existing_revision_reused");
    assert.deepEqual(outputRevisions.get(id), record, "existing_revision_changed");
  }

  const oldCommentXml = original.has("word/comments.xml") ? original.text("word/comments.xml") : undefined;
  const allExpectedCommentIds = new Set([...commentSet, ...ids(oldCommentXml ? parser.parse(oldCommentXml) : [], "w:comment")]);
  assert.deepEqual(ids(commentTree, "w:comment"), allExpectedCommentIds, "unplanned_comment");

  if (oldCommentXml) {
    const oldTree: XmlNode[] = parser.parse(oldCommentXml);
    const originalIds = ids(oldTree, "w:comment");
    for (const id of originalIds) {
      let before: XmlNode | undefined;
      let after: XmlNode | undefined;
      walk(oldTree, (node) => {
        if (xmlTag(node) === "w:comment" && xmlAttrs(node)["@_w:id"] === id) before = node;
      });
      walk(commentTree, (node) => {
        if (xmlTag(node) === "w:comment" && xmlAttrs(node)["@_w:id"] === id) after = node;
      });
      assert.deepEqual(after, before, "original_comment_changed");
    }
  }

  const expectedComments = [
    ...input.receipt.plan.findings.filter((finding) => finding.kind === "comment").map((finding) => ({ span: finding.primarySpan, text: finding.comment, id: null as string | null })),
    ...input.receipt.plan.notices.map((notice) => ({ span: notice.presentationSpan, text: notice.comment, id: null as string | null })),
  ];
  const allocated = [...input.receipt.commentIds, ...input.receipt.noticeIds];
  assert.equal(expectedComments.length, allocated.length, "unaccounted_comment");
  for (let index = 0; index < expectedComments.length; index++) {
    const expected = expectedComments[index]!;
    const id = allocated[index]!;
    let comment: XmlNode | undefined;
    walk(commentTree, (node) => {
      if (xmlTag(node) === "w:comment" && xmlAttrs(node)["@_w:id"] === id) comment = node;
    });
    assert.ok(comment);
    const actualText = visibleText(xmlChildren(comment), new Set(), "accept");
    assert.equal(actualText, expected.text, "comment_text_mismatch");
    const paragraph = nodeAt(outputTree, expected.span.paragraphPath);
    const range = commentRange(paragraph, id);
    const startShift = shiftForCorrections(expected.span.textStart, input.receipt.plan.findings, expected.span.paragraphPath);
    const endShift = shiftForCorrections(expected.span.textEnd, input.receipt.plan.findings, expected.span.paragraphPath);
    assert.equal(range.start, expected.span.textStart + startShift, "comment_start_mismatch");
    assert.equal(range.end, expected.span.textEnd + endShift, "comment_end_mismatch");
  }
}
