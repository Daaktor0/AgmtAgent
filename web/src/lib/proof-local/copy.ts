import { PROOF_LOCAL_SIZE_LABEL } from "./limits.ts";

export const PROOF_LOCAL_PRIVACY =
  "Your document is processed on this device. Agmt’s servers do not receive the file. Agmt does not virus-scan the file. Refreshing or closing this page loses the current run; choose the file again to restart. Proof does not promise secure erasure from browser memory, and a copy you download stays on your device.";

export const PROOF_LOCAL_HEADING = "Proofread your Word document.";
export const PROOF_LOCAL_MAIN = "Get safe corrections as tracked changes and points to check as Word comments.";
export const PROOF_LOCAL_CHOOSE = "Choose a Word document";
export const PROOF_LOCAL_DEVICE = "Processing happens on this device.";
export const PROOF_LOCAL_TOO_LARGE = `This file exceeds the ${PROOF_LOCAL_SIZE_LABEL} limit.`;
export const PROOF_LOCAL_WRONG_FILE = "Choose a Word (.docx) file containing document text.";
export const PROOF_LOCAL_MULTIPLE = "Choose one document at a time.";
export const PROOF_LOCAL_SIGNED_OUT = "Sign in to use Proof.";
export const PROOF_LOCAL_CANCELLED = "Checking was cancelled. You can choose the file again.";
export const PROOF_LOCAL_SESSION_LOST = "This run is no longer available. Choose the file again to restart.";
