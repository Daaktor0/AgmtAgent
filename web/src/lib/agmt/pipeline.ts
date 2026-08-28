import { extractDocx } from "./docx-v2.ts";
import { buildProvisionTree } from "./provision-tree.ts";
import { extractDefinitions } from "./definitions.ts";
import { proposeCanonicalisation, mapSha } from "./canonicalise.ts";
import { scoreIndex } from "./index-quality.ts";
import { detectInstrument } from "./instrument.ts";
import { buildDealMap } from "./deal-map.ts";
import { runProof, validateHit } from "./proof/runner.ts";
import { deriveProofProductSummary } from "./proof/product.ts";
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
      package_too_complex: "The Word package contains too many internal parts to inspect safely.",
      unsafe_package_path: "The Word package contains an unsafe internal path.",
      package_entry_too_large: "The Word package contains an internal part that exceeds the safe inspection limit.",
      package_expanded_too_large: "The Word package expands beyond the safe inspection limit.",
      suspicious_compression_ratio: "The Word package has an unsafe compression ratio.",
      unsupported_embedded_content: "The Word file contains embedded or ActiveX content that Proof does not inspect safely yet.",
    };
    return {
      refused: true,
      code,
      message: messages[code] ?? "We could not safely inspect this Word file.",
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
  const quality = scoreIndex(proposed.provisions, extracted, { definitions, uses });
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

/**
 * Apply final user decisions against immutable source text. We refuse overlapping,
 * out-of-range, or stale entries rather than manufacturing a projection whose
 * evidence offsets can no longer be trusted.
 */
export function applyMap(sourceProvisions: Provision[], entries: ProposedEntry[]): Provision[] {
  const byProvision = new Map<string, ProposedEntry[]>();
  for (const entry of entries) {
    if (entry.userDecision === "not_identifier") continue;
    const list = byProvision.get(entry.sourceProvisionId) ?? [];
    list.push(entry);
    byProvision.set(entry.sourceProvisionId, list);
  }

  return sourceProvisions.map((provision) => {
    const list = (byProvision.get(provision.provisionId) ?? [])
      .slice()
      .sort((a, b) => a.sourceStart - b.sourceStart || a.sourceEnd - b.sourceEnd);
    if (!list.length || !provision.ownsText) return { ...provision };

    const source = provision.canonicalText;
    let cursor = 0;
    let canonical = "";
    for (const entry of list) {
      if (
        entry.sourceStart < cursor ||
        entry.sourceStart < 0 ||
        entry.sourceEnd < entry.sourceStart ||
        entry.sourceEnd > source.length
      ) {
        throw Object.assign(new Error("canonicalisation_overlap_or_bounds"), {
          code: "canonicalisation_overlap_or_bounds",
          entryId: entry.entryId,
        });
      }
      if (source.slice(entry.sourceStart, entry.sourceEnd) !== entry.originalValue) {
        throw Object.assign(new Error("canonicalisation_source_mismatch"), {
          code: "canonicalisation_source_mismatch",
          entryId: entry.entryId,
        });
      }
      if (entry.sourceStart > cursor) canonical += source.slice(cursor, entry.sourceStart);
      canonical += entry.replacement;
      cursor = entry.sourceEnd;
    }
    if (cursor < source.length) canonical += source.slice(cursor);
    return { ...provision, canonicalText: canonical, canonicalLength: canonical.length };
  });
}

export function runConfirmedProof(
  provisions: Provision[],
  _proposalDefinitions: ReturnType<typeof extractDefinitions>["definitions"],
  _proposalUses: ReturnType<typeof extractDefinitions>["uses"],
  extracted: Awaited<ReturnType<typeof extractDocx>>,
) {
  // Canonicalisation can change token lengths and use sites. All derived indexes
  // used by Proof must therefore be rebuilt from the final confirmed projection.
  const finalIndex = extractDefinitions(provisions);
  const result = runProof({
    provisions,
    definitions: finalIndex.definitions,
    uses: finalIndex.uses,
    extracted,
  });

  const filled = result.hits.map((hit) => {
    const validation = validateHit(hit, provisions);
    return { hit, quote: validation.quote, valid: validation.ok };
  });
  const visibleHits = filled.filter((item) => item.valid).map((item) => item.hit);
  const invalidEvidenceCount = filled.length - visibleHits.length;
  const product = deriveProofProductSummary(result, {
    invalidEvidenceCount,
    visibleHits,
  });

  const dealMap = buildDealMap(provisions);
  const signatures = signatureInventory({
    provisions,
    definitions: finalIndex.definitions,
    uses: finalIndex.uses,
    extracted,
  });

  return {
    result,
    filled,
    visibleHits,
    invalidEvidenceCount,
    product,
    dealMap,
    signatures,
    finalDefinitions: finalIndex.definitions,
    finalUses: finalIndex.uses,
  };
}

export function identifierCategoryCounts(entries: ProposedEntry[]) {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.kind !== "identifier") continue;
    const key = entry.identifierType ?? "other";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
