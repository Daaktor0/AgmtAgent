/** Agmt-owned selection contracts. Not Vaquill types. */

export type Story =
  | "body"
  | "header"
  | "footer"
  | "footnote"
  | "endnote"
  | "other";

export interface TablePath {
  tableIndex: number;
  row?: number;
  column?: number;
}

export interface SelectionEnvelope {
  readonly selectionId: string;
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly story: Story;
  readonly selectedText: string;
  readonly selectedTextHash: string;
  readonly structuralContext: {
    paragraphIds?: string[];
    paragraphIndexes?: number[];
    tablePath?: TablePath;
    headingPath?: string[];
  };
  readonly surroundingContext: {
    prefix?: string;
    suffix?: string;
    prefixHash?: string;
    suffixHash?: string;
  };
  readonly capturedAt: string;
}

export interface SelectionAnchor {
  story_type: "main" | "header" | "footer" | "footnote" | "endnote" | "other";
  selected_text: string;
  selected_text_sha256: string;
  ooxml_sha256?: string | null;
  block_ids: string[];
  unique_local_ids: string[];
  first_block_idx: number | null;
  last_block_idx: number | null;
  prefix_text: string;
  suffix_text: string;
  structural_path: string[];
  captured_at: string;
  source_word_api: string;
}
