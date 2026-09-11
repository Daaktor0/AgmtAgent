import { publishedProofCapacityPolicy } from "./policy.ts";
import { PROOF_LOCAL_SIZE_LABEL } from "./limits.ts";

export const PROOF_LOCAL_PRIVACY =
  "Your document is processed on this device. Agmt’s servers do not receive the file. Agmt does not virus-scan the file. Refreshing or closing this page loses the current run; choose the file again to restart. Proof does not promise secure erasure from browser memory, and a copy you download stays on your device.";

export const PROOF_LOCAL_HEADING = "Proofread your Word document.";
export const PROOF_LOCAL_MAIN = "Get safe corrections as tracked changes and points to check as Word comments.";
export const PROOF_LOCAL_ZERO_FINDINGS = "Completed checks found nothing to mark.";
export const PROOF_LOCAL_ZERO_DETAIL =
  "This does not confirm that the document is error-free. Proof does not check grammar, style or legal meaning.";
export const PROOF_LOCAL_SCOPE =
  "Proof checks ordinary-prose spelling with a UK or US dictionary, a small list of high-confidence typos, repeated function words, repeated punctuation, accidental extra spaces, space before punctuation, missing space after punctuation, unmatched brackets or quotes, unfinished placeholders, missing, ambiguous and cross-scope internal references, duplicate clause numbers, duplicate or inconsistent definitions, defined-term capitalisation, party-name consistency, invalid dates and bound words-and-figures mismatches. It does not check grammar or meaning.";
export const PROOF_LOCAL_CHOOSE = "Choose a Word document";
export const PROOF_LOCAL_DEVICE = "Processing happens on this device.";
export const PROOF_LOCAL_NO_ACCOUNT =
  "No account required. Your document is processed on this device and isn’t sent to Agmt.";
export const PROOF_LOCAL_TOO_LARGE = `This file exceeds the ${PROOF_LOCAL_SIZE_LABEL} size limit.`;

export function proofLocalTooLargeMessage(label = publishedProofCapacityPolicy().label): string {
  return `This file exceeds the ${label} size limit.`;
}

export const PROOF_LOCAL_LIMITS_NOTE =
  "A file under the size limit can still be refused if its Word XML, ZIP expansion or extracted text is too complex. Proof does not check every document below the size limit, and it is not unlimited.";
export const PROOF_LOCAL_WRONG_FILE = "Choose a Word (.docx) file containing document text.";
export const PROOF_LOCAL_MULTIPLE = "Choose one document at a time.";
export const PROOF_LOCAL_SIGNED_OUT = "Sign in is optional. Local Proof does not require an account.";
export const PROOF_LOCAL_CANCELLED = "Checking was cancelled. You can choose the file again.";
export const PROOF_LOCAL_SESSION_LOST = "This run is no longer available. Choose the file again to restart.";
