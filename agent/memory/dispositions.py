"""Record a lawyer disposition and feed the position promoter."""
from __future__ import annotations

from typing import Any

from .positions import promote

VALID = {"accepted", "accepted_modified", "rejected", "deferred"}


def record_disposition(
    store,
    issue_id: str,
    action: str,
    final_text: str = "",
    note: str = "",
) -> dict[str, Any]:
    action = (action or "").strip()
    if action not in VALID:
        return {"error": f"action must be one of {sorted(VALID)}"}
    issue = store.get_issue(issue_id)
    if issue is None:
        return {"error": "issue not found"}
    disp_id = store.add_disposition(issue_id, action, final_text, note)
    position = promote(store, issue, action)
    return {
        "id": disp_id,
        "issue_id": issue_id,
        "action": action,
        "position": {
            "id": position["id"],
            "topic": position["topic"],
            "polarity": position["polarity"],
            "evidence_count": position["evidence_count"],
            "active": bool(position["active"]),
        } if position else None,
    }
