import type { ZipLimitSet } from "../agmt/zip-safety.ts";

/**
 * Browser resource ceilings from the 2026-09-09 Chromium measurement:
 * 1.02 MiB synthetic used ~102 MiB extra JS heap in 1.3 s. 25 MiB was not run
 * and is not claimed. Expanded ZIP and per-entry caps are tighter than the
 * unused server ingest limits so a compressed package cannot expand past a
 * reasonable desktop/mobile budget.
 */
export const PROOF_LOCAL_LIMITS_VERSION = "proof-local-limits-v1";

export const PROOF_LOCAL_MAX_SOURCE_BYTES = 1 * 1024 * 1024;
export const PROOF_LOCAL_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
export const PROOF_LOCAL_MAX_PROCESSING_MS = 30_000;

export const PROOF_LOCAL_ZIP_LIMITS: ZipLimitSet = {
  MAX_SOURCE_BYTES: PROOF_LOCAL_MAX_SOURCE_BYTES,
  MAX_OUTPUT_BYTES: PROOF_LOCAL_MAX_OUTPUT_BYTES,
  MAX_ENTRIES: 500,
  MAX_EXPANDED_BYTES: 16 * 1024 * 1024,
  MAX_ENTRY_BYTES: 8 * 1024 * 1024,
  MAX_COMPRESSION_RATIO: 20,
  MAX_PATH_DEPTH: 128,
  MAX_CENTRAL_DIRECTORY_BYTES: 1 * 1024 * 1024,
  MAX_ENTRY_NAME_BYTES: 1024,
  MAX_ENTRY_COMMENT_BYTES: 1024,
};

export const PROOF_LOCAL_SIZE_LABEL = "1 MiB";

export function proofLocalSizeLabel(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)} MiB`;
  if (bytes % 1024 === 0) return `${bytes / 1024} KiB`;
  return `${bytes} bytes`;
}
