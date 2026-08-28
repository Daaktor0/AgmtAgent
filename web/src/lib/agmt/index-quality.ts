import {
  INDEX_QUALITY_VERSION,
  INDEX_WEIGHTS,
  MATERIAL_UNCLASSIFIED_LEAF_CHARS,
  MATERIAL_UNCLASSIFIED_SHARE,
  SOURCE_QUALITY_HIGH,
  SOURCE_QUALITY_MEDIUM,
  USABLE_OUTLINE_CLASSIFIED_SHARE,
  USABLE_OUTLINE_NUMBERED_MIN,
} from "./config.ts";
import type { ExtractedDocument, IndexQuality, Provision, SourceQuality } from "./types.ts";

export { INDEX_QUALITY_VERSION };

export function scoreIndex(provisions: Provision[], doc: ExtractedDocument): IndexQuality {
  const leaves = provisions.filter((p) => p.ownsText);
  const nonBlankChars = leaves.reduce((n, p) => n + p.canonicalText.replace(/\s+/g, "").length, 0) || 1;
  const unclassified = leaves.filter((p) => p.nodeType === "unclassified");
  const unclassifiedChars = unclassified.reduce(
    (n, p) => n + p.canonicalText.replace(/\s+/g, "").length,
    0,
  );
  const classifiedShare = 1 - unclassifiedChars / nonBlankChars;
  const materialUnclassified =
    unclassifiedChars / nonBlankChars > MATERIAL_UNCLASSIFIED_SHARE ||
    unclassified.some((p) => p.canonicalText.replace(/\s+/g, "").length > MATERIAL_UNCLASSIFIED_LEAF_CHARS);

  const numbered = leaves.filter((p) => p.number);
  const topLevel = leaves.filter(
    (p) => p.nodeType === "clause" || p.nodeType === "schedule" || p.nodeType === "part" || p.nodeType === "annex",
  );
  const usableOutline =
    topLevel.length >= 1 &&
    (classifiedShare >= USABLE_OUTLINE_CLASSIFIED_SHARE || numbered.length >= USABLE_OUTLINE_NUMBERED_MIN);

  const nums = numbered.map((p) => p.number!).filter((n) => /^\d+(\.\d+)*$/.test(n));
  const unique = new Set(nums);
  const numberingConsistency = nums.length ? unique.size / nums.length : 0.5;

  let outlineContinuity = 0.5;
  const ints = nums.filter((n) => /^\d+$/.test(n)).map(Number).sort((a, b) => a - b);
  if (ints.length >= 2) {
    let gaps = 0;
    for (let i = 1; i < ints.length; i++) if (ints[i] !== ints[i - 1] + 1 && ints[i] !== ints[i - 1]) gaps++;
    outlineContinuity = Math.max(0, 1 - gaps / ints.length);
  } else if (topLevel.length) outlineContinuity = 0.7;

  const defLeaves = leaves.filter((p) => p.nodeType === "definition_entry");
  const definitionMapping = defLeaves.length ? Math.min(1, defLeaves.length / 3) : 0.4;

  const tableBlocks = doc.blocks.filter((b) => b.isTable && b.text.trim());
  const tableCompleteness = tableBlocks.length
    ? Math.min(1, tableBlocks.filter((b) => b.text.trim().length > 1).length / tableBlocks.length)
    : 0.8;

  const components = {
    classifiedCoverage: classifiedShare,
    outlineContinuity,
    numberingConsistency,
    definitionMapping,
    tableCompleteness,
  };
  const structureConfidence =
    components.classifiedCoverage * INDEX_WEIGHTS.classifiedCoverage +
    components.outlineContinuity * INDEX_WEIGHTS.outlineContinuity +
    components.numberingConsistency * INDEX_WEIGHTS.numberingConsistency +
    components.definitionMapping * INDEX_WEIGHTS.definitionMapping +
    components.tableCompleteness * INDEX_WEIGHTS.tableCompleteness;

  let sourceQuality: SourceQuality;
  if (!usableOutline) sourceQuality = "unreadable";
  else if (structureConfidence >= SOURCE_QUALITY_HIGH && !materialUnclassified) sourceQuality = "high";
  else if (structureConfidence >= SOURCE_QUALITY_MEDIUM) sourceQuality = "medium";
  else sourceQuality = "low";

  return {
    structureConfidence: Math.round(structureConfidence * 1000) / 1000,
    sourceQuality,
    classifiedShare: Math.round(classifiedShare * 1000) / 1000,
    materialUnclassified,
    usableOutline,
    components,
  };
}
