/**
 * The signing: one or more final documents, the parties who sign them, and
 * the files that come back. Plain data only, so it can be saved on the
 * device and every change is a small pure function (see signing.ts). File
 * bytes are stored separately, by id.
 */
import type { EStamp } from "./estamp.ts";
import type { NameSlot } from "./generate.ts";
import type { CopyType } from "./names.ts";

export type { CopyType };
export type Rotation = 0 | 90 | 180 | 270;
export type ReturnRole = "signed" | "stamp";

export type Party = { id: string; name: string };

export type PageInfo = {
  /** Text as read from the PDF, lines joined with "\n". */
  text: string;
  likelySignature: boolean;
  suggestedParties: string[];
};

/**
 * Signature pages Agmt made for an agreement that has none of its own: one
 * page per party, stored as a PDF of their own and counted after the
 * agreement's last page (page index pageCount + i), so each executed copy
 * carries the signed pages at the end, after the schedules.
 */
export type MadePages = {
  from: "parties" | "template";
  fileId: string;
  pages: PageInfo[];
  /** The setup they were made from, to tell when it has changed since. */
  key: string;
};

/** The lawyer's choices for making signature pages, kept so they can be changed and made again. */
export type MakeParty = {
  id: string;
  name: string;
  /** The plain format used when pages are made from the parties. */
  formatId: string;
  /** The template used when pages are made from the lawyer's template; null means the first. */
  templateId: string | null;
  /** Where the name came from when it was read from a schedule: "Investors · Part A of Schedule 1". */
  group: string | null;
};
export type MakeFormat = { id: string; label: string; body: string };
export type MakeTemplate = {
  id: string;
  label: string;
  fileId: string;
  fileName: string;
  pageIndex: number;
  sample: string;
  slots: NameSlot[];
  text: string;
  /** The last pages made from it still showed the sample name in their text (it could only be painted over). */
  residue?: boolean;
};
export type MakeSetup = {
  from: "parties" | "template";
  parties: MakeParty[];
  formats: MakeFormat[];
  templates: MakeTemplate[];
  footer: string;
  useFooter: boolean;
};

export type SigningDocument = {
  id: string;
  /** Stored bytes of the final PDF. */
  fileId: string;
  fileName: string;
  title: string;
  pageCount: number;
  pages: PageInfo[];
  /** Page index -> ids of the parties who sign on it. */
  sigPages: Record<number, string[]>;
  /** Party id -> the executed copy that party receives. */
  copies: Record<string, CopyType>;
  /** Party id -> a file name the user typed over the suggestion. */
  copyNames: Record<string, string>;
  /** Signature pages Agmt made, when the agreement has none of its own. */
  made?: MadePages | null;
  /** How they were (or will be) made. */
  setup?: MakeSetup | null;
};

export type Placement =
  | { status: "unplaced" }
  | { status: "placed"; role: "signed"; docId: string; partyIds: string[] }
  | { status: "placed"; role: "stamp"; docId: string; partyId: string };

export type Confidence = "high" | "medium" | "low";

export type Suggestion = {
  role: ReturnRole | null;
  docId: string | null;
  partyIds: string[];
  /** For a countersigned page: the page of the final it matches best. */
  pageIndex: number | null;
  confidence: Confidence;
  /** One short sentence shown to the user: why this guess. */
  reason: string;
};

export type ReturnFile = {
  /** Also the id of its stored bytes. */
  id: string;
  fileName: string;
  hash: string;
  kind: "pdf" | "image";
  /** Pixel size of an image return, needed to place it on a page. */
  image?: { width: number; height: number };
  pageCount: number;
  rotation: Rotation;
  addedAt: number;
  /** Text of the first pages: PDF text layer, else OCR. */
  text: string | null;
  textSource: "pdf" | "ocr" | "none" | "pending";
  estamp: EStamp | null;
  suggestion: Suggestion | null;
  placement: Placement;
  /** Placed automatically and not yet looked at by the user. */
  autoPlaced: boolean;
};

export type Signing = {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  parties: Party[];
  documents: SigningDocument[];
  returns: ReturnFile[];
};

let counter = 0;
export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}${(counter++).toString(36)}`;
}
