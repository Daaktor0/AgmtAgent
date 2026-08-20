export interface StoryText {
  story: "body" | "header" | "footer" | "footnote" | "endnote";
  paragraphs: string[];
  uniqueLocalIds: string[];
  listPrefixes: string[];
}

export interface DocumentSnapshot {
  documentId: string;
  documentVersionId: string;
  versionHash: string;
  stories: StoryText[];
  comments?: unknown[];
  revisions?: unknown[];
  tables?: unknown[];
  capturedAt: string;
}
