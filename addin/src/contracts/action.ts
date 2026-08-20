export type WordOperation =
  | "replace"
  | "insert_before"
  | "insert_after"
  | "delete"
  | "comment";

export interface ProposedAction {
  actionId: string;
  documentVersionId: string;
  anchorId: string;
  operation: WordOperation;
  expectedOldText?: string;
  expectedOldTextHash?: string;
  proposedText?: string;
  comment?: string;
  evidenceIds: string[];
  approvedAt?: string;
}

export interface ActionTicket {
  ticketId: string;
  actionId: string;
  documentVersionId: string;
  expectedDocHash: string;
  expectedOldText: string;
  expectedOldTextHash: string;
  proposedText: string;
  operation: WordOperation;
  expiresAt: string;
  consumed: boolean;
}

export type ApplyResultStatus = "confirmed" | "refused" | "failed_unknown";
