import { publishedProofCapacityPolicy } from "./policy.ts";

const SECURITY = new Set([
  "unsafe_docx",
  "infected",
  "active_content_not_supported",
  "external_content_not_supported",
]);

const UNSUPPORTED = new Set([
  "unsupported_docx_package",
  "unsupported_review_structure",
  "protected_document",
  "unsupported_complex_revision",
  "no_supported_text",
  "invalid_docx_zip",
  "source_too_large",
]);

export type LocalProofUserError = {
  code: string;
  heading: string;
  main: string;
};

export function localProofError(error: unknown): LocalProofUserError {
  const code = error instanceof Error ? error.message : "proof_failed";
  if (code === "source_too_large") {
    return {
      code,
      heading: `This file exceeds the ${publishedProofCapacityPolicy().label} size limit.`,
      main: "Choose a smaller Word document. A file under this size can still be refused if its Word XML or extracted text is too complex.",
    };
  }
  if (code === "output_too_large") {
    return {
      code,
      heading: "The marked document would exceed the output size limit.",
      main: "Proof could not finish a downloadable copy of this file on this device.",
    };
  }
  if (code === "package_too_complex" || code === "extracted_text_limit") {
    return {
      code,
      heading: "This document’s text or Word XML is too complex to check on this device.",
      main: "The file size is within the published limit, but Proof still bounds document.xml size and extracted text. Proof does not recommend splitting the agreement into clauses, because that can miss document-wide checks.",
    };
  }
  if (
    code === "package_expanded_too_large"
    || code === "package_entry_too_large"
    || code === "suspicious_compression_ratio"
    || code === "proof_timeout"
  ) {
    return {
      code,
      heading: "This document could not be checked within Proof’s safety limits.",
      main: "ZIP expansion, compression ratio and time limits still apply on every device. Proof does not recommend splitting the agreement into clauses, because that can miss document-wide checks.",
    };
  }
  if (code === "cancelled" || (error instanceof DOMException && error.name === "AbortError")) {
    return { code: "cancelled", heading: "Checking was cancelled.", main: "You can choose the file again." };
  }
  if (SECURITY.has(code)) {
    return { code: "unsafe_docx", heading: "This file could not pass our safety checks.", main: "Choose another file." };
  }
  if (UNSUPPORTED.has(code) || code.startsWith("unsupported")) {
    return {
      code,
      heading: "Proof can’t safely process this document yet.",
      main: code === "protected_document"
        ? "This file is protected."
        : code === "unsupported_complex_revision" || code === "unsupported_review_structure"
          ? "This file contains unsupported tracked changes."
          : "Choose another Word document.",
    };
  }
  return {
    code: "proof_failed",
    heading: "We couldn’t finish checking this document.",
    main: "Choose the file again to retry. The document did not leave this device.",
  };
}
