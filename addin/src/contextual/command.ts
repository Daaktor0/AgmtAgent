/** Client helper: same backend path for typed (and later voice) commands. */
import type { SelectionEnvelope } from "../contracts/selection";

export interface CommandRequest {
  rawText: string;
  selection: SelectionEnvelope | null;
  paragraphs: string[];
  documentId: string;
  documentVersionId: string;
  capturedDocHash: string;
  liveDocumentHash: string;
  chosenRefIds?: string[];
  matterId?: string;
}

export function envelopeToAnchor(env: SelectionEnvelope) {
  const indexes = env.structuralContext.paragraphIndexes || [];
  return {
    story_type: env.story === "body" ? "main" : env.story,
    selected_text: env.selectedText,
    selected_text_sha256: env.selectedTextHash,
    block_ids: env.structuralContext.paragraphIds || [],
    unique_local_ids: env.structuralContext.paragraphIds || [],
    first_block_idx: indexes.length ? indexes[0] : null,
    last_block_idx: indexes.length ? indexes[indexes.length - 1] : null,
    prefix_text: env.surroundingContext.prefix || "",
    suffix_text: env.surroundingContext.suffix || "",
    structural_path: env.structuralContext.headingPath || [],
    captured_at: env.capturedAt,
    source_word_api: "Document.getSelection",
  };
}
