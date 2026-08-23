"""Single-use action tickets, live revalidation, post-write verification.

Never silently finds the nearest similar clause.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from agent.schemas.action import ActionTicket, ApplyStatus, ProposedAction, fill_action_hashes
from agent.schemas.ids import new_id, sha256_hex, utc_now
from agent.schemas.snapshot import document_hash

TICKET_TTL_SECONDS = 300

_TICKETS: dict[str, ActionTicket] = {}
_ACTIONS: dict[str, ProposedAction] = {}


@dataclass
class LiveDocument:
    paragraphs: list[str]
    document_version_id: str
    version_hash: str = ""
    tracking_mode: Literal["off", "track_all", "track_mine"] = "off"
    protected: bool = False
    capabilities: set[str] = field(default_factory=lambda: {"track_changes", "search"})
    stories: dict[str, list[str]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.version_hash:
            self.version_hash = document_hash(self.paragraphs)

    def occurrences(self, text: str) -> list[tuple[str, int]]:
        hits: list[tuple[str, int]] = []
        for i, para in enumerate(self.paragraphs):
            start = 0
            while text and text in para[start:]:
                hits.append(("body", i))
                start = para.find(text, start) + max(1, len(text))
        for story, paras in (self.stories or {}).items():
            if story == "body":
                continue
            for i, para in enumerate(paras):
                if text and text in para:
                    hits.append((story, i))
        return hits


def reset_tickets() -> None:
    _TICKETS.clear()
    _ACTIONS.clear()


def _expired(ticket: ActionTicket, now: datetime | None = None) -> bool:
    now = now or datetime.now(timezone.utc)
    try:
        expiry = datetime.fromisoformat(ticket.expires_at)
    except ValueError:
        return True
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return now >= expiry


def refuse_reason(
    action: ProposedAction,
    live: LiveDocument,
    *,
    ticket: ActionTicket | None = None,
    now: datetime | None = None,
) -> str | None:
    action = fill_action_hashes(action)
    if live.protected:
        return "protected"
    if "track_changes" not in live.capabilities and action.operation in {
        "replace", "delete", "insert_before", "insert_after",
    }:
        return "capability_unavailable"
    expected_hash = ""
    if action.precondition:
        expected_hash = action.precondition.expected_doc_hash
    if expected_hash and live.version_hash != expected_hash:
        return "stale"
    if action.document_version_id and live.document_version_id != action.document_version_id:
        return "stale"
    old = action.expected_old_text
    if old:
        hits = live.occurrences(old)
        if not hits:
            return "stale"
        if len(hits) > 1:
            return "ambiguous_target"
        if sha256_hex(old) != (action.expected_old_text_hash or sha256_hex(old)):
            return "stale"
    if ticket is not None:
        # The ticket binds the exact live document it was prepared against.
        # Re-check at apply time: a document that changed between prepare and
        # apply must refuse, even if the target text itself still matches.
        if ticket.expected_doc_hash and live.version_hash != ticket.expected_doc_hash:
            return "stale"
        if live.document_version_id != ticket.document_version_id:
            return "stale"
        if ticket.consumed:
            return "replay"
        if _expired(ticket, now=now):
            return "expired"
    return None


def approve_action(action: ProposedAction, *, approved_at: str | None = None) -> ProposedAction:
    data = fill_action_hashes(action).model_dump()
    data["approved_at"] = approved_at or utc_now()
    stored = ProposedAction.model_validate(data)
    _ACTIONS[stored.action_id] = stored
    return stored


def prepare_ticket(action: ProposedAction, live: LiveDocument) -> tuple[ActionTicket | None, str | None]:
    if not action.approved_at:
        return None, "unapproved"
    reason = refuse_reason(action, live)
    if reason:
        return None, reason
    expires = datetime.now(timezone.utc) + timedelta(seconds=TICKET_TTL_SECONDS)
    ticket = ActionTicket(
        ticket_id=new_id(),
        action_id=action.action_id,
        document_version_id=live.document_version_id,
        expected_doc_hash=live.version_hash,
        expected_old_text=action.expected_old_text,
        expected_old_text_hash=action.expected_old_text_hash or sha256_hex(action.expected_old_text),
        proposed_text=action.proposed_text or action.new_text,
        operation=action.operation,  # type: ignore[arg-type]
        expires_at=expires.isoformat(timespec="seconds"),
        consumed=False,
        status="prepared",
    )
    _TICKETS[ticket.ticket_id] = ticket
    return ticket, None


def get_ticket(ticket_id: str) -> ActionTicket | None:
    return _TICKETS.get(ticket_id)


def consume_ticket(ticket_id: str) -> ActionTicket | None:
    ticket = _TICKETS.get(ticket_id)
    if ticket is None:
        return None
    data = ticket.model_dump()
    data["consumed"] = True
    data["consumed_at"] = utc_now()
    data["status"] = "consumed"
    updated = ActionTicket.model_validate(data)
    _TICKETS[ticket_id] = updated
    return updated


def verify_write(
    live_after: LiveDocument,
    ticket: ActionTicket,
    *,
    occurrence_count: int | None = None,
    tracking_present: bool | None = None,
    mutation_failed: bool = False,
) -> ApplyStatus:
    proposed = ticket.proposed_text
    old = ticket.expected_old_text
    if mutation_failed:
        return "failed_unknown"
    if ticket.operation == "replace" and proposed:
        if proposed not in "\n".join(live_after.paragraphs):
            # Write may have happened but we cannot prove it.
            if old and old not in "\n".join(live_after.paragraphs):
                return "failed_unknown"
            return "refused"
        if old and old in "\n".join(live_after.paragraphs) and old != proposed:
            # Old text still present as well — could be duplicate occurrence.
            if occurrence_count is None:
                hits = live_after.occurrences(proposed)
                if len(hits) != 1:
                    return "failed_unknown"
        if occurrence_count is not None and occurrence_count != 1:
            return "failed_unknown"
        if tracking_present is False:
            return "failed_unknown"
        return "confirmed"
    if ticket.operation == "delete":
        if old and old in "\n".join(live_after.paragraphs):
            return "failed_unknown"
        return "confirmed"
    if ticket.operation == "comment":
        return "confirmed"
    return "confirmed"


def apply_prepared(
    live: LiveDocument,
    ticket_id: str,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """In-memory apply used by tests and the server-side revalidation seam.

    Word hosts perform the real mutation. This refuses on the same predicates
    and never searches for a nearby similar clause.
    """
    ticket = _TICKETS.get(ticket_id)
    if ticket is None:
        return {"status": "refused", "reason": "missing_ticket"}
    stored = _ACTIONS.get(ticket.action_id)
    action = ProposedAction(
        action_id=ticket.action_id,
        document_version_id=ticket.document_version_id,
        operation=ticket.operation,  # type: ignore[arg-type]
        expected_old_text=ticket.expected_old_text,
        expected_old_text_hash=ticket.expected_old_text_hash,
        proposed_text=ticket.proposed_text,
        approved_at=(stored.approved_at if stored else utc_now()),
        precondition=stored.precondition if stored else None,
        evidence_ids=list(stored.evidence_ids) if stored else [],
    )
    if ticket.consumed:
        return {"status": "refused", "reason": "replay"}
    reason = refuse_reason(action, live, ticket=ticket, now=now)
    if reason:
        consume_ticket(ticket_id)
        return {"status": "refused", "reason": reason, "tracking_restored": True}

    consume_ticket(ticket_id)
    prior_mode = live.tracking_mode
    live.tracking_mode = "track_all"
    old = ticket.expected_old_text
    new = ticket.proposed_text
    replaced = 0
    if ticket.operation == "replace" and old:
        for i, para in enumerate(live.paragraphs):
            if old in para:
                live.paragraphs[i] = para.replace(old, new, 1)
                replaced += 1
                break
    elif ticket.operation == "delete" and old:
        for i, para in enumerate(live.paragraphs):
            if old in para:
                live.paragraphs[i] = para.replace(old, "", 1)
                replaced += 1
                break
    live.version_hash = document_hash(live.paragraphs)
    live.tracking_mode = prior_mode
    status = verify_write(
        live,
        ticket,
        occurrence_count=replaced,
        tracking_present=True,
        mutation_failed=replaced == 0,
    )
    return {
        "status": status,
        "reason": None if status == "confirmed" else status,
        "live_hash": live.version_hash,
        "tracking_restored": live.tracking_mode == prior_mode,
        "occurrences": replaced,
    }
