"""Typed contracts for the golden vertical slice.

Field names follow v2 plan §§5.2–5.4. SelectionEnvelope is the Word capture
object; it converts to SelectionAnchor for the command record.
"""
from .action import ActionPrecondition, ActionTicket, ProposedAction
from .command import (
    ContextualCommand,
    IntentSpec,
    RawInput,
    ReferenceCandidate,
    ReferenceMention,
    ResolvedReference,
)
from .evidence import Evidence, IssueRecord, Provenance
from .ids import new_id, sha256_hex, utc_now
from .selection import SelectionAnchor, SelectionEnvelope, envelope_to_anchor
from .snapshot import DocumentSnapshot, DocumentVersion

__all__ = [
    "ActionPrecondition",
    "ActionTicket",
    "ContextualCommand",
    "DocumentSnapshot",
    "DocumentVersion",
    "Evidence",
    "IntentSpec",
    "IssueRecord",
    "ProposedAction",
    "Provenance",
    "RawInput",
    "ReferenceCandidate",
    "ReferenceMention",
    "ResolvedReference",
    "SelectionAnchor",
    "SelectionEnvelope",
    "envelope_to_anchor",
    "new_id",
    "sha256_hex",
    "utc_now",
]
