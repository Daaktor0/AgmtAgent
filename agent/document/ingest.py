"""Ingestion: build a Document from the add-in payload (plan commit 9)."""
from __future__ import annotations

import re
from datetime import date

from .model import Document
from .patterns import *  # noqa: F401,F403
from .patterns import NUM_WORDS  # noqa: F401


def build_document(ingested: dict, *, doc_id: str = "primary") -> Document:
    """Construct a Document from an ingested.json-shaped dict, including extras."""
    companions = [
        build_document(
            raw,
            doc_id=str(raw.get("doc_id") or raw.get("id") or f"doc{i}"),
        )
        for i, raw in enumerate(ingested.get("companions") or [])
    ]
    return Document(
        ingested["paragraphs"],
        prefixes=ingested.get("prefixes") or ingested.get("list_prefixes"),
        doc_id=str(ingested.get("doc_id") or ingested.get("id") or doc_id),
        role=str(ingested.get("role") or "primary"),
        filename=str(ingested.get("filename") or ""),
        comments=ingested.get("comments"),
        revisions=ingested.get("revisions"),
        tables=ingested.get("tables"),
        unique_local_ids=ingested.get("unique_local_ids"),
        list_levels=ingested.get("list_levels"),
        companions=companions,
    )


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def iter_dates(text: str) -> list[tuple[int, int, date]]:
    out: list[tuple[int, int, date]] = []
    for m in RE_DATE_DMY.finditer(text):
        when = _safe_date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
        if when:
            out.append((m.start(), m.end(), when))
    for m in RE_DATE_MDY.finditer(text):
        when = _safe_date(int(m.group(3)), MONTHS[m.group(1).lower()], int(m.group(2)))
        if when:
            out.append((m.start(), m.end(), when))
    for m in RE_DATE_ISO.finditer(text):
        when = _safe_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if when:
            out.append((m.start(), m.end(), when))
    return out


def first_period_days(text: str) -> int | None:
    m = RE_PERIOD.search(text)
    if not m:
        return None
    n = int(m.group(1))
    unit = m.group(2).lower()
    if unit.startswith("day"):
        return n
    if unit.startswith("month"):
        return n * 30
    return n * 365


def parse_money(text: str) -> list[int]:
    out: list[int] = []
    for m in RE_MONEY.finditer(text):
        out.append(int(m.group(1).replace(",", "")))
    scales = {"crore": 10_000_000, "lakh": 100_000, "lac": 100_000, "million": 1_000_000}
    for m in RE_MONEY_SCALE.finditer(text):
        out.append(int(float(m.group(1)) * scales[m.group(2).lower()]))
    return out


def currency_code(token: str) -> str | None:
    t = token.strip().lower().replace(".", "")
    if t in {"inr", "rs", "₹"}:
        return "INR"
    if t in {"usd", "us$"}:
        return "USD"
    if t in {"eur", "€"}:
        return "EUR"
    if t in {"gbp", "£"}:
        return "GBP"
    return None


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

