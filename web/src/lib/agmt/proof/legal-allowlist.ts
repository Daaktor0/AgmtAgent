/** First-party legal tokens, not a client or matter vocabulary. Never persisted. */
export const LEGAL_ALLOWLIST_VERSION = "proof-legal-allowlist-v1";

export const LEGAL_ALLOWLIST: ReadonlySet<string> = Object.freeze(new Set([
  "hereof", "thereof", "whereof", "hereunder", "thereunder", "herein", "therein",
  "hereto", "thereto", "herewith", "therewith", "hereby", "thereby", "whereunder",
  "indemnitee", "indemnitor", "indemnitees", "indemnitors",
  "sublicence", "sublicense", "sublicences", "sublicenses",
  "subclause", "subclauses", "majeure", "alia", "mutatis", "mutandis", "facie", "fide",
  "passu", "initio", "facto", "jure", "vis", "cestui", "que", "trust",
  "chose", "action", "mesne", "cy", "pres", "bona", "vacantia",
]));
