"""Minimum-effective amendment. Qualifier before rewrite."""
from __future__ import annotations

from typing import Any

from agent.document import Document
from agent.schemas.action import ActionPrecondition, ProposedAction, fill_action_hashes
from agent.schemas.command import ContextualCommand
from agent.schemas.ids import new_id, sha256_hex
from agent.schemas.selection import SelectionAnchor

_QUALIFIER = (
    " provided that nothing in this Clause shall entitle a party to recover "
    "twice in respect of the same Loss"
)


def _already_solved(analysis: dict[str, Any]) -> bool:
    return analysis.get("finding") in {"resolved_by_existing", "no_issue"}


def draft_minimum_amendment(
    command: ContextualCommand,
    analysis: dict[str, Any],
    doc: Document,
) -> dict[str, Any]:
    """Return current/proposed/reason plus a ProposedAction, or a refusal."""
    if _already_solved(analysis):
        return {
            "status": "not_required",
            "reason": "Another provision already addresses double recovery, "
                      "or no duplicate route was found.",
            "current": "",
            "proposed": "",
            "strategy": "retain",
        }

    sel: SelectionAnchor | None = command.selection
    current = (sel.selected_text if sel else "") or ""
    if not current.strip():
        return {
            "status": "refused",
            "reason": "No selected wording to amend.",
            "current": "",
            "proposed": "",
            "strategy": "retain",
        }

    # Ladder: retain → qualifier / one limb. Never replace the clause.
    if current.rstrip().endswith("."):
        proposed = current.rstrip()[:-1] + _QUALIFIER + "."
    else:
        proposed = current.rstrip() + _QUALIFIER + "."

    captured_hash = (command.provenance or {}).get("captured_doc_hash") or ""
    pre = ActionPrecondition(
        document_id=command.document_id,
        document_version_id=command.document_version_id,
        expected_doc_hash=captured_hash,
        expected_selected_text_sha256=sel.selected_text_sha256 if sel else sha256_hex(current),
        anchor=sel,
        old_text=current[:200],
        old_text_sha256=sha256_hex(current[:200]),
    )
    action = fill_action_hashes(ProposedAction(
        action_id=new_id(),
        document_version_id=command.document_version_id,
        anchor_id=(sel.unique_local_ids[0] if sel and sel.unique_local_ids else ""),
        operation="replace",
        precondition=pre,
        expected_old_text=current[:200],
        proposed_text=proposed[:200] if len(proposed) <= 200 else proposed,
        new_text=proposed,
        evidence_ids=list(analysis.get("evidence_ids") or []),
        requires_human_approval=True,
        risk="medium",
        reason="Removes the duplicate recovery route without changing the remainder "
               "of the agreed indemnity architecture.",
    ))
    return {
        "status": "ready",
        "strategy": "qualifier",
        "current": current,
        "proposed": proposed,
        "reason": action.reason,
        "action": action.model_dump(),
    }
