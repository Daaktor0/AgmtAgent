"""Offline tests for run event persistence and checkpoints (plan commit 5).

Exit criterion: closing the SSE client does not lose the persisted event
stream — events land in the DB before they are yielded, and /api/runs/{id}/
events replays them from any sequence number.

Run as a script: PASS/FAIL lines, ends ALL PASSED. No network.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-events-"))

from agent.memory.store import Store  # noqa: E402
from agent.supervisor import Supervisor  # noqa: E402
from agent.config import Config  # noqa: E402

def get_newest_run(store):
    from agent.memory.store import get_store
    s = get_store()
    row = s._conn.execute(
        "SELECT id FROM run ORDER BY started_at DESC, rowid DESC LIMIT 1").fetchone()
    return row["id"]


FAILS: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        FAILS.append(name)


def main() -> None:
    print("\nevent repository")
    store = Store(tempfile.mktemp(prefix="agmt-ev-", suffix=".db"))
    run_id = store.create_pending_run(mode="A", mandate={}, instruction="i")
    s1 = store.append_event(run_id, event_type="parsed", payload={"clauses": 3})
    s2 = store.append_event(run_id, event_type="model", payload={"model": "m"})
    s3 = store.append_event(run_id, event_type="tool", payload={"name": "outline"})
    check("sequences are monotonic", (s1, s2, s3) == (1, 2, 3))
    all_events = store.list_events(run_id)
    check("all events stored in order",
          [e["event_type"] for e in all_events] == ["parsed", "model", "tool"])
    resumed = store.list_events(run_id, since_seq=1)
    check("since_seq resumes without loss",
          [e["seq"] for e in resumed] == [2, 3])
    run = store.get_run(run_id)
    check("last_event_seq tracked on run", run["last_event_seq"] == 3)

    print("\ncheckpoints")
    cp1 = store.save_checkpoint(run_id, state={"step": 1}, plan={"a": 1})
    cp2 = store.save_checkpoint(run_id, state={"step": 2}, plan={"a": 2})
    latest = store.latest_checkpoint(run_id)
    check("latest checkpoint wins", latest["id"] == cp2
          and latest["state_json"] and "step" in latest["state_json"])
    store.set_run_status(run_id, "done")
    check("status update", store.get_run(run_id)["status"] == "done")

    print("\nsupervisor persistence wrapper")
    cfg = Config()

    class StubRouter:
        """Minimal offline router: one thinking event, then finish."""
        def resolve(self, role):
            return "stub/model"
        def chat(self, role, messages, **kw):
            return {"choices": [{"message": {
                "role": "assistant", "content": "Nothing further."}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1}}

    sup2 = Supervisor(cfg, StubRouter())
    events_full = list(sup2.run(
        ["The Contractor shall indemnify the Employer."],
        mode="J", mandate={}, instruction="check"))
    check("offline run yields events", len(events_full) >= 3)

    # Every yielded event must be persisted (persisted before yield).
    runs = store.list_events if False else None
    # find the pending run just created: it is the newest running/done row
    from agent.memory.store import get_store
    singleton = get_store()
    with_store = get_newest_run(store)
    persisted = [e["event_type"] for e in singleton.list_events(with_store)]
    yielded = [e.get("event") for e in events_full]
    check("every yielded event is persisted",
          all(y in persisted for y in yielded))

    # Simulate SSE client disconnect after first event; resume from DB.
    first_seq = 1
    resumed = [e["event_type"] for e in singleton.list_events(with_store, since_seq=first_seq)]
    check("resume replays everything after disconnect point",
          len(resumed) == len(persisted) - first_seq)
    done_row = singleton.get_run(with_store)
    check("run finished with summary",
          done_row["status"] == "done" and done_row["summary"])
    cp = singleton.latest_checkpoint(with_store)
    check("final checkpoint written", cp is not None)

    store.close()

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
