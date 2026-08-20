"""Command capture, idempotency and in-process ledger."""
from __future__ import annotations

from typing import Any

from agent.contextual.interpreter import interpret
from agent.schemas.command import ContextualCommand, RawInput
from agent.schemas.ids import new_id, utc_now
from agent.schemas.selection import SelectionAnchor, SelectionEnvelope, envelope_to_anchor

_COMMANDS: dict[str, ContextualCommand] = {}
_BY_IDEMPOTENCY: dict[str, str] = {}


def capture_command(
    *,
    matter_id: str,
    document_id: str,
    document_version_id: str,
    raw_text: str,
    selection: SelectionAnchor | SelectionEnvelope | dict | None = None,
    modality: str = "text",
    activation: str = "typed",
    idempotency_key: str = "",
    provenance: dict[str, Any] | None = None,
    parent_command_id: str | None = None,
    chosen_ref_ids: list[str] | None = None,
) -> ContextualCommand:
    key = idempotency_key or ""
    if key and key in _BY_IDEMPOTENCY:
        existing = _COMMANDS[_BY_IDEMPOTENCY[key]]
        if chosen_ref_ids:
            existing = existing.model_copy(update={"chosen_ref_ids": list(chosen_ref_ids)})
            _COMMANDS[existing.command_id] = existing
        return existing

    if isinstance(selection, SelectionEnvelope):
        anchor = envelope_to_anchor(selection)
    elif isinstance(selection, SelectionAnchor):
        anchor = selection
    elif isinstance(selection, dict):
        if "selected_text_hash" in selection and "selected_text_sha256" not in selection:
            selection = {**selection, "selected_text_sha256": selection["selected_text_hash"]}
        if "story" in selection and "story_type" not in selection:
            from agent.schemas.selection import _STORY_TO_TYPE
            selection = {
                **selection,
                "story_type": _STORY_TO_TYPE.get(selection.get("story") or "body", "main"),
            }
        try:
            anchor = SelectionAnchor.model_validate(selection)
        except Exception:
            env = SelectionEnvelope.model_validate(selection)
            anchor = envelope_to_anchor(env)
    else:
        anchor = None

    raw = RawInput(
        modality=modality,  # type: ignore[arg-type]
        activation=activation,  # type: ignore[arg-type]
        raw_text=raw_text,
        audio_retained=False,
    )
    intent, mentions = interpret(raw)
    command = ContextualCommand(
        command_id=new_id(),
        parent_command_id=parent_command_id,
        matter_id=matter_id,
        document_id=document_id,
        document_version_id=document_version_id,
        selection=anchor,
        raw_input=raw,
        interpreted_intent=intent,
        mentions=mentions,
        status="received",
        provenance=dict(provenance or {}),
        idempotency_key=key,
        created_at=utc_now(),
        chosen_ref_ids=list(chosen_ref_ids or []),
    )
    _COMMANDS[command.command_id] = command
    if key:
        _BY_IDEMPOTENCY[key] = command.command_id
    return command


def put_command(command: ContextualCommand) -> ContextualCommand:
    _COMMANDS[command.command_id] = command
    if command.idempotency_key:
        _BY_IDEMPOTENCY[command.idempotency_key] = command.command_id
    return command


def get_command(command_id: str) -> ContextualCommand | None:
    return _COMMANDS.get(command_id)


def reset_commands() -> None:
    _COMMANDS.clear()
    _BY_IDEMPOTENCY.clear()
