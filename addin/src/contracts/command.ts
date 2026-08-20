import type { SelectionAnchor } from "./selection";

export interface ContextualCommand {
  commandId: string;
  matterId: string;
  documentId: string;
  documentVersionId: string;
  selectionId?: string;
  modality: "typed";
  rawInstruction: string;
  intent?: {
    action: "analyse" | "explain" | "find" | "compare" | "draft";
    targetConcepts?: string[];
    concerns?: string[];
  };
  resolvedReferences?: unknown[];
  status:
    | "captured"
    | "needs_clarification"
    | "resolved"
    | "running"
    | "ready"
    | "failed";
  selection?: SelectionAnchor;
}
