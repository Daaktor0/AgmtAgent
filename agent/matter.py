"""Matter-scope (cross-document) checks and search."""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

from .document import Document, Issue, TOPIC_RX, parse_money

if TYPE_CHECKING:
    pass

RE_XDOC_REF = re.compile(
    r"\b(Clause|Section|Article|Schedule|Annexure|Annex|Exhibit|Appendix|Part)\s+"
    r"([0-9]+(?:\.[0-9]+)*|[IVXLCDM]{1,6}|[A-Z])\s+"
    r"of\s+(?:the\s+)?(.{2,48}?)(?=\s|$|,|;|\.)",
    re.IGNORECASE,
)


def _norm_meaning(text: str) -> str:
    m = re.search(
        r"\b(means|shall mean|shall have the meaning|has the meaning)\b",
        text, re.IGNORECASE,
    )
    body = text[m.end():] if m else text
    return re.sub(r"\s+", " ", body).strip(" .;:").lower()


def _match_companion(hint: str, companions: list[Document]) -> Document | None:
    blob = hint.lower()
    tokens = [t for t in re.findall(r"[a-z0-9]+", blob) if len(t) > 2]
    skip = {"the", "and", "agreement", "this", "that", "letter"}
    tokens = [t for t in tokens if t not in skip]
    if not tokens:
        return companions[0] if len(companions) == 1 else None
    scored: list[tuple[int, Document]] = []
    for other in companions:
        hay = " ".join([
            other.doc_id, other.role, other.filename,
            (other.paras[0] if other.paras else ""),
        ]).lower()
        score = sum(1 for t in tokens if t in hay)
        # Common abbreviations.
        if "sha" in tokens and ("shareholder" in hay or other.doc_id == "sha"):
            score += 2
        if "ssa" in tokens and ("subscription" in hay or other.doc_id == "ssa"):
            score += 2
        if "disclosure" in tokens and other.role == "disclosure_letter":
            score += 2
        if score:
            scored.append((score, other))
    if not scored:
        return companions[0] if len(companions) == 1 else None
    scored.sort(key=lambda x: -x[0])
    return scored[0][1]


def _warranty_numbers(doc: Document) -> set[str]:
    out: set[str] = set()
    warranty_parents: set[str] = set()
    for c in doc.clauses:
        blob = f"{c.heading} {doc.paras[c.start] if 0 <= c.start < len(doc.paras) else ''}"
        if re.search(r"\bwarrant(?:y|ies)\b", blob, re.IGNORECASE):
            if re.fullmatch(r"\d+", c.number):
                warranty_parents.add(c.number)
            elif c.number:
                warranty_parents.add(c.number.split(".")[0])
    if not warranty_parents:
        return out
    for c in doc.clauses:
        if not re.fullmatch(r"\d+\.\d+", c.number):
            continue
        if c.number.split(".")[0] in warranty_parents:
            out.add(c.number)
    return out


def _disclosure_numbers(doc: Document) -> set[str]:
    return {
        c.number for c in doc.clauses
        if re.fullmatch(r"\d+\.\d+", c.number)
    }


def cross_document_checks(primary: Document, companions: list[Document]) -> list[Issue]:
    if not companions:
        return []
    out: list[Issue] = []
    out += _defterm_conflicts(primary, companions)
    out += _threshold_conflicts(primary, companions)
    out += _orphan_refs(primary, companions)
    out += _disclosure_gaps(primary, companions)
    return out


def _defterm_conflicts(primary: Document, companions: list[Document]) -> list[Issue]:
    out = []
    for term, d in primary.definitions.items():
        mine = _norm_meaning(d.text)
        if not mine:
            continue
        for other in companions:
            theirs = other.definitions.get(term)
            if not theirs:
                continue
            other_meaning = _norm_meaning(theirs.text)
            if not other_meaning or other_meaning == mine:
                continue
            c = primary.clause_at(d.para)
            out.append(Issue(
                check="xdoc_defterm_conflict", severity="high", para=d.para,
                ref=c.ref if c else f"p{d.para}",
                detail=f'"{term}" is defined differently in {other.label}.',
                excerpt=d.text[:140],
            ))
            break
    return out


def _threshold_conflicts(primary: Document, companions: list[Document]) -> list[Issue]:
    def amounts_by_topic(doc: Document) -> dict[str, tuple[int, int]]:
        found: dict[str, tuple[int, int]] = {}
        for i, text in enumerate(doc.paras):
            amounts = parse_money(text)
            if not amounts:
                continue
            for name, rx in TOPIC_RX.items():
                if name in found:
                    continue
                if rx.search(text):
                    found[name] = (amounts[0], i)
        return found

    mine = amounts_by_topic(primary)
    out = []
    for other in companions:
        theirs = amounts_by_topic(other)
        for topic, (amt, para) in mine.items():
            if topic not in theirs:
                continue
            other_amt, _ = theirs[topic]
            if amt == other_amt:
                continue
            c = primary.clause_at(para)
            out.append(Issue(
                check="xdoc_threshold_conflict", severity="medium", para=para,
                ref=c.ref if c else f"p{para}",
                detail=f"{topic} threshold is {amt} here and {other_amt} in {other.label}.",
                excerpt=primary.paras[para][:140],
                certainty="heuristic",
            ))
    return out


def _orphan_refs(primary: Document, companions: list[Document]) -> list[Issue]:
    out = []
    for i, text in enumerate(primary.paras):
        for m in RE_XDOC_REF.finditer(text):
            kind, target, hint = m.group(1), m.group(2), m.group(3)
            other = _match_companion(hint, companions)
            if other is None:
                continue
            nums = other.clause_numbers()
            t = target.lower()
            kind_l = kind.lower()
            if kind_l in {"schedule", "annexure", "annex", "exhibit", "appendix"}:
                candidates = {f"{kind_l} {t}", f"schedule {t}", t}
            else:
                candidates = {t, f"clause {t}", f"section {t}"}
            if candidates & nums or t in {n.split()[-1] for n in nums}:
                continue
            c = primary.clause_at(i)
            out.append(Issue(
                check="xdoc_orphan_reference", severity="high", para=i,
                ref=c.ref if c else f"p{i}",
                detail=f"Reference to {kind} {target} of {other.label} — "
                       f"no such {kind.lower()} in that document.",
                excerpt=primary._excerpt(i, kind),
            ))
    return out


def _disclosure_gaps(primary: Document, companions: list[Document]) -> list[Issue]:
    letters = [d for d in companions if d.role == "disclosure_letter"]
    if not letters:
        return []
    warranties = _warranty_numbers(primary)
    if not warranties:
        return []
    disclosed: set[str] = set()
    for letter in letters:
        disclosed |= _disclosure_numbers(letter)
    missing = sorted(warranties - disclosed)
    if not missing:
        return []
    # Anchor on the first missing warranty clause.
    para = 0
    ref = missing[0]
    hit = primary.find_clause(missing[0])
    if hit:
        para, ref = hit.start, hit.ref
    return [Issue(
        check="xdoc_disclosure_mapping_gap", severity="high", para=para,
        ref=ref,
        detail="Warranty " + ", ".join(missing)
               + " has no matching paragraph in the disclosure letter.",
        excerpt=primary.paras[para][:140] if primary.paras else "",
    )]


def search_matter(documents: list[Document], query: str, regex: bool = False) -> list[dict]:
    hits: list[dict] = []
    for doc in documents:
        for h in doc.search_all(query, regex=regex):
            if h.get("error"):
                return [h]
            h = dict(h)
            h["doc_id"] = doc.doc_id
            h["doc_role"] = doc.role
            hits.append(h)
    return hits
