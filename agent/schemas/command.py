"""ContextualCommand and reference types — plan §5.3."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from .selection import SelectionAnchor

Modality = Literal["voice", "text", "context_menu", "ribbon", "palette"]
Activation = Literal[
    "hold_to_talk", "click", "keyboard_shortcut", "context_menu", "ribbon", "typed",
]
Objective = Literal[
    "explain", "check", "compare", "find_uses", "find_definition",
    "draft", "comment", "navigate", "delete_everywhere", "summarise",
]
RequestedOutput = Literal[
    "answer", "issues", "minimum_amendment", "bubble_comment",
    "tracked_change", "locations", "comparison",
]
MentionCategory = Literal[
    "selection", "relative_clause", "heading", "definition",
    "concept", "party", "document", "unknown",
]
ResolverKind = Literal[
    "selection", "exact", "definition_index", "outline", "concept_search", "model_choice",
]
ReferenceStatus = Literal["resolved", "ambiguous", "not_found"]
CommandStatus = Literal[
    "received", "interpreting", "ambiguous", "ready", "running",
    "waiting_user", "completed", "cancelled", "failed", "stale",
]
ExecutionProfile = Literal["DETERMINISTIC", "FOCUSED", "DEEP"]


class RawInput(BaseModel):
    modality: Modality = "text"
    activation: Activation = "typed"
    raw_text: str
    partial_text: list[str] = Field(default_factory=list)
    language: str = "en"
    stt_engine: str | None = None
    stt_confidence: float | None = None
    audio_retained: bool = False


class IntentSpec(BaseModel):
    objective: Objective
    requested_output: RequestedOutput
    constraints: list[str] = Field(default_factory=list)
    party_scope: str | None = None
    urgency: Literal["normal", "fast", "high_risk"] = "normal"
    confidence: float = 0.0
    action: Literal["analyse", "explain", "find", "compare", "draft"] | None = None
    target_concepts: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)


class ReferenceMention(BaseModel):
    mention_id: str
    text: str
    category: MentionCategory
    start: int
    end: int


class ReferenceCandidate(BaseModel):
    ref_id: str
    label: str
    document_id: str
    document_version_id: str
    block_ids: list[str] = Field(default_factory=list)
    clause_ref: str | None = None
    score: float
    resolver: ResolverKind
    para: int | None = None
    heading: str = ""
    excerpt: str = ""


class ResolvedReference(BaseModel):
    mention_id: str
    status: ReferenceStatus
    candidate: ReferenceCandidate | None = None
    alternatives: list[ReferenceCandidate] = Field(default_factory=list)
    reason: str = ""


class ContextualCommand(BaseModel):
    command_id: str
    parent_command_id: str | None = None
    matter_id: str
    document_id: str
    document_version_id: str
    selection: SelectionAnchor | None = None
    context_refs: list[ReferenceCandidate] = Field(default_factory=list)
    raw_input: RawInput
    interpreted_intent: IntentSpec | None = None
    mentions: list[ReferenceMention] = Field(default_factory=list)
    references: list[ResolvedReference] = Field(default_factory=list)
    status: CommandStatus = "received"
    provenance: dict[str, Any] = Field(default_factory=dict)
    run_id: str | None = None
    idempotency_key: str = ""
    created_at: str = ""
    execution_profile: ExecutionProfile | None = None
    chosen_ref_ids: list[str] = Field(default_factory=list)
