"""Compiled regex patterns for deterministic document analysis."""
from __future__ import annotations

import re

RE_DECIMAL = re.compile(r"^\s*(\d+(?:\.\d+){0,5})\.?(?:\s+(?=\S)|\s*$)")
RE_HEADING = re.compile(
    r"^\s*(ARTICLE|CLAUSE|SECTION|SCHEDULE|ANNEXURE|ANNEX|EXHIBIT|APPENDIX|PART)\s+"
    r"([0-9]+(?:\.[0-9]+)*|[IVXLCDM]+|[A-Z])\b[\s:.\-]*(.*)$",
    re.IGNORECASE,
)
RE_LIMB = re.compile(r"^\s*\(([a-zA-Z]{1,4}|[ivxlcdm]{1,6})\)\s+(?=\S)")

RE_DEF_QUOTED = re.compile(
    r"[“‘\"']\s*([A-Z][^”’\"']{0,90}?)\s*[”’\"']"
    r"\s*(?:\([^)]{0,40}\)\s*)?(means|shall mean|has the meaning|shall have the meaning|"
    r"means and includes|includes)\b"
)
RE_DEF_INLINE = re.compile(
    r"\(\s*(?:each\s+|collectively\s+|together\s+|the\s+|a\s+|an\s+)*"
    r"[“‘\"']\s*([A-Z][^”’\"']{0,90}?)\s*[”’\"'][^)]{0,30}\)"
)
RE_DEF_PLAIN = re.compile(
    r"^\s*([A-Z][A-Za-z0-9&/\- ]{1,60}?)\s+(means|shall mean|shall have the meaning)\b"
)

RE_XREF = re.compile(
    r"\b(Clause|Section|Article|Paragraph|Sub-clause|Subclause|Schedule|Annexure|"
    r"Annex|Exhibit|Appendix|Part)\s+"
    r"([0-9]+(?:\.[0-9]+)*|[IVXLCDM]{1,6}|[A-Z])(?![A-Za-z])"
)

RE_PLACEHOLDER = re.compile(
    r"(\[\s*[●•*–—_.\s]{0,20}\]|\[insert[^\]]{0,60}\]|"
    r"\[\s*(?:date|amount|name|number|tbd|tbc|•)[^\]]{0,40}\]|"
    r"\bT\.?B\.?[DC]\b|\bXXX+\b|<<[^>]{0,60}>>)",
    re.IGNORECASE,
)

RE_AMOUNT_WORDS = re.compile(
    r"(?:(?:INR|Rs\.?|USD|US\$|\$|₹|EUR|€|GBP|£)\s*)?"
    r"([0-9][0-9,]{2,})\s*"
    r"\(\s*(?:Rupees|Dollars?|Indian Rupees|US Dollars?|Euros?|Pounds?)?\s*"
    r"([A-Za-z][A-Za-z \-]{4,120}?)\s*(?:only)?\s*\)",
    re.IGNORECASE,
)

NUM_WORDS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "thirty": 30, "forty": 40, "fourty": 40, "fifty": 50, "sixty": 60,
    "seventy": 70, "eighty": 80, "ninety": 90,
}
NUM_SCALES = {
    "hundred": 100, "thousand": 1_000, "lakh": 100_000, "lac": 100_000,
    "lakhs": 100_000, "lacs": 100_000, "million": 1_000_000,
    "crore": 10_000_000, "crores": 10_000_000, "billion": 1_000_000_000,
}

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}
_MONTH_ALT = "|".join(MONTHS)
RE_DATE_DMY = re.compile(
    rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH_ALT})\s+(\d{{4}})\b",
    re.IGNORECASE,
)
RE_DATE_MDY = re.compile(
    rf"\b({_MONTH_ALT})\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(\d{{4}})\b",
    re.IGNORECASE,
)
RE_DATE_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
RE_PERIOD = re.compile(
    r"\b(\d+)\s+(?:calendar\s+)?(days?|months?|years?)\b",
    re.IGNORECASE,
)
RE_MONEY = re.compile(
    r"(?:INR|Rs\.?|USD|US\$|₹|EUR|€|GBP|£)\s*([0-9][0-9,]*)",
    re.IGNORECASE,
)
RE_MONEY_SCALE = re.compile(
    r"\b(\d+(?:\.\d+)?)\s*(crore|lakh|lac|million)\b",
    re.IGNORECASE,
)
RE_CURRENCY = re.compile(
    r"\bINR\b|₹|\bRs\.?|\bUSD\b|\bUS\$|\bEUR\b|€|\bGBP\b|£",
    re.IGNORECASE,
)
RE_CONVERSION = re.compile(
    r"\b(equivalent|exchange rate|converted|conversion|prevailing rate|spot rate)\b",
    re.IGNORECASE,
)
RE_SIG_START = re.compile(
    r"\b(IN WITNESS WHEREOF|IN WITNESS|SIGNED by|SIGNED for|"
    r"For and on behalf|EXECUTED as a deed|Authorised Signatory)\b",
    re.IGNORECASE,
)
PARTY_LABELS = {
    "Company", "Investor", "Promoters", "Promoter", "Purchaser", "Vendor",
    "Buyer", "Seller",
}
TOPIC_RX = {
    "borrow": re.compile(r"\b(borrow|borrowing|indebtedness|indebted|debt)\b", re.I),
    "spend": re.compile(r"\b(expenditure|expense|spend|payment)\b", re.I),
    "encumbrance": re.compile(r"\b(encumbrance|charge|pledge|lien)\b", re.I),
    "guarantee": re.compile(r"\bguarantee\b", re.I),
    "transfer": re.compile(r"\btransfer\b", re.I),
}
RE_BLANKET = re.compile(
    r"\bshall not\b.{0,100}\bany\b.{0,60}\b(whatsoever|at all)\b",
    re.IGNORECASE | re.DOTALL,
)
RE_THRESHOLD_CUE = re.compile(
    r"\bshall not\b.{0,140}\b(exceeding|in excess of|more than|greater than)\b",
    re.IGNORECASE | re.DOTALL,
)

# Words that look like defined terms because of sentence position but aren't.
CAP_STOPWORDS = {
    "The", "This", "That", "These", "Those", "If", "In", "On", "At", "For",
    "Any", "All", "No", "Not", "Each", "Every", "Such", "Where", "When",
    "Provided", "Notwithstanding", "Subject", "Save", "Upon", "As", "It",
    "There", "Accordingly", "Further", "However", "Whereas", "And", "Or",
    "Neither", "Either", "Without", "With", "Within", "During", "After",
    "Before", "Until", "Unless", "Except", "Pursuant", "Including", "A", "An",
}


# --------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------


