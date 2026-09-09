/**
 * Closed antivirus scan receipt (PWC-22 local contract).
 *
 * Structural ZIP screening is not a clean scan. Missing ClamAV is
 * scanner_unavailable, never a clean receipt.
 */
export const PROOF_SCAN_RECEIPT_VERSION = "proof-scan-receipt-v1";

export type ProofScanStatus = "clean" | "infected" | "failed" | "scanner_unavailable" | "stale_signatures";

export type ProofScanReceipt = {
  version: typeof PROOF_SCAN_RECEIPT_VERSION;
  sourceSha256: string;
  byteSize: number;
  engineVersion: string;
  signatureVersion: string;
  scannedAt: number;
  status: ProofScanStatus;
};

export function mayAdvanceAfterScan(receipt: ProofScanReceipt | null): boolean {
  return receipt?.status === "clean";
}

export function unavailableScanReceipt(input: { sourceSha256: string; byteSize: number; now: number }): ProofScanReceipt {
  return {
    version: PROOF_SCAN_RECEIPT_VERSION,
    sourceSha256: input.sourceSha256,
    byteSize: input.byteSize,
    engineVersion: "unprovisioned",
    signatureVersion: "unprovisioned",
    scannedAt: input.now,
    status: "scanner_unavailable",
  };
}
