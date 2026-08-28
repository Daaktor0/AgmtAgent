import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { ExtractedDocument, SourceCapability } from "./types.ts";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: false,
  parseTagValue: false,
});

type Obj = Record<string, unknown>;

export type NumberingRequest = {
  numId: string | null;
  level: number | null;
  styleId?: string | null;
};

export type NumberingResolution = {
  label: string;
  numId: string;
  level: number;
  format: string;
  supported: boolean;
};

type LevelSpec = {
  level: number;
  start: number;
  format: string;
  text: string;
};

type NumSpec = {
  abstractId: string;
  startOverrides: Map<number, number>;
};

type StyleNumbering = { numId: string; level: number };

function asArray(value: unknown): Obj[] {
  if (value == null) return [];
  return Array.isArray(value) ? (value as Obj[]) : [value as Obj];
}

function obj(value: unknown): Obj {
  return value && typeof value === "object" ? (value as Obj) : {};
}

function attr(value: unknown, name = "@_w:val"): string | null {
  const record = obj(value);
  const direct = record[name];
  if (direct != null) return String(direct);
  return null;
}

function integer(value: string | null, fallback: number): number {
  if (value == null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function alpha(value: number): string {
  if (value <= 0) return String(value);
  let n = value;
  let out = "";
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function roman(value: number): string {
  if (value <= 0 || value >= 4000) return String(value);
  const pairs: [number, string][] = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let n = value;
  let out = "";
  for (const [unit, token] of pairs) {
    while (n >= unit) {
      out += token;
      n -= unit;
    }
  }
  return out;
}

const SUPPORTED_FORMATS = new Set([
  "decimal",
  "decimalZero",
  "lowerLetter",
  "upperLetter",
  "lowerRoman",
  "upperRoman",
  "bullet",
  "none",
]);

function formatNumber(value: number, format: string): string {
  switch (format) {
    case "decimalZero":
      return String(value).padStart(2, "0");
    case "lowerLetter":
      return alpha(value);
    case "upperLetter":
      return alpha(value).toUpperCase();
    case "lowerRoman":
      return roman(value);
    case "upperRoman":
      return roman(value).toUpperCase();
    case "decimal":
    default:
      return String(value);
  }
}

function parseAbstracts(root: Obj): Map<string, Map<number, LevelSpec>> {
  const output = new Map<string, Map<number, LevelSpec>>();
  for (const abstract of asArray(root["w:abstractNum"])) {
    const abstractId = String(abstract["@_w:abstractNumId"] ?? "");
    if (!abstractId) continue;
    const levels = new Map<number, LevelSpec>();
    for (const level of asArray(abstract["w:lvl"])) {
      const ilvl = integer(String(level["@_w:ilvl"] ?? "0"), 0);
      const start = integer(attr(level["w:start"]), 1);
      const format = attr(level["w:numFmt"]) ?? "decimal";
      const text = attr(level["w:lvlText"]) ?? `%${ilvl + 1}`;
      levels.set(ilvl, { level: ilvl, start, format, text });
    }
    output.set(abstractId, levels);
  }
  return output;
}

function parseNums(root: Obj): Map<string, NumSpec> {
  const output = new Map<string, NumSpec>();
  for (const num of asArray(root["w:num"])) {
    const numId = String(num["@_w:numId"] ?? "");
    const abstractId = attr(num["w:abstractNumId"]);
    if (!numId || abstractId == null) continue;
    const startOverrides = new Map<number, number>();
    for (const override of asArray(num["w:lvlOverride"])) {
      const level = integer(String(override["@_w:ilvl"] ?? "0"), 0);
      const start = attr(override["w:startOverride"]);
      if (start != null) startOverrides.set(level, integer(start, 1));
    }
    output.set(numId, { abstractId, startOverrides });
  }
  return output;
}

function parseStyleNumbering(stylesXml: string | null): Map<string, StyleNumbering> {
  const output = new Map<string, StyleNumbering>();
  if (!stylesXml) return output;
  const parsed = parser.parse(stylesXml) as Obj;
  const root = obj(parsed["w:styles"] ?? parsed);
  for (const style of asArray(root["w:style"])) {
    if (String(style["@_w:type"] ?? "") !== "paragraph") continue;
    const styleId = String(style["@_w:styleId"] ?? "");
    if (!styleId) continue;
    const pPr = obj(style["w:pPr"]);
    const numPr = obj(pPr["w:numPr"]);
    const numId = attr(numPr["w:numId"]);
    if (numId == null) continue;
    const level = integer(attr(numPr["w:ilvl"]), 0);
    output.set(styleId, { numId, level });
  }
  return output;
}

export type NumberingResolver = {
  resolve(request: NumberingRequest): NumberingResolution | null;
  hasNativeNumbering: boolean;
  unsupportedFormats: Set<string>;
};

/**
 * Stateful Word numbering projection. Call `resolve` in document order.
 * The resolver handles abstract numbering, instance start overrides, common
 * legal number formats, compound `%1.%2` labels and style-linked numbering.
 */
export function createNumberingResolver(
  numberingXml: string | null,
  stylesXml: string | null,
): NumberingResolver {
  if (!numberingXml) {
    return {
      resolve: () => null,
      hasNativeNumbering: false,
      unsupportedFormats: new Set<string>(),
    };
  }

  const parsed = parser.parse(numberingXml) as Obj;
  const root = obj(parsed["w:numbering"] ?? parsed);
  const abstracts = parseAbstracts(root);
  const nums = parseNums(root);
  const styles = parseStyleNumbering(stylesXml);
  const counters = new Map<string, (number | undefined)[]>();
  const unsupportedFormats = new Set<string>();

  function resolve(request: NumberingRequest): NumberingResolution | null {
    const style = request.styleId ? styles.get(request.styleId) : undefined;
    const numId = request.numId ?? style?.numId ?? null;
    const level = request.level ?? style?.level ?? (numId != null ? 0 : null);
    if (numId == null || level == null) return null;

    const num = nums.get(numId);
    if (!num) return null;
    const levels = abstracts.get(num.abstractId);
    const spec = levels?.get(level);
    if (!levels || !spec) return null;

    const state = counters.get(numId) ?? [];
    for (let deeper = level + 1; deeper < state.length; deeper += 1) state[deeper] = undefined;

    const starting = num.startOverrides.get(level) ?? spec.start;
    state[level] = state[level] == null ? starting : (state[level] as number) + 1;
    for (let ancestor = 0; ancestor < level; ancestor += 1) {
      const ancestorSpec = levels.get(ancestor);
      if (!ancestorSpec) continue;
      if (state[ancestor] == null) {
        state[ancestor] = num.startOverrides.get(ancestor) ?? ancestorSpec.start;
      }
    }
    counters.set(numId, state);

    const supported = SUPPORTED_FORMATS.has(spec.format);
    if (!supported) unsupportedFormats.add(spec.format);

    let label: string;
    if (spec.format === "bullet" || spec.format === "none") {
      label = spec.text;
    } else {
      label = spec.text.replace(/%([1-9])/g, (_match, raw: string) => {
        const referencedLevel = Number(raw) - 1;
        const referencedSpec = levels.get(referencedLevel);
        const value = state[referencedLevel];
        if (!referencedSpec || value == null) return `%${raw}`;
        return formatNumber(value, referencedSpec.format);
      });
    }

    return {
      label,
      numId,
      level,
      format: spec.format,
      supported,
    };
  }

  return {
    resolve,
    hasNativeNumbering: nums.size > 0,
    unsupportedFormats,
  };
}

function rawNumbering(numbering: string | null): { numId: string | null; level: number | null } {
  if (!numbering) return { numId: null, level: null };
  const [rawNumId = "", rawLevel = ""] = numbering.split(":", 2);
  const level = rawLevel === "" ? null : Number.parseInt(rawLevel, 10);
  return {
    numId: rawNumId || null,
    level: level != null && Number.isFinite(level) ? level : null,
  };
}

/**
 * Resolve Word-generated labels after OOXML extraction. The extractor keeps the
 * raw `numId:ilvl` tuple in `block.numbering`; this pass replaces it with the
 * visible label Word presents while retaining provenance in dedicated fields.
 */
export async function resolveExtractedNumbering(
  bytes: Buffer,
  document: ExtractedDocument,
): Promise<ExtractedDocument> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const numberingFile = zip.file("word/numbering.xml");
  const stylesFile = zip.file("word/styles.xml");
  const numberingXml = numberingFile ? await numberingFile.async("string") : null;
  const stylesXml = stylesFile ? await stylesFile.async("string") : null;
  const resolver = createNumberingResolver(numberingXml, stylesXml);
  let resolvedCount = 0;
  let unresolvedNativeCount = 0;

  const blocks = document.blocks.map((block) => {
    if (block.isHeaderFooter) return block;
    const raw = rawNumbering(block.numbering);
    const resolution = resolver.resolve({
      numId: raw.numId,
      level: raw.level,
      styleId: block.styleId,
    });
    if (!resolution) {
      if (raw.numId != null) unresolvedNativeCount += 1;
      return { ...block, numbering: null };
    }
    resolvedCount += 1;
    return {
      ...block,
      numbering: resolution.label,
      numberingNumId: resolution.numId,
      numberingLevel: resolution.level,
      numberingFormat: resolution.format,
    };
  });

  let numberingCapability: SourceCapability;
  if (!resolver.hasNativeNumbering) {
    numberingCapability = {
      name: "numbering",
      available: false,
      state: "evaluated_absent",
      detectorVersion: "word-numbering-v1",
      suppressionReason: null,
    };
  } else if (unresolvedNativeCount > 0 || resolver.unsupportedFormats.size > 0) {
    numberingCapability = {
      name: "numbering",
      available: true,
      state: "unsupported",
      detectorVersion: "word-numbering-v1",
      suppressionReason: [
        unresolvedNativeCount ? `${unresolvedNativeCount} numbered paragraphs could not be resolved` : null,
        resolver.unsupportedFormats.size
          ? `Unsupported formats: ${Array.from(resolver.unsupportedFormats).sort().join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("; "),
    };
  } else {
    numberingCapability = {
      name: "numbering",
      available: resolvedCount > 0,
      state: resolvedCount > 0 ? "evaluated_present" : "evaluated_absent",
      detectorVersion: "word-numbering-v1",
      suppressionReason: null,
    };
  }

  return {
    ...document,
    blocks,
    capabilities: [
      ...document.capabilities.filter((capability) => capability.name !== "numbering"),
      numberingCapability,
    ],
  };
}
