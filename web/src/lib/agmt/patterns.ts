export const RE_DECIMAL =
  /^\s*(\d+(?:\.\d+){0,5})\.?(?:\s+(?=\S)|\s*$)/;
export const RE_HEADING =
  /^\s*(ARTICLE|CLAUSE|SECTION|SCHEDULE|ANNEXURE|ANNEX|EXHIBIT|APPENDIX|PART)\s+([0-9]+(?:\.[0-9]+)*|[IVXLCDM]+|[A-Z])\b[\s:.\-]*(.*)$/i;
export const RE_LIMB = /^\s*\(([a-zA-Z]{1,4}|[ivxlcdm]{1,6})\)\s+(?=\S)/;

export const RE_DEF_QUOTED =
  /[“‘"']\s*([A-Z][^”’"']{0,90}?)\s*[”’"']\s*(?:\([^)]{0,40}\)\s*)?(means|shall mean|has the meaning|shall have the meaning|means and includes|includes)\b/;
export const RE_DEF_INLINE =
  /\(\s*(?:each\s+|collectively\s+|together\s+|the\s+|a\s+|an\s+)*[“‘"']\s*([A-Z][^”’"']{0,90}?)\s*[”’"'][^)]{0,30}\)/;
export const RE_DEF_PLAIN =
  /^\s*([A-Z][A-Za-z0-9&/\- ]{1,60}?)\s+(means|shall mean|shall have the meaning)\b/;

export const RE_XREF =
  /\b(Clause|Section|Article|Paragraph|Sub-clause|Subclause|Schedule|Annexure|Annex|Exhibit|Appendix|Part)\s+([0-9]+(?:\.[0-9]+)*|[IVXLCDM]{1,6}|[A-Z])(?![A-Za-z])/g;

export const RE_PLACEHOLDER =
  /(\[\s*[●•*–—_.\s]{0,20}\]|\[insert[^\]]{0,60}\]|\[\s*(?:date|amount|name|number|tbd|tbc|•)[^\]]{0,40}\]|\bT\.?B\.?[DC]\b|\bXXX+\b|<<[^>]{0,60}>>)/gi;

export const RE_SIG_START =
  /\b(IN WITNESS WHEREOF|IN WITNESS|SIGNED by|SIGNED for|For and on behalf|EXECUTED as a deed|Authorised Signatory)\b/i;

export const CAP_STOPWORDS = new Set([
  "The", "This", "That", "These", "Those", "If", "In", "On", "At", "For",
  "Any", "All", "No", "Not", "Each", "Every", "Such", "Where", "When",
  "Provided", "Notwithstanding", "Subject", "Save", "Upon", "As", "It",
  "There", "Accordingly", "Further", "However", "Whereas", "And", "Or",
  "Neither", "Either", "Without", "With", "Within", "During", "After",
  "Before", "Until", "Unless", "Except", "Pursuant", "Including", "A", "An",
  "India", "Indian", "Act", "Board", "Agreement", "Parties", "Party",
]);

export const LEGAL_STOPWORDS = new Set(
  [
    ...CAP_STOPWORDS,
    "Company", "Shareholder", "Director", "Clause", "Section", "Schedule",
    "Annexure", "Article", "Part", "Chapter",
  ].map((s) => s.toLowerCase()),
);

export const PARTY_LABELS = [
  "Company",
  "Investor",
  "Promoters",
  "Promoter",
  "Purchaser",
  "Vendor",
  "Buyer",
  "Seller",
  "Founder",
  "Shareholder",
];
