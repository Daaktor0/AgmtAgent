"""Topic extraction and house-position promotion."""
from __future__ import annotations

import re

PROMOTE_AFTER = 3

_STOP = {
    "the", "a", "an", "of", "and", "or", "to", "for", "in", "on", "at",
    "is", "be", "this", "that", "with", "from", "into", "its", "it",
}


def issue_topic(issue: dict) -> str:
    check = (issue.get("check_name") or issue.get("check")
             or issue.get("_mechanical") or "")
    if check:
        return check
    title = issue.get("title") or issue.get("detail") or ""
    words = [w.lower() for w in re.findall(r"[A-Za-z]{3,}", title)]
    words = [w for w in words if w not in _STOP]
    return " ".join(words[:4]) or "unspecified"


def promote(store, issue: dict, action: str) -> dict | None:
    if action not in {"accepted", "accepted_modified", "rejected"}:
        return None
    polarity = "prefer" if action.startswith("accepted") else "avoid"
    topic = issue_topic(issue)
    statement = (issue.get("title") or issue.get("detail") or topic).strip()
    return store.upsert_position(
        topic=topic,
        polarity=polarity,
        statement=statement,
        issue_id=issue.get("id") or "",
    )


def query_positions(store, topic: str) -> list[dict]:
    return store.active_positions(topic)
