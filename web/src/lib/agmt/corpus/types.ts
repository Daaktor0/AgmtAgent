import type { BuildDocxOpts } from "../docx.ts";

export type LabelKind = "must_find" | "trap" | "not_a_defect";

export type ProofLabel = {
  kind: LabelKind;
  checkId: string;
  /** Substring of quote, detailCode or detailArgs that pins the locus. */
  needle?: string;
  note?: string;
};

export type CorpusFixture = {
  id: string;
  title: string;
  paragraphs: string[];
  docx?: BuildDocxOpts;
  labels: ProofLabel[];
};

export type CorpusVerdict = {
  fixtureId: string;
  missedMustFind: ProofLabel[];
  trapFires: { label: ProofLabel; quote: string }[];
  notADefectFires: { label: ProofLabel; quote: string }[];
  suppressions: { checkId: string; missing: string[] }[];
  hitCounts: Record<string, number>;
  ok: boolean;
};
