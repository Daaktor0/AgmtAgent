/**
 * Antivirus boundary (PWC-22).
 *
 * Structural ZIP screening is not a clean scan. Missing ClamAV is
 * scanner_unavailable. EICAR is infected even before the engine runs.
 * The shared Hostinger VPS is not an allowed scan target.
 */
import { unavailableScanReceipt, type ProofScanReceipt } from "./proof-scan-receipt.ts";

export const EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
export const PROOF_HOSTINGER_COMPUTE_ALLOWED = false;

const HOSTINGER_PROOF_HOSTS = new Set([
  "srv1086106.hstgr.cloud",
  "31.97.230.149",
  "2a02:4780:12:9454::1",
]);

export function proofScanEndpointAllowed(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (PROOF_HOSTINGER_COMPUTE_ALLOWED) return true;
  if (HOSTINGER_PROOF_HOSTS.has(host)) return false;
  if (host.endsWith(".hstgr.cloud")) return false;
  return true;
}

export function resolveProofAntivirus(endpoint: string | undefined | null, fetchImpl: typeof fetch = fetch): ProofAntivirus {
  if (!endpoint || !proofScanEndpointAllowed(endpoint)) {
    return unprovisionedAntivirus();
  }
  return clamavHttpAntivirus(endpoint, fetchImpl);
}

export type ProofAntivirus = {
  scan(input: { bytes: Uint8Array; sourceSha256: string; byteSize: number; now: number }): Promise<ProofScanReceipt>;
  healthy(now: number): Promise<boolean>;
};

export function containsEicar(bytes: Uint8Array): boolean {
  return Buffer.from(bytes).includes(EICAR_SIGNATURE);
}

export function unprovisionedAntivirus(): ProofAntivirus {
  return {
    async scan(input) {
      if (containsEicar(input.bytes)) {
        return {
          version: "proof-scan-receipt-v1",
          sourceSha256: input.sourceSha256,
          byteSize: input.byteSize,
          engineVersion: "eicar-preflight",
          signatureVersion: "eicar-std",
          scannedAt: input.now,
          status: "infected",
        };
      }
      return unavailableScanReceipt({
        sourceSha256: input.sourceSha256,
        byteSize: input.byteSize,
        now: input.now,
      });
    },
    async healthy() {
      return false;
    },
  };
}

export function clamavHttpAntivirus(endpoint: string, fetchImpl: typeof fetch = fetch): ProofAntivirus {
  if (!proofScanEndpointAllowed(endpoint)) {
    return unprovisionedAntivirus();
  }
  const base = endpoint.replace(/\/+$/, "");
  return {
    async scan(input) {
      if (containsEicar(input.bytes)) {
        return {
          version: "proof-scan-receipt-v1",
          sourceSha256: input.sourceSha256,
          byteSize: input.byteSize,
          engineVersion: "eicar-preflight",
          signatureVersion: "eicar-std",
          scannedAt: input.now,
          status: "infected",
        };
      }
      const response = await fetchImpl(`${base}/scan`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "x-proof-sha256": input.sourceSha256 },
        body: Buffer.from(input.bytes),
      });
      if (response.status === 503) {
        return unavailableScanReceipt({ sourceSha256: input.sourceSha256, byteSize: input.byteSize, now: input.now });
      }
      const receipt = await response.json() as ProofScanReceipt;
      if (!receipt || receipt.version !== "proof-scan-receipt-v1" || receipt.sourceSha256 !== input.sourceSha256) {
        return { ...unavailableScanReceipt({ sourceSha256: input.sourceSha256, byteSize: input.byteSize, now: input.now }), status: "failed" };
      }
      return receipt;
    },
    async healthy() {
      try {
        const response = await fetchImpl(`${base}/health`, { method: "GET" });
        if (!response.ok) return false;
        const body = await response.json() as { ready?: boolean; signatureAgeHours?: number };
        return body.ready === true && (body.signatureAgeHours == null || body.signatureAgeHours <= 24);
      } catch {
        return false;
      }
    },
  };
}
