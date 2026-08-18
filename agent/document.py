"""Deterministic document analysis.

Everything in here is exact. No model is involved, so nothing in here can be
hallucinated. The supervisor uses these as ground truth and spends model tokens
only on judgement.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable

# --------------------------------------------------------------------------
# Patterns
# --------------------------------------------------------------------------

RE_DECIMAL = re.compile(r"^\s*(\d+(?:\.\d+){0,5})\.?\s+(?=\S)")
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


@dataclass
class Clause:
    number: str          # "5.2.1" or "SCHEDULE 2" or "" for unnumbered
    kind: str            # clause | schedule | article | part | recital | body
    heading: str
    start: int           # paragraph index, inclusive
    end: int             # paragraph index, inclusive
    depth: int

    @property
    def ref(self) -> str:
        return self.number or f"p{self.start}"


@dataclass
class Definition:
    term: str
    para: int
    text: str
    usages: list[int] = field(default_factory=list)


@dataclass
class Issue:
    check: str
    severity: str        # high | medium | low
    para: int
    ref: str
    detail: str
    excerpt: str = ""


class Document:
    def __init__(self, paragraphs: Iterable[str], prefixes: Iterable[str] | None = None):
        self.paras: list[str] = [p.rstrip() for p in paragraphs]
        prefix_list = [p.strip() for p in prefixes] if prefixes is not None else []
        self._structure_paras: list[str] = []
        for i, para in enumerate(self.paras):
            prefix = prefix_list[i] if i < len(prefix_list) else ""
            if prefix and not para.lstrip().startswith(prefix):
                self._structure_paras.append(f"{prefix} {para}")
            else:
                self._structure_paras.append(para)
        self.clauses: list[Clause] = []
        self.definitions: dict[str, Definition] = {}
        self.xrefs: list[tuple[int, str, str]] = []  # (para, kind, target)
        self._segment()
        self._extract_definitions()
        self._extract_xrefs()
        self._index_usages()

    # ---------------- structure ----------------

    def _segment(self) -> None:
        current: Clause | None = None
        for i, text in enumerate(self._structure_paras):
            if not text.strip():
                continue
            new: Clause | None = None

            m = RE_HEADING.match(text)
            if m:
                word = m.group(1).upper()
                kind = {
                    "SCHEDULE": "schedule", "ANNEXURE": "schedule",
                    "ANNEX": "schedule", "EXHIBIT": "schedule",
                    "APPENDIX": "schedule", "PART": "part",
                    "ARTICLE": "article", "SECTION": "clause",
                    "CLAUSE": "clause",
                }[word]
                new = Clause(
                    number=f"{word.title()} {m.group(2).upper()}",
                    kind=kind, heading=m.group(3).strip(), start=i, end=i, depth=0,
                )
            else:
                m = RE_DECIMAL.match(text)
                if m:
                    num = m.group(1)
                    rest = text[m.end():].strip()
                    new = Clause(
                        number=num, kind="clause",
                        heading=rest[:120] if len(rest) < 120 else "",
                        start=i, end=i, depth=num.count(".") + 1,
                    )

            if new:
                if current:
                    current.end = i - 1
                self.clauses.append(new)
                current = new
            elif current:
                current.end = i

        if current:
            current.end = len(self.paras) - 1
        if not self.clauses:
            self.clauses = [Clause("", "body", "", 0, max(0, len(self.paras) - 1), 0)]

    def clause_at(self, para: int) -> Clause | None:
        for c in self.clauses:
            if c.start <= para <= c.end:
                return c
        return None

    def find_clause(self, ref: str) -> Clause | None:
        ref = ref.strip().rstrip(".")
        low = ref.lower()
        for c in self.clauses:
            if c.number.lower() == low:
                return c
        for c in self.clauses:
            if c.number.lower().replace("clause ", "").replace("section ", "") == low:
                return c
        return None

    def clause_numbers(self) -> set[str]:
        return {c.number.lower() for c in self.clauses if c.number}

    # ---------------- definitions ----------------

    def _extract_definitions(self) -> None:
        for i, text in enumerate(self.paras):
            found: list[str] = []
            for rx in (RE_DEF_QUOTED, RE_DEF_INLINE):
                found += [m.group(1).strip() for m in rx.finditer(text)]
            m = RE_DEF_PLAIN.match(text)
            if m:
                found.append(m.group(1).strip())
            for term in found:
                term = re.sub(r"\s+", " ", term).strip(" ,;:")
                if not term or len(term) > 90 or term.lower() in {"a", "an", "the"}:
                    continue
                if term in self.definitions:
                    continue
                self.definitions[term] = Definition(term=term, para=i, text=text.strip())

    def _index_usages(self) -> None:
        for term, d in self.definitions.items():
            rx = re.compile(r"\b" + re.escape(term) + r"\b")
            for i, text in enumerate(self.paras):
                if i == d.para:
                    continue
                if rx.search(text):
                    d.usages.append(i)

    # ---------------- cross-references ----------------

    def _extract_xrefs(self) -> None:
        for i, text in enumerate(self.paras):
            for m in RE_XREF.finditer(text):
                self.xrefs.append((i, m.group(1).lower(), m.group(2)))

    # ---------------- mechanical checks ----------------

    def mechanical_checks(self) -> list[Issue]:
        out: list[Issue] = []
        out += self._check_xrefs()
        out += self._check_definitions()
        out += self._check_placeholders()
        out += self._check_numbering()
        out += self._check_amounts()
        out += self._check_case_drift()
        order = {"high": 0, "medium": 1, "low": 2}
        out.sort(key=lambda x: (order[x.severity], x.para))
        return out

    def _check_xrefs(self) -> list[Issue]:
        nums = self.clause_numbers()
        bare = {n for n in nums}
        for c in self.clauses:
            if c.number:
                bare.add(c.number.lower().split(" ")[-1])
        out = []
        for para, kind, target in self.xrefs:
            t = target.lower()
            if kind in {"schedule", "annexure", "annex", "exhibit", "appendix"}:
                candidates = {f"{kind} {t}", f"schedule {t}", f"annexure {t}", t}
            elif kind == "part":
                candidates = {f"part {t}", t}
            else:
                candidates = {t, f"clause {t}", f"section {t}", f"article {t}"}
            if not (candidates & nums) and t not in bare:
                c = self.clause_at(para)
                out.append(Issue(
                    check="broken_cross_reference", severity="high", para=para,
                    ref=c.ref if c else f"p{para}",
                    detail=f"Reference to {kind.title()} {target} — no such {kind} found in this document.",
                    excerpt=self._excerpt(para, f"{kind}"),
                ))
        # collapse repeats
        seen, uniq = set(), []
        for i in out:
            k = (i.detail,)
            if k in seen:
                continue
            seen.add(k)
            uniq.append(i)
        return uniq

    def _check_definitions(self) -> list[Issue]:
        out = []
        counts: dict[str, list[int]] = defaultdict(list)
        for i, text in enumerate(self.paras):
            for rx in (RE_DEF_QUOTED, RE_DEF_PLAIN):
                for m in rx.finditer(text):
                    counts[re.sub(r"\s+", " ", m.group(1).strip())].append(i)
        for term, paras in counts.items():
            if len(paras) > 1:
                out.append(Issue(
                    check="duplicate_definition", severity="high", para=paras[0],
                    ref=(self.clause_at(paras[0]).ref if self.clause_at(paras[0]) else ""),
                    detail=f'"{term}" appears to be defined more than once '
                           f"(paragraphs {', '.join(str(p) for p in paras)}).",
                ))
        for term, d in self.definitions.items():
            if not d.usages:
                out.append(Issue(
                    check="defined_but_unused", severity="low", para=d.para,
                    ref=(self.clause_at(d.para).ref if self.clause_at(d.para) else ""),
                    detail=f'"{term}" is defined but never used in an operative provision.',
                ))
        out += self._check_undefined_candidates()
        return out

    def _check_undefined_candidates(self) -> list[Issue]:
        """Title Case phrases used like defined terms, for which no definition exists.

        Multi-word phrases (allowing lower-case connectors, so 'Event of Default'
        is caught) need three uses; single words need five, because they are
        noisier.
        """
        defined = set(self.definitions)
        cand: dict[str, list[int]] = defaultdict(list)
        # Connectors are limited to the three that genuinely appear inside
        # defined terms ("Event of Default", "Loss and Expense"). Anything
        # wider swallows ordinary prose.
        rx = re.compile(
            r"(?<![.!?]\s)(?<!^)\b("
            r"[A-Z][a-z]{2,}(?:\s(?:of|and|or)\s|\s)"
            r"(?:[A-Z][a-z]{2,}(?:\s(?:of|and|or)\s|\s)){0,2}"
            r"[A-Z][a-z]{2,}"
            r")\b"
        )
        rx_single = re.compile(r"(?<![.!?]\s)(?<!^)\b([A-Z][a-z]{3,})\b")
        structural = {"clause", "clauses", "schedule", "schedules", "part",
                      "annexure", "annex", "exhibit", "appendix", "section",
                      "agreement", "rupees", "dollars"}
        for i, text in enumerate(self.paras):
            for m in rx.finditer(text):
                term = re.sub(r"\s+", " ", m.group(1).strip())
                words = term.split()
                if words[0] in CAP_STOPWORDS:
                    words = words[1:]
                    term = " ".join(words)
                if len(words) < 2:
                    continue
                if any(w.lower() in structural for w in words):
                    continue
                if words[-1] in CAP_STOPWORDS:
                    continue
                cand[term].append(i)
            for m in rx_single.finditer(text):
                term = m.group(1)
                if term in CAP_STOPWORDS or term.lower() in structural:
                    continue
                cand.setdefault(term, []).append(i)

        multi = [t for t in cand if " " in t]
        out = []
        for term, paras in cand.items():
            threshold = 2 if " " in term else 5
            if len(paras) < threshold:
                continue
            if term in defined or any(term in d or d in term for d in defined):
                continue
            # A single word only ever seen inside a longer candidate is not a
            # separate term.
            if " " not in term and any(term in m for m in multi):
                continue
            out.append(Issue(
                check="possibly_undefined_term", severity="low", para=paras[0],
                ref=(self.clause_at(paras[0]).ref if self.clause_at(paras[0]) else ""),
                detail=f'"{term}" is used {len(paras)} times in capitalised form '
                       f"but no definition was found. Confirm whether it is intended "
                       f"as a defined term.",
            ))
        out.sort(key=lambda i: i.para)
        return out[:25]

    def _check_placeholders(self) -> list[Issue]:
        out = []
        for i, text in enumerate(self.paras):
            for m in RE_PLACEHOLDER.finditer(text):
                c = self.clause_at(i)
                out.append(Issue(
                    check="unfilled_placeholder", severity="high", para=i,
                    ref=c.ref if c else f"p{i}",
                    detail=f"Unfilled placeholder {m.group(1)!r}.",
                    excerpt=self._excerpt(i, m.group(1)),
                ))
        return out

    def _check_numbering(self) -> list[Issue]:
        out = []
        seen: dict[str, int] = {}
        for c in self.clauses:
            if not c.number or c.kind != "clause":
                continue
            if c.number in seen:
                out.append(Issue(
                    check="duplicate_numbering", severity="medium", para=c.start,
                    ref=c.number,
                    detail=f"Clause number {c.number} is used more than once "
                           f"(paragraphs {seen[c.number]} and {c.start}).",
                ))
            else:
                seen[c.number] = c.start

        siblings: dict[str, list[tuple[int, Clause]]] = defaultdict(list)
        for c in self.clauses:
            if c.kind != "clause" or not re.fullmatch(r"[\d.]+", c.number):
                continue
            parts = c.number.split(".")
            siblings[".".join(parts[:-1])].append((int(parts[-1]), c))
        for parent, kids in siblings.items():
            nums = sorted({n for n, _ in kids})
            if len(nums) < 2:
                continue
            missing = [n for n in range(nums[0], nums[-1]) if n not in nums]
            if missing:
                first = kids[0][1]
                label = f"{parent}." if parent else ""
                out.append(Issue(
                    check="numbering_gap", severity="medium", para=first.start,
                    ref=first.number,
                    detail=f"Numbering gap under {label or 'top level'}: "
                           f"{', '.join(label + str(n) for n in missing)} missing.",
                ))
        return out

    def _check_amounts(self) -> list[Issue]:
        out = []
        for i, text in enumerate(self.paras):
            for m in RE_AMOUNT_WORDS.finditer(text):
                digits = int(m.group(1).replace(",", ""))
                words = words_to_number(m.group(2))
                if words is None:
                    continue
                if words != digits:
                    c = self.clause_at(i)
                    out.append(Issue(
                        check="amount_mismatch", severity="high", para=i,
                        ref=c.ref if c else f"p{i}",
                        detail=f"Figure and words disagree: {m.group(1)} vs "
                               f'"{m.group(2).strip()}" (= {words:,}).',
                        excerpt=m.group(0),
                    ))
        return out

    def _check_case_drift(self) -> list[Issue]:
        out = []
        for term, d in self.definitions.items():
            if len(term) < 5 or " " not in term:
                continue
            lower = term.lower()
            hits = []
            for i, text in enumerate(self.paras):
                if i == d.para:
                    continue
                for m in re.finditer(r"\b" + re.escape(lower) + r"\b", text):
                    if text[m.start():m.end()] != term:
                        hits.append(i)
            if hits:
                out.append(Issue(
                    check="defined_term_case_drift", severity="medium", para=hits[0],
                    ref=(self.clause_at(hits[0]).ref if self.clause_at(hits[0]) else ""),
                    detail=f'"{term}" is a defined term but appears in lower case at '
                           f"paragraph(s) {', '.join(str(h) for h in hits[:6])}. "
                           f"Lower-case use is not the defined term.",
                ))
        return out

    # ---------------- helpers ----------------

    def _excerpt(self, para: int, needle: str, width: int = 140) -> str:
        text = self.paras[para]
        pos = text.lower().find(needle.lower())
        if pos < 0:
            return text[:width]
        a = max(0, pos - width // 2)
        return ("…" if a else "") + text[a:a + width] + ("…" if a + width < len(text) else "")

    def outline(self, max_items: int = 400) -> list[dict]:
        out = []
        for c in self.clauses[:max_items]:
            out.append({
                "ref": c.ref, "kind": c.kind, "heading": c.heading[:120],
                "paras": [c.start, c.end],
                "words": sum(len(self.paras[i].split()) for i in range(c.start, c.end + 1)),
            })
        return out

    def read(self, start: int, end: int) -> str:
        end = min(end, len(self.paras) - 1)
        return "\n".join(f"[{i}] {self.paras[i]}" for i in range(max(0, start), end + 1)
                         if self.paras[i].strip())

    def search(self, pattern: str, regex: bool = False, limit: int = 40) -> list[dict]:
        try:
            rx = re.compile(pattern if regex else re.escape(pattern), re.IGNORECASE)
        except re.error as exc:
            return [{"error": f"bad pattern: {exc}"}]
        hits = []
        for i, text in enumerate(self.paras):
            if rx.search(text):
                c = self.clause_at(i)
                hits.append({
                    "para": i, "ref": c.ref if c else f"p{i}",
                    "heading": c.heading if c else "",
                    "excerpt": self._excerpt(i, pattern if not regex else text[:1]),
                })
                if len(hits) >= limit:
                    break
        return hits


def words_to_number(phrase: str) -> int | None:
    """Parse English number words including Indian lakh/crore. None if unparseable."""
    tokens = re.findall(r"[a-z]+", phrase.lower())
    tokens = [t for t in tokens if t not in {"and", "only", "rupees", "dollars",
                                             "dollar", "indian", "us", "euros", "pounds"}]
    if not tokens:
        return None
    total = 0
    current = 0
    saw_any = False
    for t in tokens:
        if t in NUM_WORDS:
            current += NUM_WORDS[t]
            saw_any = True
        elif t in NUM_SCALES:
            scale = NUM_SCALES[t]
            if scale == 100:
                current = (current or 1) * 100
            else:
                total += (current or 1) * scale
                current = 0
            saw_any = True
        else:
            return None  # unknown word — don't guess
    if not saw_any:
        return None
    return total + current
