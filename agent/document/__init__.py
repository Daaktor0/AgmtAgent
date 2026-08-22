"""Deterministic document analysis — package facade (plan commits 8-9).

Everything in here is exact. No model is involved, so nothing in here can be
hallucinated. The supervisor uses these as ground truth and spends model tokens
only on judgement.

Module layout: patterns.py (regex), model.py (Clause/Definition/Issue/
Document), segment.py (structure + definitions), ingest.py (payload ->
Document), check_registry.py (mechanical checks).
"""
from .patterns import *  # noqa: F401,F403
from .model import Clause, Definition, Document, Issue  # noqa: F401
from .ingest import *  # noqa: F401,F403
from .ingest import (  # noqa: F401
    build_document, iter_dates, first_period_days, parse_money,
    currency_code, words_to_number,
)
