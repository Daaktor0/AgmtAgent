"""Canonical document model: Clause, Definition, Issue and Document.

Plan commit 9. The class bodies moved verbatim from document.py; segmentation
and definition extraction now live in segment.py and are delegated to.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from typing import Iterable

from .patterns import *  # noqa: F401,F403
from .helpers import *  # noqa: F401,F403

def _ingest_fn(name):
    """Late-bind ingest helpers to avoid a circular import."""
    import importlib
    return getattr(importlib.import_module(".ingest", __package__), name)




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
    certainty: str = "exact"
    evidence_tier: int = 1
    check_id: str = ""
    check_version: int = 1
    family: str = ""



class Document:
    def __init__(
        self,
        paragraphs: Iterable[str],
        prefixes: Iterable[str] | None = None,
        *,
        doc_id: str = "primary",
        role: str = "primary",
        filename: str = "",
        comments: Iterable[dict] | None = None,
        revisions: Iterable[dict] | None = None,
        tables: Iterable[dict] | None = None,
        unique_local_ids: Iterable[str] | None = None,
        list_levels: Iterable[int | None] | None = None,
        companions: list["Document"] | None = None,
    ):
        self.doc_id = doc_id
        self.role = role
        self.filename = filename
        self.paras: list[str] = [p.rstrip() for p in paragraphs]
        prefix_list = [p.strip() for p in prefixes] if prefixes is not None else []
        self._structure_paras: list[str] = []
        for i, para in enumerate(self.paras):
            prefix = prefix_list[i] if i < len(prefix_list) else ""
            if prefix and not para.lstrip().startswith(prefix):
                self._structure_paras.append(f"{prefix} {para}")
            else:
                self._structure_paras.append(para)
        self.comments: list[dict] | None = (
            [dict(c) for c in comments] if comments is not None else None
        )
        self.revisions: list[dict] | None = (
            [dict(r) for r in revisions] if revisions is not None else None
        )
        self.tables: list[dict] | None = (
            [dict(t) for t in tables] if tables is not None else None
        )
        self.unique_local_ids: list[str] = (
            [str(u) for u in unique_local_ids] if unique_local_ids is not None else []
        )
        self.list_levels: list[int | None] = (
            list(list_levels) if list_levels is not None else []
        )
        self.companions: list[Document] = list(companions or [])
        self.suppressed_checks: list[dict] = []
        self.clauses: list[Clause] = []
        self.definitions: dict[str, Definition] = {}
        self.xrefs: list[tuple[int, str, str]] = []  # (para, kind, target)
        self._segment()
        self._extract_definitions()
        self._extract_xrefs()
        self._index_usages()

    # ---------------- structure ----------------

    def _segment(self) -> None:
        from .segment import segment_structure

        segment_structure(self)

    def _extract_definitions(self) -> None:
        from .segment import extract_definitions

        extract_definitions(self)

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

    @property
    def label(self) -> str:
        return self.filename or self.doc_id or self.role or "document"

    @property
    def capabilities(self) -> set[str]:
        caps = {"paragraphs", "structure"}
        if self.comments is not None:
            caps.add("comments")
        if self.revisions is not None:
            caps.add("revisions")
        if self.tables is not None:
            caps.add("tables")
        if self.list_levels:
            caps.add("list_levels")
        if self.unique_local_ids:
            caps.add("unique_local_ids")
        if self.companions:
            caps.add("companions")
        return caps

    def mechanical_checks(self, family: str | None = None) -> list[Issue]:
        from .check_registry import run_registered
        findings, suppressed = run_registered(self, family=family)
        self.suppressed_checks = suppressed
        return findings

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
                certainty="heuristic",
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

    def _check_orphan_schedules(self) -> list[Issue]:
        out = []
        schedule_kinds = {"schedule", "annexure", "annex", "exhibit", "appendix"}
        for c in self.clauses:
            if c.kind != "schedule" or not c.number:
                continue
            token = c.number.lower().split()[-1]
            aliases = {c.number.lower(), f"schedule {token}", token}
            seen = set()
            for para, kind, target in self.xrefs:
                if para == c.start or kind not in schedule_kinds:
                    continue
                t = target.lower()
                seen.update({t, f"{kind} {t}", f"schedule {t}"})
            if not (aliases & seen):
                out.append(Issue(
                    check="orphan_schedule", severity="medium", para=c.start,
                    ref=c.ref,
                    detail=f"{c.ref} is present but is not cited as a schedule target.",
                    excerpt=self._excerpt(c.start, c.number),
                ))
        return out

    def _check_empty_schedules(self) -> list[Issue]:
        out = []
        for c in self.clauses:
            if c.kind != "schedule":
                continue
            body = self.paras[c.start + 1:c.end + 1] if c.end > c.start else []
            words = re.findall(r"\S+", " ".join(body))
            if len(words) < 15:
                out.append(Issue(
                    check="empty_schedule", severity="medium", para=c.start,
                    ref=c.ref,
                    detail=f"{c.ref} has fewer than 15 body words under the heading.",
                    excerpt=" ".join(body)[:140],
                ))
        return out

    def _check_missing_chapeau(self) -> list[Issue]:
        out = []
        clauses = [
            c for c in self.clauses
            if c.kind == "clause" and re.fullmatch(r"\d+(?:\.\d+)*", c.number)
        ]
        for c in clauses:
            children = [
                k for k in clauses
                if k.number.startswith(c.number + ".") and k.depth == c.depth + 1
            ]
            if len(children) < 2:
                continue
            text = self._structure_paras[c.start]
            m = RE_DECIMAL.match(text)
            lead = text[m.end():].strip() if m else c.heading.strip()
            # A heading ("SUBSCRIPTION", "CONDITIONS PRECEDENT") is house style.
            # Only a bare number with children and no lead-in is a missing chapeau.
            if lead:
                continue
            out.append(Issue(
                check="missing_chapeau", severity="low", para=c.start,
                ref=c.ref,
                detail=f"{c.ref} has sub-clauses but no operative chapeau.",
                excerpt=self._excerpt(c.start, c.number),
            ))
        return out

    def _check_forward_defs(self) -> list[Issue]:
        out = []
        for term, d in self.definitions.items():
            earlier = [p for p in d.usages if p < d.para]
            if earlier:
                c = self.clause_at(earlier[0])
                out.append(Issue(
                    check="forward_defined_term", severity="medium", para=earlier[0],
                    ref=c.ref if c else f"p{earlier[0]}",
                    detail=f'"{term}" is used before it is defined at paragraph {d.para}.',
                    excerpt=self._excerpt(earlier[0], term),
                ))
        return out

    def _check_circular_defs(self) -> list[Issue]:
        out = []
        terms = sorted(self.definitions)
        seen: set[tuple[str, str]] = set()
        for a in terms:
            for b in terms:
                if a >= b:
                    continue
                da = self.definitions[a]
                db = self.definitions[b]
                a_meaning = self._definition_meaning(da.text)
                b_meaning = self._definition_meaning(db.text)
                if not a_meaning or not b_meaning:
                    continue
                if not re.search(r"\b" + re.escape(b) + r"\b", a_meaning):
                    continue
                if not re.search(r"\b" + re.escape(a) + r"\b", b_meaning):
                    continue
                key = (a, b)
                if key in seen:
                    continue
                seen.add(key)
                c = self.clause_at(da.para)
                out.append(Issue(
                    check="circular_definition", severity="high", para=da.para,
                    ref=c.ref if c else f"p{da.para}",
                    detail=f'"{a}" and "{b}" refer to each other in their definitions.',
                    excerpt=da.text[:140],
                ))
        return out

    def _check_party_name_drift(self) -> list[Issue]:
        out = []
        party_terms = {
            "Company", "Investor", "Promoters", "Promoter", "Purchaser", "Vendor",
            "Buyer", "Seller",
        }
        suffix_rx = r"Private Limited|Limited|LLP|Inc\.|LLC"
        for term, d in self.definitions.items():
            party_like = term in party_terms or re.search(suffix_rx, d.text)
            if not party_like:
                continue
            canonical = self._legal_name_for_definition(term, d.text)
            if not canonical:
                continue
            first = self._first_significant_token(canonical)
            canonical_core = self._legal_name_core(canonical)
            for i, text in enumerate(self.paras):
                if i == d.para:
                    continue
                for candidate in self._legal_name_candidates(text):
                    if canonical in candidate or candidate in canonical:
                        continue
                    if self._first_significant_token(candidate) != first:
                        continue
                    if (self._legal_name_core(candidate) == canonical_core
                            and candidate != canonical):
                        c = self.clause_at(i)
                        out.append(Issue(
                            check="party_name_drift", severity="medium", para=i,
                            ref=c.ref if c else f"p{i}",
                            detail=f'Possible party-name drift: "{candidate}" appears after '
                                   f'"{canonical}" was defined as "{term}".',
                            excerpt=self._excerpt(i, candidate),
                        ))
                        return out
        return out

    def _check_percentage_sum(self) -> list[Issue]:
        out = []
        cue = re.compile(
            r"\b(shareholding|share capital|allocated|entitlement|held by|percent of the)\b",
            re.IGNORECASE,
        )
        pct = re.compile(r"\b(\d+(?:\.\d+)?)\s*%")
        used: set[int] = set()
        for start in range(len(self.paras)):
            if start in used:
                continue
            if not (cue.search(self.paras[start]) or pct.search(self.paras[start])):
                continue
            for end in range(start, min(len(self.paras), start + 8)):
                if end in used:
                    break
                cluster = self.paras[start:end + 1]
                if len(cluster) > 1 and any(len(p) >= 160 for p in cluster):
                    break
                text = " ".join(cluster)
                values = {float(m.group(1)) for m in pct.finditer(text)}
                if len(values) < 3 or not cue.search(text):
                    continue
                total = sum(values)
                if total > 0 and abs(total - 100) > 0.05:
                    c = self.clause_at(start)
                    out.append(Issue(
                        check="percentage_sum", severity="high", para=start,
                        ref=c.ref if c else f"p{start}",
                        detail=f"Percentages in this allocation cluster sum to {total:g}%, not 100%.",
                        excerpt=text[:140],
                    ))
                    used.update(range(start, end + 1))
                    break
        return out

    def _check_date_logic(self) -> list[Issue]:
        roles: dict[str, tuple[date, int]] = {}
        for i, text in enumerate(self.paras):
            for start, end, when in iter_dates(text):
                role = self._date_role(text[:start])
                if role and role not in roles:
                    roles[role] = (when, i)

        periods: dict[str, tuple[int, int]] = {}
        for i, text in enumerate(self.paras):
            role = self._period_role(text)
            if not role or role in periods:
                continue
            days = first_period_days(text)
            if days is not None:
                periods[role] = (days, i)

        out = []
        pairs = (
            ("closing", "execution", "Closing Date is before the execution date.",
             lambda a, b: a < b),
            ("long_stop", "closing", "Long-stop Date is before the Closing Date.",
             lambda a, b: a < b),
        )
        for left, right, detail, pred in pairs:
            if left not in roles or right not in roles:
                continue
            a, para = roles[left]
            b, _ = roles[right]
            if pred(a, b):
                c = self.clause_at(para)
                out.append(Issue(
                    check="date_logic_conflict", severity="high", para=para,
                    ref=c.ref if c else f"p{para}",
                    detail=detail,
                    excerpt=self.paras[para][:140],
                ))

        if "cure" in periods and "term" in periods:
            cure, para = periods["cure"]
            term, _ = periods["term"]
            if cure > term:
                c = self.clause_at(para)
                out.append(Issue(
                    check="date_logic_conflict", severity="high", para=para,
                    ref=c.ref if c else f"p{para}",
                    detail="Cure period is longer than the term of the Agreement.",
                    excerpt=self.paras[para][:140],
                ))
        if "survival" in periods and "limitation" in periods:
            survival, para = periods["survival"]
            limitation, _ = periods["limitation"]
            if survival < limitation:
                c = self.clause_at(para)
                out.append(Issue(
                    check="date_logic_conflict", severity="high", para=para,
                    ref=c.ref if c else f"p{para}",
                    detail="Warranty survival is shorter than the contractual limitation period.",
                    excerpt=self.paras[para][:140],
                ))
        return out

    def _check_currency(self) -> list[Issue]:
        found: dict[str, int] = {}
        for i, text in enumerate(self.paras):
            for m in RE_CURRENCY.finditer(text):
                code = currency_code(m.group(0))
                if code and code not in found:
                    found[code] = i
        if len(found) < 2:
            return []
        blob = " ".join(self.paras)
        if RE_CONVERSION.search(blob):
            return []
        para = max(found.values())
        c = self.clause_at(para)
        codes = ", ".join(sorted(found))
        return [Issue(
            check="currency_inconsistency", severity="medium", para=para,
            ref=c.ref if c else f"p{para}",
            detail=f"Document uses {codes} with no conversion mechanic.",
            excerpt=self.paras[para][:140],
            certainty="heuristic",
        )]

    def _check_thresholds(self) -> list[Issue]:
        out = []
        by_topic: dict[str, list[tuple[str, int, list[int]]]] = defaultdict(list)
        for i, text in enumerate(self.paras):
            topics = [name for name, rx in TOPIC_RX.items() if rx.search(text)]
            if not topics:
                continue
            amounts = parse_money(text)
            kind = ""
            if RE_BLANKET.search(text):
                kind = "blanket"
            elif RE_THRESHOLD_CUE.search(text) and amounts:
                kind = "threshold"
            if not kind:
                continue
            for topic in topics:
                by_topic[topic].append((kind, i, amounts))

        seen_paras: set[int] = set()
        for topic, rows in by_topic.items():
            thresholds = [r for r in rows if r[0] == "threshold"]
            blankets = [r for r in rows if r[0] == "blanket"]
            if not thresholds or not blankets:
                continue
            for _, para, _ in blankets:
                if para in seen_paras:
                    continue
                seen_paras.add(para)
                c = self.clause_at(para)
                out.append(Issue(
                    check="threshold_conflict", severity="high", para=para,
                    ref=c.ref if c else f"p{para}",
                    detail=f"A blanket {topic} prohibition swallows a stated numeric threshold.",
                    excerpt=self.paras[para][:140],
                    certainty="heuristic",
                ))

        de_minimis = self._first_labelled_amount(r"\bde minimis\b")
        basket = self._first_labelled_amount(r"\bbasket\b")
        cap = self._first_labelled_amount(
            r"\b(aggregate liability|capped at|cap of)\b"
        )
        if de_minimis and basket and de_minimis[0] > basket[0]:
            para = de_minimis[1]
            c = self.clause_at(para)
            out.append(Issue(
                check="threshold_conflict", severity="high", para=para,
                ref=c.ref if c else f"p{para}",
                detail="De minimis exceeds the basket.",
                excerpt=self.paras[para][:140],
                certainty="heuristic",
            ))
        if cap and basket and cap[0] < basket[0]:
            para = cap[1]
            c = self.clause_at(para)
            out.append(Issue(
                check="threshold_conflict", severity="high", para=para,
                ref=c.ref if c else f"p{para}",
                detail="Liability cap is below the basket.",
                excerpt=self.paras[para][:140],
                certainty="heuristic",
            ))
        return out

    def _check_signature_blocks(self) -> list[Issue]:
        start = None
        for i, text in enumerate(self.paras):
            if RE_SIG_START.search(text):
                start = i
                break
        if start is None:
            return []
        region = " ".join(self.paras[start:])
        parties = self._named_parties()
        if len(parties) < 2:
            return []
        missing = [p for p in parties if not re.search(r"\b" + re.escape(p) + r"\b", region)]
        if not missing or len(missing) == len(parties):
            return []
        c = self.clause_at(start)
        return [Issue(
            check="signature_block_mismatch", severity="medium", para=start,
            ref=c.ref if c else f"p{start}",
            detail="Signature blocks omit " + ", ".join(missing)
                   + " named in the parties clause.",
            excerpt=self.paras[start][:140],
        )]

    def _check_capacity(self) -> list[Issue]:
        rx = re.compile(
            r"\bthe\s+(Company|Investor|Promoters?|Purchaser|Vendor|Buyer|Seller)"
            r"\s+as\s+(?:a\s+|the\s+)?([A-Za-z][A-Za-z\-]{2,24})\b",
            re.IGNORECASE,
        )
        by_party: dict[str, list[tuple[str, int, str]]] = defaultdict(list)
        for i, text in enumerate(self.paras):
            for m in rx.finditer(text):
                by_party[m.group(1)].append((m.group(2).lower(), i, m.group(0)))
        out = []
        for party, rows in by_party.items():
            caps = {cap for cap, _, _ in rows}
            if len(caps) < 2:
                continue
            para = rows[0][1]
            c = self.clause_at(para)
            out.append(Issue(
                check="capacity_inconsistency", severity="medium", para=para,
                ref=c.ref if c else f"p{para}",
                detail=f'"{party}" is described as {", ".join(sorted(caps))}.',
                excerpt=rows[0][2],
                certainty="heuristic",
            ))
        return out

    def _check_scope_mismatch(self) -> list[Issue]:
        out = []
        for term, d in self.definitions.items():
            defined_at = self.clause_at(d.para)
            if not defined_at or defined_at.kind != "schedule":
                continue
            for usage in d.usages:
                used_at = self.clause_at(usage)
                if used_at and used_at.kind == "clause":
                    c = used_at
                    out.append(Issue(
                        check="scope_mismatch", severity="medium", para=usage,
                        ref=c.ref,
                        detail=f'"{term}" is defined in {defined_at.ref} but used in the body.',
                        excerpt=self._excerpt(usage, term),
                        certainty="heuristic",
                    ))
                    break
        return out

    _XREF_TOPIC = {
        "notice": "notice", "notices": "notice",
        "confidential": "confidentiality", "confidentiality": "confidentiality",
        "indemnity": "indemnity", "indemnification": "indemnity",
        "termination": "termination",
        "governing": "governing_law",
        "dispute": "dispute", "arbitration": "dispute",
        "warranty": "warranty", "warranties": "warranty",
        "completion": "completion", "closing": "completion",
        "subscription": "payment", "payment": "payment",
        "transfer": "transfer",
        "reserved": "reserved",
        "interpretation": "interpretation",
        "definition": "interpretation", "definitions": "interpretation",
    }

    def _topics_in(self, text: str) -> set[str]:
        found: set[str] = set()
        blob = text.lower()
        for word, topic in self._XREF_TOPIC.items():
            if re.search(r"\b" + re.escape(word) + r"\b", blob):
                found.add(topic)
        for name, rx in TOPIC_RX.items():
            if rx.search(text):
                found.add(name)
        if re.search(r"\b(pay|payment|subscribe|subscription)\b", blob):
            found.add("payment")
        return found

    def _resolve_xref(self, kind: str, target: str) -> Clause | None:
        t = target.lower()
        kind_l = kind.lower()
        if kind_l in {"schedule", "annexure", "annex", "exhibit", "appendix"}:
            candidates = {f"{kind_l} {t}", f"schedule {t}", t}
        elif kind_l == "part":
            candidates = {f"part {t}", t}
        else:
            candidates = {t, f"clause {t}", f"section {t}", f"article {t}"}
        for c in self.clauses:
            if c.number.lower() in candidates:
                return c
            if c.number.lower().split()[-1] == t and (
                kind_l not in {"schedule", "annexure", "annex", "exhibit", "appendix"}
                or c.kind == "schedule"
            ):
                return c
        return None

    def _check_xref_implausible(self) -> list[Issue]:
        out = []
        seen: set[tuple[int, str]] = set()
        for para, kind, target in self.xrefs:
            dest = self._resolve_xref(kind, target)
            if dest is None:
                continue
            heading = dest.heading or (
                self.paras[dest.start] if 0 <= dest.start < len(self.paras) else ""
            )
            dest_topics = self._topics_in(heading)
            if not dest_topics:
                dest_topics = self._topics_in(
                    " ".join(self.paras[dest.start:dest.start + 1])
                )
            cite = self.paras[para]
            cite_topics = self._topics_in(cite)
            if not dest_topics or not cite_topics:
                continue
            if dest_topics & cite_topics:
                continue
            key = (para, dest.ref)
            if key in seen:
                continue
            seen.add(key)
            c = self.clause_at(para)
            out.append(Issue(
                check="xref_implausible", severity="medium", para=para,
                ref=c.ref if c else f"p{para}",
                detail=f"Reference to {kind.title()} {target} ({dest.ref}"
                       f"{': ' + dest.heading if dest.heading else ''}) "
                       f"does not match the citing context.",
                excerpt=self._excerpt(para, kind),
                certainty="heuristic",
            ))
        return out

    def _check_depth_anomaly(self) -> list[Issue]:
        out = []
        nums = {
            c.number for c in self.clauses
            if c.number and re.fullmatch(r"\d+(?:\.\d+)*", c.number)
        }
        seen_parent: set[str] = set()
        for c in self.clauses:
            if not re.fullmatch(r"\d+(?:\.\d+)+", c.number):
                continue
            parent = c.number.rsplit(".", 1)[0]
            if parent in nums or parent in seen_parent:
                continue
            seen_parent.add(parent)
            out.append(Issue(
                check="depth_anomaly", severity="low", para=c.start,
                ref=c.ref,
                detail=f"{c.ref} is nested under {parent}, which is not a clause.",
                excerpt=self._excerpt(c.start, c.number),
                certainty="heuristic",
            ))
        if self.list_levels:
            siblings: dict[str, list[Clause]] = defaultdict(list)
            for c in self.clauses:
                if not re.fullmatch(r"\d+(?:\.\d+)*", c.number):
                    continue
                parent = c.number.rsplit(".", 1)[0] if "." in c.number else ""
                siblings[parent].append(c)
            for sibs in siblings.values():
                levels = []
                for c in sibs:
                    if 0 <= c.start < len(self.list_levels):
                        lvl = self.list_levels[c.start]
                        if lvl is not None:
                            levels.append((c, int(lvl)))
                if len(levels) < 3:
                    continue
                counts: dict[int, int] = defaultdict(int)
                for _, lvl in levels:
                    counts[lvl] += 1
                majority, n = max(counts.items(), key=lambda kv: kv[1])
                if n < 2:
                    continue
                for c, lvl in levels:
                    if lvl == majority:
                        continue
                    out.append(Issue(
                        check="depth_anomaly", severity="low", para=c.start,
                        ref=c.ref,
                        detail=f"{c.ref} is list-level {lvl} among siblings at level {majority}.",
                        excerpt=self._excerpt(c.start, c.number),
                        certainty="heuristic",
                    ))
                    break
        return out

    def _check_unresolved_comments(self) -> list[Issue]:
        out = []
        for cmt in self.comments or []:
            if cmt.get("resolved"):
                continue
            para = int(cmt.get("block_idx", -1))
            if not (0 <= para < len(self.paras)):
                para = 0
            c = self.clause_at(para)
            author = cmt.get("author") or "unknown"
            text = (cmt.get("text") or "").strip()
            out.append(Issue(
                check="unresolved_comment", severity="medium", para=para,
                ref=c.ref if c else f"p{para}",
                detail=f"Unresolved Word comment by {author}"
                       + (f": {text[:120]}" if text else "."),
                excerpt=text[:140],
            ))
        return out

    def _check_pending_revisions(self) -> list[Issue]:
        out = []
        for rev in self.revisions or []:
            para = int(rev.get("block_idx", -1))
            if not (0 <= para < len(self.paras)):
                para = 0
            c = self.clause_at(para)
            kind = (rev.get("type") or "change").lower()
            author = rev.get("author") or "unknown"
            out.append(Issue(
                check="pending_tracked_change", severity="high", para=para,
                ref=c.ref if c else f"p{para}",
                detail=f"Unaccepted {kind} by {author} remains in the document.",
                excerpt=(rev.get("text_after") or rev.get("text_before") or "")[:140],
            ))
        return out

    def _check_cross_document(self) -> list[Issue]:
        from ..matter import cross_document_checks
        return cross_document_checks(self, self.companions)

    def _named_parties(self) -> list[str]:
        found: list[str] = []
        for term in self.definitions:
            if term in PARTY_LABELS and term not in found:
                found.append(term)
        rx = re.compile(
            r"\(\s*the\s+[\"'“”]\s*(" + "|".join(PARTY_LABELS) + r")\s*[\"'“”]\s*\)"
        )
        for text in self.paras[:8]:
            for m in rx.finditer(text):
                if m.group(1) not in found:
                    found.append(m.group(1))
        return found

    def _first_labelled_amount(self, cue: str) -> tuple[int, int] | None:
        rx = re.compile(cue, re.IGNORECASE)
        for i, text in enumerate(self.paras):
            if not rx.search(text):
                continue
            amounts = parse_money(text)
            if amounts:
                return amounts[0], i
        return None

    def _date_role(self, prefix: str) -> str | None:
        p = prefix.lower()
        if re.search(r"long[-\s]?stop", p):
            return "long_stop"
        if re.search(r"closing date|completion date|closing shall|completion shall", p):
            return "closing"
        if re.search(r"made on|dated|executed on|date of this agreement", p):
            return "execution"
        return None

    def _period_role(self, text: str) -> str | None:
        t = text.lower()
        if re.search(r"\bcure period\b|\bdays to (?:cure|remedy)\b|\bto cure\b", t):
            return "cure"
        if re.search(r"\bterm of\b|\bcontinue for a term\b|\bshall continue for\b", t):
            return "term"
        if re.search(r"\bsurvive for\b|\bsurvival period\b|\bshall survive\b", t):
            return "survival"
        if re.search(r"\blimitation period\b|\bno claim may be brought\b|\btime[- ]bar\b", t):
            return "limitation"
        return None

    # ---------------- helpers ----------------

    def _definition_meaning(self, text: str) -> str:
        """The operative meaning after 'means' / 'shall mean'. Empty if none."""
        m = re.search(
            r"\b(means|shall mean|shall have the meaning|has the meaning)\b",
            text,
            re.IGNORECASE,
        )
        return text[m.end():] if m else ""

    def _excerpt(self, para: int, needle: str, width: int = 140) -> str:
        text = self.paras[para]
        pos = text.lower().find(needle.lower())
        if pos < 0:
            return text[:width]
        a = max(0, pos - width // 2)
        return ("…" if a else "") + text[a:a + width] + ("…" if a + width < len(text) else "")

    def _legal_name_for_definition(self, term: str, text: str) -> str:
        q = r"[\"'“”‘’]"
        before_term = re.search(
            r"([A-Z][A-Za-z0-9&.,' \-]{1,140}?)\s*\(\s*(?:the\s+)?"
            + q + re.escape(term) + q,
            text,
        )
        if before_term:
            name = self._trim_to_legal_name(before_term.group(1))
            if name:
                return name
        names = self._legal_name_candidates(text)
        return max(names, key=len) if names else ""

    def _legal_name_candidates(self, text: str) -> list[str]:
        suffix = r"(?:Private\s+Limited|Limited|Ltd\.?|LLP|Inc\.|LLC)"
        rx = re.compile(
            r"\b[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,8}\s+"
            + suffix + r"\b"
        )
        return [self._trim_to_legal_name(m.group(0)) for m in rx.finditer(text)]

    def _trim_to_legal_name(self, text: str) -> str:
        words = re.findall(r"[A-Z][A-Za-z0-9&.'-]*", text)
        if len(words) < 2:
            return ""
        suffixes = {"Limited", "Ltd", "LLP", "Inc", "LLC"}
        for i, word in enumerate(words):
            clean = word.rstrip(".")
            if clean in suffixes:
                start = max(0, i - 5)
                if i > 0 and words[i - 1] == "Private":
                    start = max(0, i - 6)
                return " ".join(words[start:i + 1])
        return " ".join(words) if len(words) >= 2 else ""

    def _first_significant_token(self, name: str) -> str:
        for token in re.findall(r"[A-Za-z0-9]+", name):
            if token.lower() not in {"the", "a", "an"}:
                return token.lower()
        return ""

    def _legal_name_core(self, name: str) -> str:
        tokens = [
            t.lower() for t in re.findall(r"[A-Za-z0-9]+", name)
            if t.lower() not in {"private", "limited", "ltd", "llp", "inc", "llc"}
        ]
        return " ".join(tokens)

    def outline(self, max_items: int = 400, offset: int = 0) -> list[dict]:
        offset = max(0, int(offset))
        out = []
        for c in self.clauses[offset:offset + max_items]:
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

    def search(self, pattern: str, regex: bool = False, limit: int = 40,
               offset: int = 0) -> list[dict]:
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
        offset = max(0, int(offset))
        return hits[offset:offset + limit] if limit is not None else hits

    def search_all(self, pattern: str, regex: bool = False) -> list[dict]:
        return self.search(pattern, regex=regex, limit=10**9, offset=0)


def __getattr__(name):
    """Late-bind ingest helpers (words_to_number, parse_money, ...) to avoid a
    circular import: ingest.py imports this module's Document."""
    if name in {"words_to_number", "parse_money", "currency_code",
                "iter_dates", "first_period_days", "build_document"}:
        from . import ingest
        return getattr(ingest, name)
    raise AttributeError(name)
