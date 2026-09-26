/**
 * The signing: one or more final documents, the parties who sign them, and
 * the files that come back. Plain data only, so it can be saved on the
 * device and every change is a small pure function (see signing.ts). File
 * bytes are stored separately, by id.
 */
import type { EStamp } from "./estamp.ts";
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
