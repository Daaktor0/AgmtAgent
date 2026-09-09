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
    return { code, heading: "This file exceeds the 1 MiB limit.", main: "Choose a smaller Word document." };
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
