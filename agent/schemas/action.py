"""ProposedAction, preconditions and single-use tickets — plan §5.2."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .ids import sha256_hex
from .selection import SelectionAnchor

Operation = Literal["navigate", "replace", "delete", "comment", "insert_before", "insert_after"]
ApplyStatus = Literal[
    "pending", "approved", "prepared", "consumed", "confirmed",
    "refused", "failed_unknown",
]


class ActionPrecondition(BaseModel):
    document_id: str
    document_version_id: str
    expected_doc_hash: str
    expected_selected_text_sha256: str = ""
    anchor: SelectionAnchor | None = None
    old_text: str = ""
    old_text_sha256: str = ""
    anchor_method_allowed: list[str] = Field(default_factory=lambda: [
        "block_id", "unique_local_id", "scoped_exact", "candidate_confirmation",
    ])
    requires_confirmation_if_document_hash_changes: bool = True


class ProposedAction(BaseModel):
    action_id: str
    issue_id: str | None = None
    document_version_id: str = ""
    anchor_id: str = ""
    operation: Operation = "replace"
    precondition: ActionPrecondition | None = None
    expected_old_text: str = ""
    expected_old_text_hash: str = ""
    proposed_text: str = ""
    new_text: str = ""
    comment: str = ""
    evidence_ids: list[str] = Field(default_factory=list)
    requires_human_approval: bool = True
    risk: Literal["low", "medium", "high"] = "medium"
    approved_at: str | None = None
    reason: str = ""


class ActionTicket(BaseModel):
    ticket_id: str
    action_id: str
    document_version_id: str
    expected_doc_hash: str
    expected_old_text: str
    expected_old_text_hash: str
    proposed_text: str = ""
    operation: Operation = "replace"
    expires_at: str
    consumed: bool = False
    consumed_at: str | None = None
    status: ApplyStatus = "prepared"


def fill_action_hashes(action: ProposedAction) -> ProposedAction:
    old = action.expected_old_text or (action.precondition.old_text if action.precondition else "")
    new = action.proposed_text or action.new_text
    data = action.model_dump()
    data["expected_old_text"] = old
    data["expected_old_text_hash"] = action.expected_old_text_hash or sha256_hex(old)
    data["proposed_text"] = new
    data["new_text"] = new
    if action.precondition is not None:
        pre = action.precondition.model_dump()
        pre["old_text"] = old
        pre["old_text_sha256"] = pre.get("old_text_sha256") or sha256_hex(old)
        data["precondition"] = pre
    return ProposedAction.model_validate(data)
