"""Durable async run worker tests (plan commit 17).

Exit criteria: pane close / service restart / reconnect recover a run without
duplicate tool calls; cancellation is cooperative; stale runs are reaped.

Run as a script: PASS/FAIL lines, ends ALL PASSED. No network.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-worker-"))

from agent.config import Config  # noqa: E402
from agent.supervisor import Supervisor  # noqa: E402
from agent.memory.store import get_store  # noqa: E402
from agent.worker import RunWorker  # noqa: E402

FAILS: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        FAILS.append(name)


class StubRouter:
    def __init__(self, calls: list):
        self.calls = calls

    def resolve(self, role):
        return "stub/model"

    def chat(self, role, messages, **kw):
        self.calls.append(1)
        return {"choices": [{"message": {
            "role": "assistant", "content": "Nothing further."}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1}}


PARAS = ["CLAUSE 9. Indemnity",
         "The Contractor shall indemnify the Employer."]


def main() -> None:
    print("\nworker lifecycle")
    os.environ["AGMT_DB"] = tempfile.mktemp(prefix="agmt-w-", suffix=".db")
    store = get_store()
    calls: list = []
    worker = RunWorker(store, lambda: Supervisor(Config(), StubRouter(calls)))

    run_id = worker.submit(mode="J", mandate={}, instruction="check",
                           paragraphs=PARAS)
    deadline = time.time() + 10
    status = None
    while time.time() < deadline:
        status = worker.status(run_id)
        if status and status["status"] in {"done", "failed", "cancelled"}:
            break
        time.sleep(0.1)
    check("run completes", status and status["status"] == "done")
    check("exactly one model call (no duplicate tool calls)", len(calls) == 1)

    events = store.list_events(run_id)
    check("full event stream persisted", len(events) >= 4)
    check("events have monotonic seq",
          [e["seq"] for e in events] == list(range(1, len(events) + 1)))

    print("\nreconnect replay")
    mid = len(events) // 2
    resumed = store.list_events(run_id, since_seq=mid)
    check("replay from mid-stream loses nothing",
          len(resumed) == len(events) - mid
          and resumed[0]["seq"] == mid + 1)

    print("\ncancellation")
    calls2: list = []

    class SlowRouter(StubRouter):
        def chat(self, role, messages, **kw):
            calls2.append(1)
            time.sleep(0.3)
            return super().chat(role, messages, **kw)

    worker2 = RunWorker(store, lambda: Supervisor(Config(), SlowRouter(calls2)))
    long_paras = PARAS * 1
    rid2 = worker2.submit(mode="A", mandate={}, instruction="full review",
                          paragraphs=long_paras)
    time.sleep(0.15)
    worker2.cancel(rid2)
    deadline = time.time() + 10
    st = None
    while time.time() < deadline:
        st = worker2.status(rid2)
        if st and st["status"] in {"done", "failed", "cancelled"}:
            break
        time.sleep(0.1)
    check("cancel is honoured", st and st["status"] == "cancelled")

    print("\nstale reaper")
    with store._lock:
        store._conn.execute(
            "UPDATE run SET status='running',"
            " started_at='2020-01-01T00:00:00+00:00' WHERE id=?", (run_id,))
        store._conn.commit()
    reaped = worker.recover_stale(lease_minutes=15)
    check("stale running run reaped to failed", run_id in reaped
          and store.get_run(run_id)["status"] == "failed")
    check("completed runs untouched",
          store.get_run(rid2)["status"] == "cancelled")

    store.close()

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
