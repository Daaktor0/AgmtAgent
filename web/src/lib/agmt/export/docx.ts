import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { XMLValidator } from "fast-xml-parser";
import { analyzeProof, validateLaunchFinding } from "../proof/launch.ts";
import { ExportPlanSchema, type ExportPlan, type ProofFinding } from "../proof/contracts.ts";
import { resolveProofFindings } from "../proof/resolve-findings.ts";
import { nodeAt, sourceSpan, xmlChildren, xmlTag, xmlAttrs, type SourceParagraph, type XmlNode } from "../source-map.ts";
import { W, parser, builder, element, textRun, walk, replaceParagraphXml, appendBeforeCloseTag, runPropertiesKey } from "./ooxml.ts";
import { classifyExportAnchor } from "./edit-capabilities.ts";
import { EXPORT_RECEIPT_VERSION, EXPORTER_VERSION, ExportReceiptSchema, emptyExportReceipt, type ExportReceipt } from "./receipt.ts";
import { validateOutputPackage } from "../validation/structure.ts";
import { validateOutputReconstruction } from "../validation/reconstruct.ts";

type Analysis = Awaited<ReturnType<typeof analyzeProof>>;
export type { ExportReceipt };
type Fragment = { node: XmlNode; start?: number; end?: number };

function uniqueFindings(source: Analysis["source"], findings: ProofFinding[]): ProofFinding[] {
  const resolved = resolveProofFindings(source, findings);
  const unique = new Map<string, ProofFinding>();
  for (const finding of resolved.findings) {
    const previous = unique.get(finding.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(finding)) throw new Error("export_conflicting_id");
    unique.set(finding.id, finding);
  }
  return [...unique.values()];
}

export function planProofExport(analysis: Analysis): ExportPlan {
  const plan = structuredClone(analysis.plan);
  plan.findings = uniqueFindings(analysis.source, plan.findings);
  const kept: ProofFinding[] = [];
  const skipped = new Set<string>();
  for (const finding of plan.findings) {
    validateLaunchFinding(analysis, finding);
    const exportable = classifyExportAnchor(analysis.source, finding);
    if (exportable.operation === "unsupported") {
      skipped.add(exportable.reason ?? "unanchorable_markup");
      continue;
    }
    kept.push(finding);
  }
  plan.findings = kept;
  if (analysis.coverage === "limited" || skipped.size) {
    const paragraph = analysis.source.paragraphs.find((candidate) => candidate.safe && candidate.text.trim());
    if (!paragraph) throw new Error("no_coverage_anchor");
    const reasons = [...new Set([...analysis.gaps, ...skipped])];
    plan.notices.push({
      anchorMode: "document_notice",
      presentationSpan: sourceSpan(paragraph, 0, paragraph.text.length),
      comment: `Agmt Proof — coverage: Some checks are incomplete (${reasons.join(", ")}). This document is not a clean result.`,
    });
  }
  return ExportPlanSchema.parse(plan);
}

function paragraphFragments(node: XmlNode, paragraph: SourceParagraph, findings: ProofFinding[]): Fragment[] {
  const boundaries = new Set(findings.flatMap((finding) => [finding.primarySpan.textStart, finding.primarySpan.textEnd]));
  const out: Fragment[] = [];
  xmlChildren(node).forEach((child, index) => {
    const prefix = [...paragraph.paragraphPath, index];
    const nodes = paragraph.nodes.filter((candidate) => JSON.stringify(candidate.nodePath.slice(0, prefix.length)) === JSON.stringify(prefix));
    const touched = nodes.some((candidate) => findings.some((finding) => candidate.start < finding.primarySpan.textEnd && candidate.end > finding.primarySpan.textStart));
    if (!touched) {
      out.push({ node: structuredClone(child) });
      return;
    }
    if (xmlTag(child) !== "w:r" || xmlChildren(child).some((part) => !["w:rPr", "w:t"].includes(xmlTag(part)))) {
      throw new Error("unsupported_export_anchor");
    }
    for (const sourceNode of nodes) {
      const cuts = [sourceNode.start, ...[...boundaries].filter((offset) => offset > sourceNode.start && offset < sourceNode.end).sort((left, right) => left - right), sourceNode.end];
      for (let indexCut = 0; indexCut < cuts.length - 1; indexCut++) {
        out.push({
          node: textRun(sourceNode.text.slice(cuts[indexCut]! - sourceNode.start, cuts[indexCut + 1]! - sourceNode.start), child),
          start: cuts[indexCut],
          end: cuts[indexCut + 1],
        });
      }
    }
  });
  return out;
}

function rewriteParagraph(node: XmlNode, paragraph: SourceParagraph, findings: ProofFinding[], commentIds: Map<string, string>, nextRevision: () => string, date: string): void {
  const fragments = paragraphFragments(node, paragraph, findings);
  const result: XmlNode[] = [];
  for (let index = 0; index < fragments.length; index++) {
    const fragment = fragments[index]!;
    const opening = findings.find((finding) => finding.primarySpan.textStart === fragment.start);
    if (opening?.kind === "correction") {
      const removed: XmlNode[] = [];
      const begin = index;
      while (index < fragments.length) {
        const part = fragments[index]!;
        if (part.start === undefined || part.end === undefined || part.end > opening.primarySpan.textEnd) throw new Error("unsafe_revision_boundary");
        const deleted = structuredClone(part.node);
        walk([deleted], (candidate) => {
          if (xmlTag(candidate) === "w:t") {
            candidate["w:delText"] = candidate["w:t"];
            delete candidate["w:t"];
          }
        });
        removed.push(deleted);
        if (part.end === opening.primarySpan.textEnd) break;
        index++;
      }
      if (index === fragments.length) throw new Error("missing_revision_end");
      result.push(element("w:del", removed, { "@_w:id": nextRevision(), "@_w:author": "Agmt Proof", "@_w:date": date }));
      if (opening.replacement) {
        const covered = fragments.slice(begin, index + 1);
        const formats = new Set(covered.map((part) => runPropertiesKey(part.node)));
        if (formats.size !== 1) throw new Error("mixed_format_replacement");
        result.push(element("w:ins", [textRun(opening.replacement, covered[0]!.node)], { "@_w:id": nextRevision(), "@_w:author": "Agmt Proof", "@_w:date": date }));
      }
      continue;
    }
    if (opening?.kind === "comment") result.push(element("w:commentRangeStart", [], { "@_w:id": commentIds.get(opening.id)! }));
    result.push(fragment.node);
    const closing = findings.find((finding) => finding.kind === "comment" && finding.primarySpan.textEnd === fragment.end);
    if (closing) {
      result.push(element("w:commentRangeEnd", [], { "@_w:id": commentIds.get(closing.id)! }));
      result.push(element("w:r", [element("w:commentReference", [], { "@_w:id": commentIds.get(closing.id)! })]));
    }
  }
  node["w:p"] = result;
}

export async function exportProofDocx(bytes: Buffer, now = new Date()) {
  const analysis = await analyzeProof(bytes);
  const plan = planProofExport(analysis);
  const zip = await JSZip.loadAsync(bytes);
  const original = await JSZip.loadAsync(bytes);
  const date = now.toISOString();
  if (!plan.findings.length && !plan.notices.length) {
    const receipt = emptyExportReceipt(plan);
    await validateProofExport(bytes, Buffer.from(bytes), receipt, analysis, original);
    return { bytes: Buffer.from(bytes), analysis, receipt };
  }
  const tree = structuredClone(analysis.source.tree);
  const editedPaths = new Map<string, number[]>();
  const used = new Set<string>();
  for (const name of Object.keys(zip.files).filter((entry) => entry.endsWith(".xml") || entry.endsWith(".rels"))) {
    const xml = await zip.file(name)!.async("string");
    if (XMLValidator.validate(xml) !== true || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("invalid_export_source_xml");
    walk(parser.parse(xml), (node) => {
      const id = xmlAttrs(node)["@_w:id"];
      if (id !== undefined) used.add(id);
    });
  }
  let next = 0;
  const allocate = () => {
    while (used.has(String(next))) next++;
    if (next > 2_147_483_647) throw new Error("markup_id_exhausted");
    const id = String(next++);
    used.add(id);
    return id;
  };
  const revisionIds: string[] = [];
  const commentIds: string[] = [];
  const noticeIds: string[] = [];
  const commentMap = new Map<string, string>();
  const comments: { id: string; text: string }[] = [];
  const nextRevision = () => {
    const id = allocate();
    revisionIds.push(id);
    return id;
  };
  for (const finding of plan.findings.filter((candidate) => candidate.kind === "comment")) {
    const id = allocate();
    commentIds.push(id);
    commentMap.set(finding.id, id);
    comments.push({ id, text: finding.comment });
  }
  for (const paragraph of analysis.source.paragraphs) {
    const findings = plan.findings.filter((finding) => JSON.stringify(finding.primarySpan.paragraphPath) === JSON.stringify(paragraph.paragraphPath));
    if (findings.length) {
      rewriteParagraph(nodeAt(tree, paragraph.paragraphPath), paragraph, findings, commentMap, nextRevision, date);
      editedPaths.set(JSON.stringify(paragraph.paragraphPath), paragraph.paragraphPath);
    }
  }
  for (const notice of plan.notices) {
    const paragraph = nodeAt(tree, notice.presentationSpan.paragraphPath);
    const id = allocate();
    noticeIds.push(id);
    comments.push({ id, text: notice.comment });
    editedPaths.set(JSON.stringify(notice.presentationSpan.paragraphPath), notice.presentationSpan.paragraphPath);
    const children = xmlChildren(paragraph);
    const at = xmlTag(children[0] ?? {}) === "w:pPr" ? 1 : 0;
    children.splice(at, 0, element("w:commentRangeStart", [], { "@_w:id": id }));
    children.push(element("w:commentRangeEnd", [], { "@_w:id": id }), element("w:r", [element("w:commentReference", [], { "@_w:id": id })]));
  }
  const modifiedParts = ["word/document.xml"];
  zip.file("word/document.xml", replaceParagraphXml(analysis.source.xml, analysis.source.tree, tree, [...editedPaths.values()]));
  if (comments.length) {
    const name = "word/comments.xml";
    const existing = await zip.file(name)?.async("string");
    const serialized = comments.map((comment) => builder.build([element("w:comment", [element("w:p", [textRun(comment.text)])], {
      "@_w:id": comment.id,
      "@_w:author": "Agmt Proof",
      "@_w:initials": "AP",
      "@_w:date": date,
    })]) as string);
    if (existing) {
      zip.file(name, appendBeforeCloseTag(existing, "</w:comments>", serialized.join("")));
      modifiedParts.push(name);
    } else {
      const treeComments: XmlNode[] = [element("w:comments", comments.map((comment) => element("w:comment", [element("w:p", [textRun(comment.text)])], {
        "@_w:id": comment.id,
        "@_w:author": "Agmt Proof",
        "@_w:initials": "AP",
        "@_w:date": date,
      })), { "@_xmlns:w": W })];
      zip.file(name, builder.build(treeComments));
      modifiedParts.push(name);
      const relName = "word/_rels/document.xml.rels";
      const relFile = zip.file(relName);
      if (!relFile) throw new Error("no_document_rels");
      const relTree: XmlNode[] = parser.parse(await relFile.async("string"));
      const relRoot = relTree.find((node) => xmlTag(node) === "Relationships");
      if (!relRoot) throw new Error("no_document_rels");
      const relIds = new Set(xmlChildren(relRoot).map((node) => xmlAttrs(node)["@_Id"]));
      let suffix = 1;
      while (relIds.has(`rIdAgmt${suffix}`)) suffix++;
      xmlChildren(relRoot).push(element("Relationship", [], {
        "@_Id": `rIdAgmt${suffix}`,
        "@_Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
        "@_Target": "comments.xml",
      }));
      zip.file(relName, builder.build(relTree));
      modifiedParts.push(relName);
      const contentTree: XmlNode[] = parser.parse(await zip.file("[Content_Types].xml")!.async("string"));
      const typesRoot = contentTree.find((node) => xmlTag(node) === "Types")!;
      xmlChildren(typesRoot).push(element("Override", [], {
        "@_PartName": "/word/comments.xml",
        "@_ContentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
      }));
      zip.file("[Content_Types].xml", builder.build(contentTree));
      modifiedParts.push("[Content_Types].xml");
    }
  }
  const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  if (output.length > 35 * 1024 * 1024) throw new Error("output_too_large");
  const receipt = ExportReceiptSchema.parse({
    receiptVersion: EXPORT_RECEIPT_VERSION,
    exporterVersion: EXPORTER_VERSION,
    sourceSha256: plan.sourceSha256,
    planFindingIds: plan.findings.map((finding) => finding.id),
    revisionIds,
    commentIds,
    noticeIds,
    modifiedParts,
    plan,
  });
  await validateProofExport(bytes, output, receipt, analysis, original);
  return { bytes: output, analysis, receipt };
}

export async function validateProofExport(sourceBytes: Buffer, output: Buffer, receipt: ExportReceipt, analysis?: Analysis, sourceZip?: JSZip): Promise<void> {
  const resolved = analysis ?? await analyzeProof(sourceBytes);
  assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), receipt.plan.sourceSha256, "source_digest");
  ExportReceiptSchema.parse(receipt);
  await validateOutputPackage({ sourceBytes, output, receipt, sourceZip });
  await validateOutputReconstruction({ sourceBytes, output, receipt, analysis: resolved, sourceZip });
}
