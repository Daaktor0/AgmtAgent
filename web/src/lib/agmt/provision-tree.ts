import { RE_DECIMAL, RE_DEF_PLAIN, RE_DEF_QUOTED, RE_HEADING, RE_LIMB, RE_SIG_START } from "./patterns.ts";
import type { ExtractedBlock, ExtractedDocument, NodeType, Provision } from "./types.ts";

function headingKind(word: string): NodeType {
  const w = word.toUpperCase();
  if (["SCHEDULE", "ANNEXURE", "EXHIBIT", "APPENDIX"].includes(w)) return "schedule";
  if (w === "ANNEX") return "annex";
  if (w === "PART") return "part";
  return "clause";
}

function nativeNumber(block: ExtractedBlock): string | null {
  if (!block.numbering || block.numberingFormat === "bullet" || block.numberingFormat === "none") return null;
  return block.numbering.trim().replace(/\.$/, "") || null;
}

function classifyBlock(
  b: ExtractedBlock,
  inSignature: boolean,
  currentScope: { type: string; id: string },
): { nodeType: NodeType; number: string | null; heading: string | null; confidence: number } {
  const text = b.text.trim();
  if (!text) return { nodeType: "unclassified", number: null, heading: null, confidence: 1 };
  if (inSignature || RE_SIG_START.test(text) || /^signed\s+for\s+and\s+on\s+behalf/i.test(text)) {
    return { nodeType: "signature_block", number: null, heading: text.slice(0, 80), confidence: 0.9 };
  }
  if (/^whereas\b/i.test(text) || currentScope.type === "recitals") {
    return { nodeType: "recital", number: null, heading: null, confidence: 0.85 };
  }
  const h = text.match(RE_HEADING);
  if (h) {
    return {
      nodeType: headingKind(h[1]),
      number: `${h[1][0].toUpperCase()}${h[1].slice(1).toLowerCase()} ${h[2].toUpperCase()}`,
      heading: h[3].trim() || null,
      confidence: 0.95,
    };
  }

  const resolvedNumber = nativeNumber(b);
  if (resolvedNumber) {
    const level = b.numberingLevel ?? 0;
    return {
      nodeType: currentScope.type === "definitions" && level > 0 ? "definition_entry" : level > 0 ? "subclause" : "clause",
      number: resolvedNumber,
      heading: text.length < 120 ? text : text.slice(0, 80),
      confidence: 0.96,
    };
  }

  const d = text.match(RE_DECIMAL);
  if (d) {
    const rest = text.slice(d[0].length).trim();
    const isSub = d[1].includes(".");
    return {
      nodeType: isSub ? "subclause" : "clause",
      number: d[1],
      heading: rest.length < 120 ? rest || null : rest.slice(0, 80),
      confidence: 0.9,
    };
  }
  if (RE_LIMB.test(text)) {
    return { nodeType: "subclause", number: text.match(RE_LIMB)?.[1] ?? null, heading: null, confidence: 0.8 };
  }
  if (RE_DEF_PLAIN.test(text) || RE_DEF_QUOTED.test(text) || currentScope.type === "definitions") {
    return { nodeType: "definition_entry", number: null, heading: text.slice(0, 80), confidence: 0.8 };
  }
  if (/^interpretation\b|^definitions?\b/i.test(text)) {
    return { nodeType: "clause", number: null, heading: text.slice(0, 80), confidence: 0.7 };
  }
  return { nodeType: "unclassified", number: null, heading: null, confidence: 0.4 };
}

function isScheduleScope(type: string): boolean {
  return type === "schedule" || type === "annex";
}

/**
 * Every extracted non-blank line belongs to exactly one text-owning leaf.
 * Internal nodes represent hierarchy and do not own child text.
 */
export function buildProvisionTree(doc: ExtractedDocument): Provision[] {
  const rootId = "p:root";
  const provisions: Provision[] = [
    {
      provisionId: rootId,
      parentProvisionId: null,
      orderIndex: 0,
      nodeType: "document",
      ownsText: false,
      number: null,
      heading: null,
      scopeType: "main_body",
      scopeId: "main",
      canonicalText: "",
      canonicalLength: 0,
      sourceXmlAnchor: { kind: "paragraph", path: "/w:document" },
      sourceStart: 0,
      sourceEnd: 0,
      structuralPath: ["document"],
      classificationConfidence: 1,
      lineStart: 0,
      lineEnd: 0,
      blockIndex: null,
    },
  ];

  let currentParent = rootId;
  let currentScope = { type: "main_body", id: "main" };
  let inSignature = false;
  let inDefinitions = false;
  let inRecitals = false;
  let inheritType: NodeType | null = null;
  let order = 0;
  let globalLine = 1;
  const childCount = new Map<string, number>([[rootId, 0]]);

  const push = (p: Provision) => {
    provisions.push(p);
    childCount.set(p.provisionId, 0);
    childCount.set(p.parentProvisionId ?? rootId, (childCount.get(p.parentProvisionId ?? rootId) ?? 0) + 1);
  };

  for (const b of doc.blocks) {
    const raw = b.text;
    if (!raw.replace(/\s/g, "").length) {
      globalLine += raw.split("\n").length;
      continue;
    }
    const trimmed = raw.trim();

    if (RE_SIG_START.test(raw) || /^signature\s+page\b/i.test(trimmed)) {
      inSignature = true;
      inDefinitions = false;
      inRecitals = false;
      inheritType = "signature_block";
    }

    if (
      /^between\b/i.test(trimmed) ||
      /^this\s+(shareholders|share\s+subscription|share\s+purchase)\s+agreement\b/i.test(trimmed)
    ) {
      if (!inSignature && !isScheduleScope(currentScope.type)) {
        inRecitals = true;
        inheritType = "recital";
        currentScope = { type: "recitals", id: "recitals" };
      }
    }

    if (/^whereas\b/i.test(trimmed) || /^recitals?\b/i.test(trimmed)) {
      inRecitals = true;
      inDefinitions = false;
      inheritType = "recital";
      if (!isScheduleScope(currentScope.type)) currentScope = { type: "recitals", id: "recitals" };
    }

    const h = trimmed.match(RE_HEADING);
    if (h) {
      const kind = headingKind(h[1]);
      if (kind === "schedule" || kind === "annex") {
        currentScope = { type: kind, id: `${kind}:${h[2]}` };
        inDefinitions = false;
        inRecitals = false;
        inSignature = false;
        inheritType = kind;
      } else if (kind === "part") {
        currentScope = { type: "part", id: `part:${h[2]}` };
        inheritType = "part";
      } else {
        if (!isScheduleScope(currentScope.type)) currentScope = { type: "main_body", id: "main" };
        inRecitals = false;
        inheritType = "clause";
      }
    }

    const dec = trimmed.match(RE_DECIMAL);
    const nativeTopLevel = Boolean(nativeNumber(b)) && (b.numberingLevel ?? 0) === 0 && !b.isHeaderFooter;
    const typedTopLevel = Boolean(dec && !dec[1].includes("."));
    if (nativeTopLevel || typedTopLevel) {
      const rest = dec ? trimmed.slice(dec[0].length).trim() : trimmed;
      if (/^definitions?\b/i.test(rest) || /^interpretation\b/i.test(rest)) {
        inDefinitions = true;
        inRecitals = false;
        inheritType = "definition_entry";
        if (!isScheduleScope(currentScope.type)) currentScope = { type: "definitions", id: "definitions" };
      } else if (!inSignature) {
        inDefinitions = false;
        inRecitals = false;
        inheritType = "clause";
        if (currentScope.type === "definitions" || currentScope.type === "recitals") {
          currentScope = { type: "main_body", id: "main" };
        }
      }
    }

    if ((/^definitions?\b/i.test(trimmed) || /^interpretation\b/i.test(trimmed)) && !dec && !h && !nativeTopLevel) {
      inDefinitions = true;
      inheritType = "definition_entry";
      if (!isScheduleScope(currentScope.type)) currentScope = { type: "definitions", id: "definitions" };
    }

    const classifyScope = inDefinitions
      ? { type: isScheduleScope(currentScope.type) ? currentScope.type : "definitions", id: currentScope.id }
      : inRecitals
        ? { type: "recitals", id: currentScope.id }
        : currentScope;

    const cls = classifyBlock(b, inSignature && !b.isHeaderFooter, classifyScope);

    if (cls.nodeType === "unclassified" && inheritType && !b.isHeaderFooter) {
      if (inSignature) cls.nodeType = "signature_block";
      else if (inRecitals) cls.nodeType = "recital";
      else if (inDefinitions) cls.nodeType = "definition_entry";
      else if (inheritType === "schedule" || inheritType === "annex") cls.nodeType = inheritType;
      else cls.nodeType = inheritType === "part" ? "clause" : inheritType;
      cls.confidence = Math.max(cls.confidence, 0.7);
    }

    const topLevelClause =
      cls.nodeType === "clause" &&
      Boolean(cls.number) &&
      (b.numberingLevel != null ? b.numberingLevel === 0 : !String(cls.number).includes("."));
    const isStructural = Boolean(h) || topLevelClause;

    if (isStructural && (cls.nodeType === "schedule" || cls.nodeType === "annex" || cls.nodeType === "part")) {
      const containerId = `p:c:${b.index}`;
      const oc = childCount.get(rootId) ?? 0;
      push({
        provisionId: containerId,
        parentProvisionId: rootId,
        orderIndex: oc,
        nodeType: cls.nodeType,
        ownsText: false,
        number: cls.number,
        heading: cls.heading,
        scopeType: currentScope.type,
        scopeId: currentScope.id,
        canonicalText: "",
        canonicalLength: 0,
        sourceXmlAnchor: b.xmlAnchor,
        sourceStart: b.sourceStart,
        sourceEnd: b.sourceEnd,
        structuralPath: ["document", cls.nodeType, cls.number],
        classificationConfidence: cls.confidence,
        lineStart: globalLine,
        lineEnd: globalLine,
        blockIndex: null,
      });
      currentParent = containerId;
    } else if (isStructural && topLevelClause) {
      currentParent = isScheduleScope(currentScope.type) ? currentParent : rootId;
    }

    const parent = currentParent;
    const oc = childCount.get(parent) ?? 0;
    const leafId = `p:${b.index}`;
    push({
      provisionId: leafId,
      parentProvisionId: parent,
      orderIndex: oc,
      nodeType: cls.nodeType,
      ownsText: true,
      number: cls.number,
      heading: cls.heading,
      scopeType: currentScope.type,
      scopeId: currentScope.id,
      canonicalText: raw,
      canonicalLength: raw.length,
      sourceXmlAnchor: b.xmlAnchor,
      sourceStart: b.sourceStart,
      sourceEnd: b.sourceEnd,
      structuralPath: ["document", currentScope.type, cls.nodeType, cls.number ?? String(order), oc],
      classificationConfidence: cls.confidence,
      lineStart: globalLine,
      lineEnd: globalLine + Math.max(0, raw.split("\n").length - 1),
      blockIndex: b.index,
    });
    order += 1;
    globalLine += raw.split("\n").length;
  }

  return provisions;
}

export function assertLineOwnership(provisions: Provision[], blocks: ExtractedBlock[]): string[] {
  const errors: string[] = [];
  const owned = new Set<string>();
  const leaves = provisions.filter((p) => p.ownsText);
  for (const b of blocks) {
    const lines = b.text.split("\n");
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      const key = `${b.index}:${i}`;
      const owners = leaves.filter((p) => p.blockIndex === b.index);
      if (owners.length !== 1) errors.push(`line ${key} owners=${owners.length}`);
      else {
        if (owned.has(key)) errors.push(`overlap ${key}`);
        owned.add(key);
      }
    });
  }
  return errors;
}
