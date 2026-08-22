"""Structure segmentation and definition extraction (plan commit 9).

Extracted verbatim from the Document methods; the methods now delegate here.
Byte-for-byte behavior is preserved and asserted by the corpus eval.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

from .model import Clause, Definition

if TYPE_CHECKING:
    from .model import Document

from .patterns import (
    RE_DECIMAL, RE_HEADING, RE_LIMB, RE_DEF_QUOTED, RE_DEF_INLINE,
    RE_DEF_PLAIN, RE_XREF,
)


def segment_structure(doc: "Document") -> None:
    current: Clause | None = None
    for i, text in enumerate(doc._structure_paras):
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
            doc.clauses.append(new)
            current = new
        elif current:
            current.end = i

    if current:
        current.end = len(doc.paras) - 1
    if not doc.clauses:
        doc.clauses = [Clause("", "body", "", 0, max(0, len(doc.paras) - 1), 0)]

def clause_at(self, para: int) -> Clause | None:
    for c in doc.clauses:
        if c.start <= para <= c.end:
            return c
    return None

def find_clause(self, ref: str) -> Clause | None:
    ref = ref.strip().rstrip(".")
    low = ref.lower()
    for c in doc.clauses:
        if c.number.lower() == low:
            return c
    for c in doc.clauses:
        if c.number.lower().replace("clause ", "").replace("section ", "") == low:
            return c
    return None

def clause_numbers(self) -> set[str]:
    return {c.number.lower() for c in doc.clauses if c.number}

# ---------------- definitions ----------------



def extract_definitions(doc: "Document") -> None:
    for i, text in enumerate(doc.paras):
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
            if term in doc.definitions:
                continue
            doc.definitions[term] = Definition(term=term, para=i, text=text.strip())

