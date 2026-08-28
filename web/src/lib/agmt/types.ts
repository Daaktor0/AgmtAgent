export const INSTRUMENTS = [
  "sha",
  "ssa",
  "spa",
  "disclosure_letter",
  "unsupported",
  "unknown",
] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const REPRESENTED_PARTIES = [
  "company",
  "promoter",
  "investor",
  "seller",
  "purchaser",
  "other",
] as const;
export type RepresentedParty = (typeof REPRESENTED_PARTIES)[number];

export const STAGES = ["drafting", "negotiation", "signing", "closing"] as const;
export type Stage = (typeof STAGES)[number];

export const DOCUMENT_ROLES = ["primary", "companion", "disclosure", "ancillary"] as const;
export type DocumentRole = (typeof DOCUMENT_ROLES)[number];

export const NODE_TYPES = [
  "document",
  "part",
  "recital",
  "clause",
  "subclause",
  "schedule",
  "annex",
  "definition_entry",
  "signature_block",
  "unclassified",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SOURCE_QUALITIES = ["high", "medium", "low", "unreadable"] as const;
export type SourceQuality = (typeof SOURCE_QUALITIES)[number];

export const INGEST_STATUSES = [
  "uploaded",
  "map_pending",
  "indexed",
  "refused",
  "failed",
] as const;
export type IngestStatus = (typeof INGEST_STATUSES)[number];

export const PROOF_STATUSES = [
  "running",
  "complete",
  "partial",
  "refused",
  "failed",
] as const;
export type ProofStatus = (typeof PROOF_STATUSES)[number];

export const USER_DECISIONS = ["accept", "correct", "not_identifier"] as const;
export type UserDecision = (typeof USER_DECISIONS)[number];

export type ExtractedBlock = {
  index: number;
  text: string;
  xmlAnchor: { kind: "paragraph" | "cell" | "header" | "footer"; path: string };
  styleId: string | null;
  numbering: string | null;
  isTable: boolean;
  isHeaderFooter: boolean;
  pageBreakBefore: boolean;
  sourceStart: number;
  sourceEnd: number;
};

export type CapabilityState =
  | "evaluated_present"
  | "evaluated_absent"
  | "unavailable"
  | "unsupported";

export type SourceCapability = {
  name: string;
  /**
   * Legacy field retained while the extractor migrates. `false` does not by
   * itself mean unavailable: a parser can successfully prove a feature absent.
   */
  available: boolean;
  state?: CapabilityState;
  detectorVersion: string;
  suppressionReason: string | null;
};

export type ExtractedDocument = {
  mimeType: string;
  wordCount: number;
  nonWhitespaceChars: number;
  explicitPageBreaks: number;
  appPages: number | null;
  pageCount: number;
  pageCountMethod: "docx_property" | "estimated" | "pdf_pages";
  blocks: ExtractedBlock[];
  comments: { id: string; author: string; text: string }[];
  fields: { instr: string; result: string; unresolved: boolean }[];
  revisions: { type: "ins" | "del"; text: string }[];
  headersFooters: string[];
  hiddenChars: { blockIndex: number; start: number; end: number; kind: string }[];
  capabilities: SourceCapability[];
  sourceQualityHint: "ok" | "encrypted" | "corrupt" | "macro";
};

export type Provision = {
  provisionId: string;
  parentProvisionId: string | null;
  orderIndex: number;
  nodeType: NodeType;
  ownsText: boolean;
  number: string | null;
  heading: string | null;
  scopeType: string;
  scopeId: string;
  canonicalText: string;
  canonicalLength: number;
  sourceXmlAnchor: ExtractedBlock["xmlAnchor"];
  sourceStart: number;
  sourceEnd: number;
  structuralPath: unknown[];
  classificationConfidence: number;
  lineStart: number;
  lineEnd: number;
  blockIndex: number | null;
};

export type Definition = {
  definitionId: string;
  term: string;
  normalisedTerm: string;
  definitionKind: string;
  scopeType: string;
  scopeId: string;
  definingProvisionId: string;
  start: number;
  end: number;
  legalName: string | null;
};

export type DefinitionUse = {
  definitionUseId: string;
  definitionId: string;
  provisionId: string;
  start: number;
  end: number;
};

export type CanonicalEntryKind = "legal_name" | "identifier";

export type ProposedEntry = {
  entryId: string;
  kind: CanonicalEntryKind;
  identifierType: string | null;
  sourceProvisionId: string;
  sourceStart: number;
  sourceEnd: number;
  originalValue: string;
  replacement: string;
  definedTermId: string | null;
  detector: string;
  confidence: number;
  userDecision: UserDecision;
};

export type SpanSegment = {
  segmentId: string;
  provisionId: string;
  canonicalStart: number;
  canonicalEnd: number;
  sourceStart: number;
  sourceEnd: number;
  replacementEntryId: string | null;
};

export type DealMapEntry = {
  category: string;
  label: string;
  value: string | null;
  provisionId: string | null;
  start: number | null;
  end: number | null;
  extractionMethod: "deterministic";
  confidence: number;
  uncertaintyCode: string | null;
};

export type ProofHitDraft = {
  checkId: string;
  checkVersion: number;
  severity: Severity;
  certainty: "exact" | "heuristic";
  provisionId: string;
  quoteStart: number;
  quoteEnd: number;
  detailCode: string;
  detailArgs: Record<string, string | number | null>;
};

export type ProofSuppression = {
  checkId: string;
  checkVersion: number;
  missingCapabilities: string[];
  code: string;
};

export type IndexQuality = {
  structureConfidence: number;
  sourceQuality: SourceQuality;
  classifiedShare: number;
  materialUnclassified: boolean;
  usableOutline: boolean;
  unclassifiedChars: number;
  unclassifiedLeafCount: number;
  indexQualityVersion: string;
  components: Record<string, number>;
};

export type SignatureInventory = {
  namedParties: string[];
  blocks: { label: string; provisionId: string; capacity: string | null }[];
};
