import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { XMLValidator } from "fast-xml-parser";
import { analyzeProof, validateLaunchFinding } from "../proof/launch.ts";
import { ExportPlanSchema, type ExportPlan, type ProofFinding } from "../proof/contracts.ts";
import { nodeAt, sourceSpan, mapProofSource, xmlChildren, xmlTag, xmlAttrs, type SourceParagraph, type XmlNode } from "../source-map.ts";
import { extractDocx } from "../docx-v2.ts";
import { W, parser, builder, element, textRun, walk, ids, semantic, resolveAdded, replaceParagraphXml } from "./ooxml.ts";

type Analysis = Awaited<ReturnType<typeof analyzeProof>>;
export type ExportReceipt = { revisionIds: string[]; commentIds: string[]; modifiedParts: string[]; plan: ExportPlan };
type Fragment = { node: XmlNode; start?: number; end?: number };

function uniqueFindings(findings: ProofFinding[]): ProofFinding[] {
  const unique = new Map<string, ProofFinding>();
  for (const finding of findings) {
    const previous = unique.get(finding.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(finding)) throw new Error("export_conflicting_id");
    unique.set(finding.id, finding);
  }
  const result = [...unique.values()];
  for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
    const a = result[i].primarySpan, b = result[j].primarySpan;
    if (a.partUri === b.partUri && JSON.stringify(a.paragraphPath) === JSON.stringify(b.paragraphPath) && a.textStart < b.textEnd && b.textStart < a.textEnd) throw new Error("export_overlapping_findings");
  }
  return result;
}

export function planProofExport(analysis: Analysis): ExportPlan {
  const plan = structuredClone(analysis.plan);
  plan.findings = uniqueFindings(plan.findings);
  for (const f of plan.findings) validateLaunchFinding(analysis, f);
  if (analysis.coverage === "limited") {
    const p = analysis.source.paragraphs.find((p) => p.safe && p.text.trim());
    if (!p) throw new Error("no_coverage_anchor");
    plan.notices.push({ anchorMode: "document_notice", presentationSpan: sourceSpan(p, 0, p.text.length), comment: `Agmt Proof — coverage: Some checks are incomplete (${analysis.gaps.join(", ")}). This document is not a clean result.` });
  }
  return ExportPlanSchema.parse(plan);
}

function paragraphFragments(node: XmlNode, p: SourceParagraph, findings: ProofFinding[]): Fragment[] {
  const boundaries = new Set(findings.flatMap((f) => [f.primarySpan.textStart, f.primarySpan.textEnd]));
  const out: Fragment[] = [];
  xmlChildren(node).forEach((child, index) => {
    const prefix = [...p.paragraphPath, index];
    const nodes = p.nodes.filter((n) => JSON.stringify(n.nodePath.slice(0, prefix.length)) === JSON.stringify(prefix));
    const touched = nodes.some((n) => findings.some((f) => n.start < f.primarySpan.textEnd && n.end > f.primarySpan.textStart));
    if (!touched) { out.push({ node: structuredClone(child) }); return; }
    if (xmlTag(child) !== "w:r" || xmlChildren(child).some((c) => !["w:rPr", "w:t"].includes(xmlTag(c)))) throw new Error("unsupported_export_anchor");
    for (const n of nodes) {
      const cuts = [n.start, ...[...boundaries].filter((x) => x > n.start && x < n.end).sort((a, b) => a - b), n.end];
      for (let j = 0; j < cuts.length - 1; j++) out.push({ node: textRun(n.text.slice(cuts[j] - n.start, cuts[j + 1] - n.start), child), start: cuts[j], end: cuts[j + 1] });
    }
  });
  return out;
}

function rewriteParagraph(node: XmlNode, p: SourceParagraph, findings: ProofFinding[], commentIds: Map<string, string>, nextRevision: () => string, date: string): void {
  const fragments = paragraphFragments(node, p, findings), result: XmlNode[] = [];
  for (let i = 0; i < fragments.length; i++) {
    const fragment = fragments[i];
    const opening = findings.find((f) => f.primarySpan.textStart === fragment.start);
    if (opening?.kind === "correction") {
      const removed: XmlNode[] = [], begin = i;
      while (i < fragments.length) {
        const part = fragments[i];
        if (part.start === undefined || part.end === undefined || part.end > opening.primarySpan.textEnd) throw new Error("unsafe_revision_boundary");
        const deleted = structuredClone(part.node);
        walk([deleted], (n) => { if (xmlTag(n) === "w:t") { n["w:delText"] = n["w:t"]; delete n["w:t"]; } });
        removed.push(deleted);
        if (part.end === opening.primarySpan.textEnd) break;
        i++;
      }
      if (i === fragments.length) throw new Error("missing_revision_end");
      result.push(element("w:del", removed, { "@_w:id": nextRevision(), "@_w:author": "Agmt Proof", "@_w:date": date }));
      if (opening.replacement) {
        let offset = 0;
        const inserted: XmlNode[] = [];
        for (let j = begin; j <= i; j++) {
          const length = j === i ? opening.replacement.length - offset : Math.min(fragments[j].end! - fragments[j].start!, opening.replacement.length - offset);
          if (length > 0) inserted.push(textRun(opening.replacement.slice(offset, offset + length), fragments[j].node));
          offset += Math.max(0, length);
        }
        result.push(element("w:ins", inserted, { "@_w:id": nextRevision(), "@_w:author": "Agmt Proof", "@_w:date": date }));
      }
      continue;
    }
    if (opening?.kind === "comment") result.push(element("w:commentRangeStart", [], { "@_w:id": commentIds.get(opening.id)! }));
    result.push(fragment.node);
    const closing = findings.find((f) => f.kind === "comment" && f.primarySpan.textEnd === fragment.end);
    if (closing) {
      result.push(element("w:commentRangeEnd", [], { "@_w:id": commentIds.get(closing.id)! }));
      result.push(element("w:r", [element("w:commentReference", [], { "@_w:id": commentIds.get(closing.id)! })]));
    }
  }
  node["w:p"] = result;
}

export async function exportProofDocx(bytes: Buffer, now = new Date()) {
  const analysis = await analyzeProof(bytes), plan = planProofExport(analysis);
  const zip = await JSZip.loadAsync(bytes), original = await JSZip.loadAsync(bytes);
  if (!plan.findings.length && !plan.notices.length) return { bytes: Buffer.from(bytes), analysis, receipt: { revisionIds: [], commentIds: [], modifiedParts: [], plan } satisfies ExportReceipt };
  const tree = structuredClone(analysis.source.tree);
  const editedPaths = new Map<string, number[]>();
  const used = new Set<string>();
  for (const name of Object.keys(zip.files).filter((n) => n.endsWith(".xml"))) {
    const xml = await zip.file(name)!.async("string");
    if (XMLValidator.validate(xml) !== true || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("invalid_export_source_xml");
    walk(parser.parse(xml), (n) => { const id = xmlAttrs(n)["@_w:id"]; if (id !== undefined) used.add(id); });
  }
  let next = 0;
  const allocate = () => { while (used.has(String(next))) next++; if (next > 2_147_483_647) throw new Error("markup_id_exhausted"); const id = String(next++); used.add(id); return id; };
  const revisionIds: string[] = [], commentIds: string[] = [], commentMap = new Map<string, string>();
  const comments: { id: string; text: string }[] = [];
  const nextRevision = () => { const id = allocate(); revisionIds.push(id); return id; };
  for (const f of plan.findings.filter((f) => f.kind === "comment")) {
    const id = allocate(); commentIds.push(id); commentMap.set(f.id, id); comments.push({ id, text: f.comment });
  }
  for (const p of analysis.source.paragraphs) {
    const findings = plan.findings.filter((f) => JSON.stringify(f.primarySpan.paragraphPath) === JSON.stringify(p.paragraphPath));
    if (findings.length) {
      rewriteParagraph(nodeAt(tree, p.paragraphPath), p, findings, commentMap, nextRevision, now.toISOString());
      editedPaths.set(JSON.stringify(p.paragraphPath), p.paragraphPath);
    }
  }
  for (const notice of plan.notices) {
    const p = nodeAt(tree, notice.presentationSpan.paragraphPath), id = allocate();
    commentIds.push(id); comments.push({ id, text: notice.comment });
    editedPaths.set(JSON.stringify(notice.presentationSpan.paragraphPath), notice.presentationSpan.paragraphPath);
    const children = xmlChildren(p), at = xmlTag(children[0] ?? {}) === "w:pPr" ? 1 : 0;
    children.splice(at, 0, element("w:commentRangeStart", [], { "@_w:id": id }));
    children.push(element("w:commentRangeEnd", [], { "@_w:id": id }), element("w:r", [element("w:commentReference", [], { "@_w:id": id })]));
  }
  const modifiedParts = ["word/document.xml"];
  zip.file("word/document.xml", replaceParagraphXml(analysis.source.xml, analysis.source.tree, tree, [...editedPaths.values()]));
  if (comments.length) {
    const name = "word/comments.xml", existing = await zip.file(name)?.async("string");
    const ct: XmlNode[] = existing ? parser.parse(existing) : [element("w:comments", [], { "@_xmlns:w": W })];
    const root = ct.find((n) => xmlTag(n) === "w:comments");
    if (!root) throw new Error("invalid_comments_root");
    for (const c of comments) xmlChildren(root).push(element("w:comment", [element("w:p", [textRun(c.text)])], { "@_w:id": c.id, "@_w:author": "Agmt Proof", "@_w:initials": "AP", "@_w:date": now.toISOString() }));
    zip.file(name, builder.build(ct)); modifiedParts.push(name);
    if (!existing) {
      const relName = "word/_rels/document.xml.rels";
      const relTree: XmlNode[] = parser.parse(await zip.file(relName)!.async("string"));
      const relRoot = relTree.find((n) => xmlTag(n) === "Relationships")!;
      const relIds = new Set(xmlChildren(relRoot).map((n) => xmlAttrs(n)["@_Id"]));
      let suffix = 1; while (relIds.has(`rIdAgmt${suffix}`)) suffix++;
      xmlChildren(relRoot).push(element("Relationship", [], { "@_Id": `rIdAgmt${suffix}`, "@_Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments", "@_Target": "comments.xml" }));
      zip.file(relName, builder.build(relTree)); modifiedParts.push(relName);
      const contentTree: XmlNode[] = parser.parse(await zip.file("[Content_Types].xml")!.async("string"));
      const root = contentTree.find((n) => xmlTag(n) === "Types")!;
      xmlChildren(root).push(element("Override", [], { "@_PartName": "/word/comments.xml", "@_ContentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml" }));
      zip.file("[Content_Types].xml", builder.build(contentTree)); modifiedParts.push("[Content_Types].xml");
    }
  }
  const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  if (output.length > 35 * 1024 * 1024) throw new Error("output_too_large");
  const receipt = { revisionIds, commentIds, modifiedParts, plan };
  await validateProofExport(bytes, output, receipt, analysis, original);
  return { bytes: output, analysis, receipt };
}

export async function validateProofExport(sourceBytes: Buffer, output: Buffer, receipt: ExportReceipt, analysis?: Analysis, sourceZip?: JSZip): Promise<void> {
  const a = analysis ?? await analyzeProof(sourceBytes);
  assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), receipt.plan.sourceSha256, "source_digest");
  const original = sourceZip ?? await JSZip.loadAsync(sourceBytes), result = await JSZip.loadAsync(output, { checkCRC32: true });
  await extractDocx(output);
  const tree: XmlNode[] = parser.parse(await result.file("word/document.xml")!.async("string"));
  for (const name of Object.keys(original.files)) {
    assert.ok(result.files[name], `missing original entry ${name}`);
    if (!original.files[name].dir && !receipt.modifiedParts.includes(name)) assert.deepEqual(await result.file(name)!.async("nodebuffer"), await original.file(name)!.async("nodebuffer"), `changed original entry ${name}`);
  }
  for (const name of Object.keys(result.files)) {
    assert.ok(original.files[name] || receipt.modifiedParts.includes(name) || result.files[name].dir, "unexpected_package_entry");
    if (/\.xml$|\.rels$/.test(name)) assert.equal(XMLValidator.validate(await result.file(name)!.async("string")), true, "invalid_xml");
  }
  const revisionSet = new Set(receipt.revisionIds), commentSet = new Set(receipt.commentIds);
  assert.equal(revisionSet.size, receipt.revisionIds.length, "duplicate_revision_id");
  assert.equal(commentSet.size, receipt.commentIds.length, "duplicate_comment_id");
  for (const id of revisionSet) {
    let count = 0;
    walk(tree, (n) => { if (["w:ins", "w:del"].includes(xmlTag(n)) && xmlAttrs(n)["@_w:id"] === id) { assert.equal(xmlAttrs(n)["@_w:author"], "Agmt Proof"); count++; } });
    assert.equal(count, 1, "missing_or_duplicate_revision");
  }
  const commentXml = await result.file("word/comments.xml")?.async("string");
  const commentTree: XmlNode[] = commentXml ? parser.parse(commentXml) : [];
  for (const id of commentSet) for (const tag of ["w:commentRangeStart", "w:commentRangeEnd", "w:commentReference", "w:comment"]) {
    let count = 0; walk(tag === "w:comment" ? commentTree : tree, (n) => { if (xmlTag(n) === tag && xmlAttrs(n)["@_w:id"] === id) count++; });
    assert.equal(count, 1, "missing_or_duplicate_comment_anchor");
  }
  const rejected = resolveAdded(tree, revisionSet, commentSet, false);
  assert.deepEqual(semantic(rejected), semantic(a.source.tree), "rejecting_only_Agmt_must_restore_source");
  const accepted = mapProofSource("", resolveAdded(tree, revisionSet, commentSet, true));
  assert.equal(accepted.paragraphs.length, a.source.paragraphs.length, "paragraph_count");
  for (let i = 0; i < a.source.paragraphs.length; i++) {
    const p = a.source.paragraphs[i]; let expected = p.text;
    const edits = receipt.plan.findings.filter((f) => f.kind === "correction" && JSON.stringify(f.primarySpan.paragraphPath) === JSON.stringify(p.paragraphPath)).sort((a, b) => b.primarySpan.textStart - a.primarySpan.textStart);
    for (const f of edits) expected = expected.slice(0, f.primarySpan.textStart) + f.replacement + expected.slice(f.primarySpan.textEnd);
    assert.equal(accepted.paragraphs[i].text, expected, "accepting_only_Agmt_must_match_plan");
  }
  const oldCommentXml = await original.file("word/comments.xml")?.async("string");
  const allExpectedCommentIds = new Set([...commentSet, ...ids(oldCommentXml ? parser.parse(oldCommentXml) : [], "w:comment")]);
  assert.deepEqual(ids(commentTree, "w:comment"), allExpectedCommentIds, "unplanned_comment");
  const expectedComments = [...receipt.plan.findings.filter((f) => f.kind === "comment").map((f) => ({ span: f.primarySpan, text: f.comment })), ...receipt.plan.notices.map((n) => ({ span: n.presentationSpan, text: n.comment }))];
  assert.equal(expectedComments.length, receipt.commentIds.length, "unaccounted_comment");
  for (let i = 0; i < expectedComments.length; i++) {
    const expected = expectedComments[i], id = receipt.commentIds[i];
    let comment: XmlNode | undefined;
    walk(commentTree, (n) => { if (xmlTag(n) === "w:comment" && xmlAttrs(n)["@_w:id"] === id) comment = n; });
    assert.ok(comment);
    const expectedRecord = element("w:comment", [element("w:p", [textRun(expected.text)])], { ...xmlAttrs(comment) });
    assert.deepEqual(comment, expectedRecord, "comment_text_mismatch");
    const p = nodeAt(tree, expected.span.paragraphPath);
    let cursor = 0, start: number | undefined, end: number | undefined;
    function ranges(nodes: XmlNode[]): void {
      for (const n of nodes) {
        const tag = xmlTag(n);
        if (tag === "w:del" || tag === "w:moveFrom") continue;
        if (tag === "w:commentRangeStart" && xmlAttrs(n)["@_w:id"] === id) start = cursor;
        if (tag === "w:commentRangeEnd" && xmlAttrs(n)["@_w:id"] === id) end = cursor;
        if (tag === "w:t") cursor += xmlChildren(n).map((x) => x["#text"] ?? "").join("").length;
        else if (["w:tab", "w:br", "w:cr"].includes(tag)) cursor++;
        else if (tag !== "w:instrText") ranges(xmlChildren(n));
      }
    }
    ranges(xmlChildren(p));
    const shift = (position: number) => receipt.plan.findings.filter((f) => f.kind === "correction" && JSON.stringify(f.primarySpan.paragraphPath) === JSON.stringify(expected.span.paragraphPath) && f.primarySpan.textEnd <= position).reduce((sum, f) => sum + f.replacement!.length - f.exactQuote.length, 0);
    assert.equal(start, expected.span.textStart + shift(expected.span.textStart), "comment_start_mismatch");
    assert.equal(end, expected.span.textEnd + shift(expected.span.textEnd), "comment_end_mismatch");
  }
  if (oldCommentXml) {
    const oldTree: XmlNode[] = parser.parse(oldCommentXml);
    const originalIds = ids(oldTree, "w:comment");
    for (const id of originalIds) {
      let before: XmlNode | undefined, after: XmlNode | undefined;
      walk(oldTree, (n) => { if (xmlTag(n) === "w:comment" && xmlAttrs(n)["@_w:id"] === id) before = n; });
      walk(commentTree, (n) => { if (xmlTag(n) === "w:comment" && xmlAttrs(n)["@_w:id"] === id) after = n; });
      assert.deepEqual(after, before, "original_comment_changed");
    }
  }
}
