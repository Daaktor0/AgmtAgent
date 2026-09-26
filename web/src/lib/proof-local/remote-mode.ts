/**
 * Explicit remote/R2 processing mode. Disabled for the browser-only launch.
 *
 * R2 is object storage, not a proofreading processor or antivirus service.
 * Enabling it would not improve rule accuracy or lift the measured browser
 * capacity policy. A future remote host must reuse `processProofLocal` (bytes in →
 * receipt + output out) after:
 * - explicit user choice and accurate privacy copy
 * - server-side credentials and owner isolation
 * - an upload-time deadline that retries cannot extend
 * - independently verified deletion within the original two-hour window
 *
 * This module must not import R2 clients, upload helpers, or credentials.
 */
export const PROOF_REMOTE_MODE_VERSION = "proof-remote-mode-v0";
export const PROOF_REMOTE_MODE_ENABLED = false;

export type ProofRemoteModeConsent = {
  selectedByUser: true;
  privacyCopyVersion: string;
};

export function remoteProofProcessingAllowed(_consent?: ProofRemoteModeConsent): false {
  return false;
}
