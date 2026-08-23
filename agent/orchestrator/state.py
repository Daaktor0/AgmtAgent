"""Typed run state machine (plan §7.1 orchestrator/state.py).

Allowed transitions only; anything else raises InvalidTransition. The store's
free-form status strings are mapped onto this so old rows keep working.
"""

from __future__ import annotations

from enum import StrEnum


class RunState(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    REVIEWING = "reviewing"
    DONE = "done"
    PARTIAL = "partial"
    FAILED = "failed"
    CANCELLED = "cancelled"

    @classmethod
    def coerce(cls, value: str | None) -> "RunState | None":
        """Map legacy/free-form statuses onto the state machine."""
        if not value:
            return None
        v = value.strip().lower()
        try:
            return cls(v)
        except ValueError:
            legacy = {
                "complete": cls.DONE, "completed": cls.DONE, "ok": cls.DONE,
                "error": cls.FAILED, "aborted": cls.CANCELLED,
                "stop": cls.CANCELLED,
            }
            return legacy.get(v)


class InvalidTransition(RuntimeError):
    def __init__(self, current: RunState, target: RunState):
        self.current = current
        self.target = target
        super().__init__(f"cannot transition {current.value} -> {target.value}")


# Legal transitions.
TRANSITIONS: dict[RunState, frozenset[RunState]] = {
    RunState.PENDING:   frozenset({RunState.RUNNING, RunState.CANCELLED}),
    RunState.RUNNING:   frozenset({RunState.REVIEWING, RunState.DONE,
                                   RunState.PARTIAL, RunState.FAILED,
                                   RunState.CANCELLED}),
    RunState.REVIEWING: frozenset({RunState.DONE, RunState.PARTIAL,
                                   RunState.FAILED, RunState.CANCELLED}),
    # Terminal states accept no transitions.
    RunState.DONE:      frozenset(),
    RunState.PARTIAL:   frozenset(),
    RunState.FAILED:    frozenset(),
    RunState.CANCELLED: frozenset(),
}


def can_transition(current: RunState, target: RunState) -> bool:
    return target in TRANSITIONS.get(current, frozenset())


def transition(current: RunState, target: RunState) -> RunState:
    if not can_transition(current, target):
        raise InvalidTransition(current, target)
    return target


TERMINAL_STATES = frozenset({
    RunState.DONE, RunState.PARTIAL, RunState.FAILED, RunState.CANCELLED})
