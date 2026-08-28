import { extractDocx } from "./docx.ts";
import { buildProvisionTree } from "./provision-tree.ts";
import { extractDefinitions } from "./definitions.ts";
import { proposeCanonicalisation, mapSha } from "./canonicalise.ts";
import { scoreIndex } from "./index-quality.ts";
import { detectInstrument } from "./instrument.ts";
import { buildDealMap } from "./deal-map.ts";
import { runProof, validateHit } from "./proof/runner.ts";
import { signatureInventory } from "./proof/checks.ts";
import { FILE_BYTE_CAP, INGEST_SCHEMA_VERSION, PAGE_CAP, RECOGNISER_VERSION } from "./config.ts";
import type { ProposedEntry, Provision } from "./types.ts";
import { exceedsPageCap } from "./page-count.ts";

export type IngestRefusal = {
  refused: true;
  code: string;
  message: string;
  pageCount?: number;
  byteSize: number;
};

export type IngestOk = {
  refused: false;
  extracted: Awaited<ReturnType<typeof extractDocx>>;
  sourceProvisions: Provision[];
  proposed: ReturnType<typeof proposeCanonicalisation>;
  definitions: ReturnType<typeof extractDefinitions>["definitions"];
  uses: ReturnType<typeof extractDefinitions>["uses"];
  quality: ReturnType<typeof scoreIndex>;
  instrument: ReturnType<typeof detectInstrument>;
  mapSha: string;
  recogniserVersion: string;
  ingestSchemaVersion: string;
};

export async function ingestBuffer(bytes: Buffer): Promise<IngestOk | IngestRefusal> {
  if (bytes.byteLength > FILE_BYTE_CAP) {
    return {
      refused: true,
      code: "file_too_large",
      message: "File exceeds 25 MiB. Split the pack. Agmt will not truncate.",
      byteSize: bytes.byteLength,
    };
  }
  let extracted;
  try {
    extracted = await extractDocx(bytes);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "corrupt";
    const messages: Record<string, string> = {
      not_docx: "Upload the native Word (.docx) file.",
      encrypted: "The file is encrypted or password-protected. Upload an unencrypted native Word (.docx) file.",
      corrupt: "The file could not be read. Upload the native Word (.docx) file.",
      macro: "Macro-enabled files are refused.",
    };
    return {
      refused: true,
      code,
      message: messages[code] ?? "Upload the native Word (.docx) file.",
      byteSize: bytes.byteLength,
    };
  }
  if (exceedsPageCap(extracted.pageCount)) {
    return {
      refused: true,
      code: "page_cap",
      message: `This file is ${extracted.pageCount} pages. The Proof cap is ${PAGE_CAP} pages per file. Split the document. Agmt will not ingest the first ${PAGE_CAP} pages only.`,
      pageCount: extracted.pageCount,
      byteSize: bytes.byteLength,
    };
  }
  const sourceProvisions = buildProvisionTree(extracted);
  const { definitions, uses } = extractDefinitions(sourceProvisions);
  const proposed = proposeCanonicalisation(sourceProvisions, definitions);
  const quality = scoreIndex(proposed.provisions, extracted);
  const instrument = detectInstrument(sourceProvisions);
  return {
    refused: false,
    extracted,
    sourceProvisions,
    proposed,
    definitions,
    uses,
    quality,
    instrument,
    mapSha: mapSha(proposed.entries),
    recogniserVersion: RECOGNISER_VERSION,
    ingestSchemaVersion: INGEST_SCHEMA_VERSION,
  };
}

export function applyMap(
  sourceProvisions: Provision[],
  entries: ProposedEntry[],
): Provision[] {
  const byProv = new Map<string, ProposedEntry[]>();
  for (const e of entries) {
    if (e.userDecision === "not_identifier") continue;
    const list = byProv.get(e.sourceProvisionId) ?? [];
    list.push(e);
    byProv.set(e.sourceProvisionId, list);
  }
  return sourceProvisions.map((p) => {
    const list = (byProv.get(p.provisionId) ?? []).slice().sort((a, b) => a.sourceStart - b.sourceStart);
    if (!list.length || !p.ownsText) return { ...p };
    const source = p.canonicalText;
    let cursor = 0;
    let canonical = "";
    for (const e of list) {
      if (e.sourceStart > cursor) canonical += source.slice(cursor, e.sourceStart);
      canonical += e.replacement;
      cursor = e.sourceEnd;
    }
    if (cursor < source.length) canonical += source.slice(cursor);
    return { ...p, canonicalText: canonical, canonicalLength: canonical.length };
  });
}

export function runConfirmedProof(
  provisions: Provision[],
  definitions: ReturnType<typeof extractDefinitions>["definitions"],
  uses: ReturnType<typeof extractDefinitions>["uses"],
  extracted: Awaited<ReturnType<typeof extractDocx>>,
) {
  const result = runProof({ provisions, definitions, uses, extracted });
  const filled = result.hits.map((h) => {
    const v = validateHit(h, provisions);
    return { hit: h, quote: v.quote, valid: v.ok };
  });
  const dealMap = buildDealMap(provisions);
  const signatures = signatureInventory({ provisions, definitions, uses, extracted });
  return { result, filled, dealMap, signatures };
}

export function identifierCategoryCounts(entries: ProposedEntry[]) {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    if (e.kind !== "identifier") continue;
    const k = e.identifierType ?? "other";
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}
