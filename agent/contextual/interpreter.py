"""Typed intent and mention extraction. Voice uses this same path later."""
from __future__ import annotations

import re

from agent.schemas.command import IntentSpec, RawInput, ReferenceMention
from agent.schemas.ids import sha256_hex

_THIS = re.compile(
    r"\b(this language|this wording|selected wording|this provision|this)\b",
    re.IGNORECASE,
)
_HEADING = re.compile(
    r"\bthe\s+((?:indemnity|limitation|warranty|confidentiality|termination|"
    r"non[-\s]?compete|reserved matters?|governing law|dispute)(?:\s+clause)?|"
    r"[a-z][a-z\s-]{2,40}\s+clause)\b",
    re.IGNORECASE,
)
_DEFINITION = re.compile(
    r"\bdefinition of\s+[“\"']?([A-Z][A-Za-z0-9 ]{0,60}?)[”\"']?\b",
)
_CLAUSE_NUM = re.compile(
    r"\b(?:clause|section|article)\s+(\d+(?:\.\d+)*)\b",
    re.IGNORECASE,
)

_CHECK = re.compile(
    r"\b(check|compare|against|double[-\s]?recover|conflict|overlap|issue)\b",
    re.I,
)
_DRAFT = re.compile(r"\b(draft|amend|rewrite|insert|delete|qualify)\b", re.I)
_EXPLAIN = re.compile(r"\b(explain|what does|mean|interpret)\b", re.I)
_FIND = re.compile(r"\b(find|where else|use[-\s]?sites?|definition)\b", re.I)


def extract_mentions(raw_text: str) -> list[ReferenceMention]:
    text = raw_text or ""
    mentions: list[ReferenceMention] = []
    seen_spans: set[tuple[int, int]] = set()

    def add(match: re.Match[str], category: str, mention_text: str | None = None) -> None:
        span = (match.start(), match.end())
        if span in seen_spans:
            return
        # Prefer the longer "this language" span over a nested "this".
        for start, end in list(seen_spans):
            if start <= span[0] and span[1] <= end:
                return
            if span[0] <= start and end <= span[1]:
                seen_spans.discard((start, end))
                mentions[:] = [m for m in mentions if not (m.start == start and m.end == end)]
        seen_spans.add(span)
        label = mention_text if mention_text is not None else match.group(0)
        mentions.append(ReferenceMention(
            mention_id=f"m-{category}-{len(mentions)+1}-{sha256_hex(label)[:8]}",
            text=label,
            category=category,  # type: ignore[arg-type]
            start=span[0],
            end=span[1],
        ))

    for match in _THIS.finditer(text):
        add(match, "selection")
    for match in _HEADING.finditer(text):
        add(match, "heading")
    for match in _DEFINITION.finditer(text):
        add(match, "definition")
    for match in _CLAUSE_NUM.finditer(text):
        add(match, "heading", match.group(0))
    mentions.sort(key=lambda m: m.start)
    return mentions


def interpret(raw: RawInput | str) -> tuple[IntentSpec, list[ReferenceMention]]:
    if isinstance(raw, str):
        raw = RawInput(raw_text=raw, modality="text", activation="typed")
    text = raw.raw_text or ""
    low = text.lower()
    mentions = extract_mentions(text)

    concerns: list[str] = []
    if re.search(r"double[-\s]?recover", low):
        concerns.append("double-recovery")
    if "overlap" in low:
        concerns.append("overlap")
    if "indemnity" in low:
        concerns.append("indemnity")

    if _DRAFT.search(low) and not _CHECK.search(low):
        objective = "draft"
        output = "minimum_amendment"
        action = "draft"
        confidence = 0.8
    elif _EXPLAIN.search(low) and not _CHECK.search(low):
        objective = "explain"
        output = "answer"
        action = "explain"
        confidence = 0.75
    elif _FIND.search(low) and not _CHECK.search(low):
        objective = "find_uses" if "definition" not in low else "find_definition"
        output = "locations"
        action = "find"
        confidence = 0.75
    elif "compare" in low:
        objective = "compare"
        output = "comparison"
        action = "compare"
        confidence = 0.85
    else:
        objective = "check"
        output = "answer"
        action = "analyse"
        confidence = 0.9 if _CHECK.search(low) else 0.6

    if "double" in low and "recover" in low:
        confidence = max(confidence, 0.9)

    intent = IntentSpec(
        objective=objective,  # type: ignore[arg-type]
        requested_output=output,  # type: ignore[arg-type]
        constraints=list(concerns),
        confidence=confidence,
        action=action,  # type: ignore[arg-type]
        target_concepts=[c for c in concerns if c != "double-recovery"],
        concerns=concerns,
    )
    return intent, mentions
