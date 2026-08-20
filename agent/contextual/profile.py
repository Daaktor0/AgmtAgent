"""Internal execution-profile decision. The lawyer never selects this."""
from __future__ import annotations

from agent.schemas.command import ContextualCommand, ExecutionProfile


def choose_profile(command: ContextualCommand) -> ExecutionProfile:
    intent = command.interpreted_intent
    concerns = list((intent.concerns if intent else []) or [])
    constraints = list((intent.constraints if intent else []) or [])
    objective = (intent.objective if intent else "check")

    if objective in {"find_definition", "find_uses", "navigate"}:
        return "DETERMINISTIC"
    if objective == "draft" or "double-recovery" in concerns + constraints:
        # Double-recovery starts FOCUSED; escalate later if evidence fans out.
        return "FOCUSED"
    if objective in {"check", "compare", "explain"}:
        return "FOCUSED"
    return "FOCUSED"


def should_escalate_deep(
    *,
    evidence_count: int,
    overlap_refs: int,
    reviewer_challenged: bool,
    retrieval_conflict: bool,
) -> bool:
    if reviewer_challenged or retrieval_conflict:
        return True
    if evidence_count >= 8 or overlap_refs >= 6:
        return True
    return False
