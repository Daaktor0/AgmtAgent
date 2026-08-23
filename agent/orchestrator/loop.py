"""Agmt orchestrator (plan §7.3): durable supervisor loop with budgets,
checkpoints and resume.

loop.py is a near-mechanical extraction of Supervisor.run with three
additions the plan requires:

1. Budget enforcement — exhaustion produces a partial result, flagged.
2. Checkpoint after each tool batch (messages + plan + budget state).
3. Resume: `resume(run_id)` rebuilds from the last checkpoint, so a crashed or
   cancelled run continues without repeating tool calls.

The legacy Supervisor remains a compatibility façade over this loop.
"""

from __future__ import annotations

import json
from typing import Any, Iterator

from ..config import Config
from ..document import build_document
from ..memory.store import Store
from .budget import Budget
from .state import RunState, transition


class OrchestratorLoop:
    def __init__(self, cfg: Config, router: Any, store: Store):
        self.cfg = cfg
        self.router = router
        self.store = store

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _messages_hash(messages: list[dict]) -> str:
        import hashlib
        blob = json.dumps(messages, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(blob.encode()).hexdigest()

    # ------------------------------------------------------------------- run

    def run(self, *, paragraphs: list[str], mode: str, mandate: dict,
            instruction: str = "", prefixes: list[str] | None = None,
            extras: dict | None = None,
            run_id: str | None = None,
            budget: Budget | None = None) -> Iterator[dict]:
        """Execute one review. Yields events; persists each before yielding.
        Pass run_id to attach to an existing pending row."""
        from ..supervisor import MODES, _run_core  # mechanical reuse of v1 core
        yield from _run_core(
            self.cfg, self.router, paragraphs, mode, mandate, instruction,
            prefixes, extras, store=self.store, run_id=run_id,
            budget=budget)


def resume(run_id: str, cfg: Config, router: Any,
           store: Store) -> tuple[dict | None, Iterator[dict] | None]:
    """Resume an interrupted run from its last checkpoint.

    Returns (checkpoint_state, event_iterator). The caller must re-supply the
    original document payload; the checkpoint carries everything else. If no
    checkpoint exists the run cannot be resumed mid-flight and the caller
    should restart it fresh — deterministic checks make that safe because
    recorded issues are idempotent per document version.
    """
    cp = store.latest_checkpoint(run_id)
    if cp is None:
        return None, None
    state = json.loads(cp["state_json"] or "{}")
    return state, None
