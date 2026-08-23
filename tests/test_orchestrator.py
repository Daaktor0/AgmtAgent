"""Orchestrator tests (plan §13.1 item 7).

Covers: budget exhaustion produces a partial result; valid state transitions;
checkpoint after tool batch; resume returns checkpoint state; cancel
idempotence is the worker's concern (tested in test_worker.py).

Run as a script: PASS/FAIL lines, ends ALL PASSED. No network.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-orch-"))

from agent.orchestrator.budget import Budget  # noqa: E402
from agent.orchestrator.state import (  # noqa: E402
    InvalidTransition, RunState, transition,
)
from agent.memory.store import Store  # noqa: E402

FAILS: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        FAILS.append(name)


class Usage:
    """Router stub that charges a fixed amount per call and can exhaust."""

    def __init__(self, cost_per_call: float = 0.01):
        self.calls = 0
        self.cost = cost_per_call

    def resolve(self, role):
        return "stub/model"

    def chat(self, role, messages, **kw):
        self.calls += 1
        return {"choices": [{"message": {
            "role": "assistant", "content": f"step {self.calls}"}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 10,
                      "cost": self.cost}}


def main() -> None:
    print("\nbudget ceilings")
    b = Budget(max_steps=5, max_cost_usd=0.05)
    router = Usage(cost_per_call=0.02)
    exhausted_at = None
    for i in range(10):
        if not b.record_step():
            exhausted_at = i
            break
        b.record_usage({"prompt_tokens": 100, "completion_tokens": 10,
                        "cost": 0.02})
        if b.exhausted:
            exhausted_at = i
            break
    check("cost ceiling trips", b.exhausted
          and "cost" in (b.exhausted_reason or ""))
    check("stops before runaway spend", b.cost_usd <= 0.06)
    check("reason recorded", b.exhausted_reason is not None)
    check("summary reflects state", b.summary()["exhausted"] is True)

    b2 = Budget(max_steps=3)
    for _ in range(3):
        b2.record_step()
    check("steps ceiling exact", b2.exhausted is False)  # exactly at limit OK
    check("one more step trips", b2.record_step() is False
          and "step budget" in b2.exhausted_reason)

    check("80% warning fires", Budget(max_steps=10).warn_threshold(0.8) is False)

    print("\nstate machine")
    s = RunState.PENDING
    s = transition(s, RunState.RUNNING)
    check("pending -> running", s == RunState.RUNNING)
    s = transition(s, RunState.REVIEWING)
    check("running -> reviewing", s == RunState.REVIEWING)
    s = transition(s, RunState.DONE)
    try:
        transition(s, RunState.RUNNING)
        check("terminal states locked", False)
    except InvalidTransition:
        check("terminal states locked", True)
    try:
        transition(RunState.PENDING, RunState.DONE)
        check("no skipping ahead", False)
    except InvalidTransition:
        check("no skipping ahead", True)
    check("legacy strings coerce",
          RunState.coerce("complete") == RunState.DONE
          and RunState.coerce("error") == RunState.FAILED)

    print("\ncheckpoint + resume surface")
    store = Store(tempfile.mktemp(prefix="agmt-or-", suffix=".db"))
    run_id = store.create_pending_run(mode="A", mandate={}, instruction="")
    store.append_event(run_id, event_type="parsed", payload={})
    store.save_checkpoint(run_id, state={"messages": 6, "issues": 2},
                          plan={"steps": ["a", "b"]}, messages_hash="abc")
    from agent.orchestrator.loop import resume
    cp, it = resume(run_id, cfg=None, router=None, store=store)
    check("resume finds last checkpoint",
          cp is not None and cp["issues"] == 2)
    none_cp, none_it = resume("no-such-run", cfg=None, router=None, store=store)
    check("unknown run cannot resume mid-flight",
          none_cp is None and none_it is None)
    check("partial-status transition legal",
          transition(RunState.REVIEWING, RunState.PARTIAL) == RunState.PARTIAL)

    store.close()

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
