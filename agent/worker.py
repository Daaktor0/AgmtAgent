"""Durable background run worker (plan commit 17).

A single-worker in-process queue backed by the SQLite store. Runs are created
as `running` rows before any model call; every event is persisted before it is
streamed; a client that disconnects and reconnects replays from
/api/runs/{id}/events?since=N without duplicate tool calls.

Cancellation is cooperative: the worker checks a cancel flag between steps and
marks the run `cancelled`. A crashed process leaves runs `running` with a stale
lease — recover_stale() reaps them to `failed` at startup.
"""

from __future__ import annotations

import queue
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from .memory.store import Store, get_store


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class RunWorker:
    def __init__(self, store: Store | None = None,
                 supervisor_factory: Callable[[], Any] = None,
                 *, num_workers: int = 1):
        # The supervisor persists events through the process-wide store
        # singleton; the worker reads through the same instance.
        self._store = store if store is not None else get_store()
        self._supervisor_factory = supervisor_factory
        self._queue: queue.Queue = queue.Queue()
        self._cancel_flags: dict[str, threading.Event] = {}
        self._workers = [
            threading.Thread(target=self._loop, daemon=True,
                             name=f"agmt-run-{i}")
            for i in range(num_workers)
        ]
        for w in self._workers:
            w.start()

    # ------------------------------------------------------------------ API

    def submit(self, *, mode: str, mandate: dict, instruction: str,
               paragraphs: list[str], prefixes: list[str] | None = None,
               extras: dict | None = None) -> str:
        """Create a durable run row and enqueue it. Returns the run id."""
        run_id = self._store.create_pending_run(
            mode=mode, mandate=mandate, instruction=instruction)
        self._cancel_flags[run_id] = threading.Event()
        self._queue.put((run_id, mode, mandate, instruction,
                         paragraphs, prefixes, extras))
        return run_id

    def cancel(self, run_id: str) -> bool:
        flag = self._cancel_flags.get(run_id)
        if flag is not None:
            flag.set()
            return True
        return False

    def status(self, run_id: str) -> dict | None:
        run = self._store.get_run(run_id)
        if run is None:
            return None
        return {"run_id": run_id, "status": run["status"],
                "last_event_seq": run["last_event_seq"] or 0}

    def recover_stale(self, *, lease_minutes: int = 15) -> list[str]:
        """Mark runs stuck in 'running' with an expired lease as failed.
        Called at startup so a crash never leaves phantom runs."""
        cutoff = (datetime.now(timezone.utc)
                  - timedelta(minutes=lease_minutes)).isoformat(timespec="seconds")
        with self._store._lock:
            rows = self._store._conn.execute(
                "SELECT id FROM run WHERE status='running' AND started_at < ?",
                (cutoff,)).fetchall()
            for row in rows:
                self._store._conn.execute(
                    "UPDATE run SET status='failed', ended_at=? WHERE id=?",
                    (_now(), row["id"]))
            self._store._conn.commit()
        return [r["id"] for r in rows]

    # -------------------------------------------------------------- worker

    def _loop(self) -> None:
        while True:
            item = self._queue.get()
            if item is None:
                break
            run_id, mode, mandate, instruction, paragraphs, prefixes, extras = item
            flag = self._cancel_flags[run_id]
            try:
                supervisor = self._supervisor_factory()
                for event in supervisor.run(
                        paragraphs, mode, mandate, instruction,
                        prefixes=prefixes, extras=extras, run_id=run_id):
                    if flag.is_set():
                        self._store.append_event(run_id, event_type="cancelled",
                                                 payload={"by": "user"})
                        self._store.set_run_status(run_id, "cancelled")
                        break
                    # Supervisor.run persists each event itself before yielding;
                    # here we just forward to SSE consumers via the wait loop.
                    self._notify(run_id)
                else:
                    if not flag.is_set():
                        self._store.set_run_status(run_id, "done")
            except Exception as exc:  # noqa: BLE001 — worker must survive
                try:
                    self._store.append_event(run_id, event_type="error",
                                             payload={"error": repr(exc)})
                    self._store.set_run_status(run_id, "failed")
                except Exception:
                    pass
            finally:
                self._notify(run_id)

    # ------------------------------------------------------------- waiting

    def _notify(self, run_id: str) -> None:
        with self._cond:
            self._cond.notify_all()

    @property
    def _cond(self):
        if not hasattr(self, "_condition"):
            self._condition = threading.Condition()
        return self._condition

    def wait_for_events(self, run_id: str, since_seq: int, timeout: float = 5.0
                        ) -> list[dict]:
        """Poll-and-wait: returns new events since_seq, blocking briefly so
        SSE endpoints can long-poll without busy looping."""
        events = self._store.list_events(run_id, since_seq=since_seq)
        if events:
            return events
        with self._cond:
            self._cond.wait(timeout)
        return self._store.list_events(run_id, since_seq=since_seq)
