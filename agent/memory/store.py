"""SQLite persistence for runs, issues, dispositions and positions."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent

SCHEMA = """
CREATE TABLE IF NOT EXISTS run (
    id TEXT PRIMARY KEY,
    mode TEXT,
    mandate_json TEXT,
    instruction TEXT,
    status TEXT,
    started_at TEXT,
    ended_at TEXT,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    steps_used INTEGER DEFAULT 0,
    summary TEXT,
    plan_json TEXT
);

CREATE TABLE IF NOT EXISTS issue (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    local_id INTEGER,
    ref TEXT,
    block_idx INTEGER,
    title TEXT,
    classification TEXT,
    severity TEXT,
    position TEXT,
    consequence TEXT,
    old_text TEXT,
    new_text TEXT,
    comment TEXT,
    evidence_tier INTEGER,
    check_name TEXT,
    payload_json TEXT,
    FOREIGN KEY (run_id) REFERENCES run(id)
);

CREATE TABLE IF NOT EXISTS disposition (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL,
    action TEXT NOT NULL,
    final_text TEXT,
    note TEXT,
    decided_at TEXT NOT NULL,
    FOREIGN KEY (issue_id) REFERENCES issue(id)
);

CREATE TABLE IF NOT EXISTS position (
    id TEXT PRIMARY KEY,
    scope TEXT,
    scope_key TEXT,
    topic TEXT NOT NULL,
    statement TEXT,
    polarity TEXT,
    evidence_count INTEGER DEFAULT 1,
    confidence REAL DEFAULT 0,
    source_issue_ids_json TEXT,
    active INTEGER DEFAULT 0,
    created_at TEXT,
    last_reinforced_at TEXT,
    user_edited INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_issue_run ON issue(run_id);
CREATE INDEX IF NOT EXISTS idx_disp_issue ON disposition(issue_id);
CREATE INDEX IF NOT EXISTS idx_pos_topic ON position(topic);
"""


def default_db_path() -> Path:
    env = os.environ.get("AGMT_DB")
    if env:
        return Path(env)
    if os.environ.get("HOSTED") == "1":
        hosted = Path("/data/agmt.db")
        try:
            hosted.parent.mkdir(parents=True, exist_ok=True)
            return hosted
        except OSError:
            return Path("/tmp/agmt.db")
    path = ROOT / "data" / "agmt.db"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: Path | str | None = None):
        from .migrations import migrate  # local import avoids a cycle

        self.path = Path(path) if path is not None else default_db_path()
        if str(self.path) != ":memory:":
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()  # reentrant: repos nest calls
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            # PRAGMAs + ordered migration ledger; replaces the bare SCHEMA run.
            self._conn.execute("PRAGMA foreign_keys = ON")
            self._conn.execute("PRAGMA journal_mode = WAL")
            self._conn.execute("PRAGMA busy_timeout = 5000")
            if str(self.path) == ":memory:":
                # migrate() opens its own connection, which would target a
                # different database for :memory: — apply via this connection.
                from .migrations import MIGRATIONS, _apply_sql_idempotent, _checksum
                conn = self._conn
                conn.execute(
                    "CREATE TABLE IF NOT EXISTS schema_migration ("
                    "version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT,"
                    " checksum TEXT)")
                for mig in sorted(MIGRATIONS, key=lambda m: m.version):
                    row = conn.execute(
                        "SELECT checksum FROM schema_migration WHERE version=?",
                        (mig.version,)).fetchone()
                    if row is not None:
                        continue
                    with conn:
                        _apply_sql_idempotent(conn, mig)
                        conn.execute(
                            "INSERT INTO schema_migration (version, name,"
                            " applied_at, checksum) VALUES (?,?,?,?)",
                            (mig.version, mig.name, _now(), _checksum(mig)))
                        conn.execute(f"PRAGMA user_version = {mig.version}")
            else:
                migrate(self.path)
        self.schema_version = self._conn.execute("PRAGMA user_version").fetchone()[0]
        from .matters import MatterRepository
        self.matters = MatterRepository(self)

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def save_run(
        self,
        *,
        mode: str,
        mandate: dict,
        instruction: str,
        status: str,
        summary: str,
        issues: list[dict],
        usage: list[dict] | None = None,
        plan: dict | None = None,
        steps_used: int = 0,
        started_at: str | None = None,
    ) -> str:
        run_id = str(uuid.uuid4())
        tokens_in = 0
        tokens_out = 0
        cost = 0.0
        for row in usage or []:
            tokens_in += int(row.get("prompt_tokens") or row.get("tokens_in") or 0)
            tokens_out += int(row.get("completion_tokens") or row.get("tokens_out") or 0)
            cost += float(row.get("cost") or row.get("cost_usd") or 0)
        now = _now()
        with self._lock:
            self._conn.execute(
                "INSERT INTO run (id, mode, mandate_json, instruction, status, "
                "started_at, ended_at, tokens_in, tokens_out, cost_usd, "
                "steps_used, summary, plan_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (run_id, mode, json.dumps(mandate, ensure_ascii=False),
                 instruction, status, started_at or now, now, tokens_in,
                 tokens_out, cost, steps_used, summary,
                 json.dumps(plan, ensure_ascii=False) if plan else None),
            )
            for issue in issues:
                issue_id = issue.get("issue_id") or str(uuid.uuid4())
                issue["issue_id"] = issue_id
                self._conn.execute(
                    "INSERT INTO issue (id, run_id, local_id, ref, block_idx, title, "
                    "classification, severity, position, consequence, old_text, "
                    "new_text, comment, evidence_tier, check_name, payload_json) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        issue_id, run_id, issue.get("id"),
                        issue.get("ref") or "", issue.get("para"),
                        issue.get("title") or issue.get("detail") or "",
                        issue.get("classification") or "",
                        issue.get("severity") or "",
                        issue.get("position") or "",
                        issue.get("consequence") or "",
                        issue.get("old_text") or "",
                        issue.get("new_text") or "",
                        issue.get("comment") or "",
                        issue.get("evidence_tier"),
                        issue.get("check") or issue.get("_mechanical") or "",
                        json.dumps(issue, ensure_ascii=False),
                    ),
                )
            self._conn.commit()
        return run_id

    def create_pending_run(self, *, mode: str, mandate: dict,
                           instruction: str) -> str:
        """Pre-create a run row with status 'running' so events can attach
        before the run finishes. Returns the run id."""
        run_id = str(uuid.uuid4())
        now = _now()
        with self._lock:
            self._conn.execute(
                "INSERT INTO run (id, mode, mandate_json, instruction, status,"
                " started_at, ended_at) VALUES (?,?,?,?,?,?,?)",
                (run_id, mode, json.dumps(mandate, ensure_ascii=False),
                 instruction, "running", now, None))
            self._conn.commit()
        return run_id

    def finish_run(self, run_id: str, *, status: str, summary: str,
                   issues: list[dict], usage: list[dict] | None = None,
                   plan: dict | None = None, steps_used: int = 0) -> None:
        """Complete a pending run row created by create_pending_run."""
        tokens_in = tokens_out = 0
        cost = 0.0
        for row in usage or []:
            tokens_in += int(row.get("prompt_tokens") or row.get("tokens_in") or 0)
            tokens_out += int(row.get("completion_tokens") or row.get("tokens_out") or 0)
            cost += float(row.get("cost") or row.get("cost_usd") or 0)
        issue_ids = []
        with self._lock:
            self._conn.execute(
                "UPDATE run SET status = ?, ended_at = ?, tokens_in = ?,"
                " tokens_out = ?, cost_usd = ?, steps_used = ?, summary = ?,"
                " plan_json = ? WHERE id = ?",
                (status, _now(), tokens_in, tokens_out, cost, steps_used,
                 summary, json.dumps(plan or {}, ensure_ascii=False), run_id))
            for i in issues:
                iid = i.get("issue_id") or str(uuid.uuid4())
                i["issue_id"] = iid
                issue_ids.append(iid)
                self._conn.execute(
                    "INSERT INTO issue (id, run_id, local_id, ref, block_idx,"
                    " title, classification, severity, position, consequence,"
                    " old_text, new_text, comment, evidence_tier, check_name,"
                    " payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (iid, run_id, i.get("local_id"), i.get("ref"),
                     i.get("para"), i.get("title"), i.get("classification"),
                     i.get("severity"), i.get("position"), i.get("consequence"),
                     i.get("old_text"), i.get("new_text"), i.get("comment"),
                     i.get("evidence_tier"), i.get("check"),
                     json.dumps(i, ensure_ascii=False)))
            self._conn.commit()

    def get_issue(self, issue_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM issue WHERE id = ?", (issue_id,)
            ).fetchone()
        return dict(row) if row else None

    def get_run(self, run_id: str) -> dict | None:
        with self._lock:
            run = self._conn.execute(
                "SELECT * FROM run WHERE id = ?", (run_id,)
            ).fetchone()
            if not run:
                return None
            issues = self._conn.execute(
                "SELECT * FROM issue WHERE run_id = ? ORDER BY local_id",
                (run_id,),
            ).fetchall()
        out = dict(run)
        out["issues"] = [dict(i) for i in issues]
        return out

    def add_disposition(
        self, issue_id: str, action: str, final_text: str = "", note: str = "",
    ) -> str:
        disp_id = str(uuid.uuid4())
        with self._lock:
            self._conn.execute(
                "INSERT INTO disposition (id, issue_id, action, final_text, note, decided_at) "
                "VALUES (?,?,?,?,?,?)",
                (disp_id, issue_id, action, final_text, note, _now()),
            )
            self._conn.commit()
        return disp_id

    def list_dispositions(self, issue_id: str) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM disposition WHERE issue_id = ? ORDER BY decided_at",
                (issue_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    # --- run event / checkpoint repositories (plan commit 5) ---

    def append_event(self, run_id: str, *, event_type: str,
                     payload: dict | None = None, latency_ms: int | None = None,
                     tokens_in: int | None = None, tokens_out: int | None = None,
                     cost_usd: float | None = None) -> int:
        """Append one run_event; returns its sequence number."""
        with self._lock:
            row = self._conn.execute(
                "SELECT COALESCE(MAX(seq), 0) + 1 FROM run_event WHERE run_id = ?",
                (run_id,)).fetchone()
            seq = int(row[0])
            self._conn.execute(
                "INSERT INTO run_event (id, run_id, seq, ts, event_type,"
                " payload_json, latency_ms, tokens_in, tokens_out, cost_usd)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                (str(uuid.uuid4()), run_id, seq, _now(), event_type,
                 json.dumps(payload or {}, ensure_ascii=False), latency_ms,
                 tokens_in, tokens_out, cost_usd))
            self._conn.execute(
                "UPDATE run SET last_event_seq = ? WHERE id = ?", (seq, run_id))
            self._conn.commit()
        return seq

    def list_events(self, run_id: str, since_seq: int = 0) -> list[dict]:
        """Events in order; since_seq enables SSE resume without loss."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM run_event WHERE run_id = ? AND seq > ?"
                " ORDER BY seq", (run_id, since_seq)).fetchall()
        return [dict(r) for r in rows]

    def save_checkpoint(self, run_id: str, *, state: dict,
                        plan: dict | None = None,
                        messages_hash: str | None = None) -> str:
        cp_id = str(uuid.uuid4())
        with self._lock:
            row = self._conn.execute(
                "SELECT COALESCE(MAX(seq), 0) FROM run_checkpoint WHERE run_id = ?",
                (run_id,)).fetchone()
            self._conn.execute(
                "INSERT INTO run_checkpoint (id, run_id, seq, state_json,"
                " plan_json, messages_hash, created_at) VALUES (?,?,?,?,?,?,?)",
                (cp_id, run_id, int(row[0]) + 1,
                 json.dumps(state, ensure_ascii=False),
                 json.dumps(plan or {}, ensure_ascii=False),
                 messages_hash, _now()))
            self._conn.commit()
        return cp_id

    def latest_checkpoint(self, run_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM run_checkpoint WHERE run_id = ?"
                " ORDER BY seq DESC LIMIT 1", (run_id,)).fetchone()
        return dict(row) if row else None

    def set_run_status(self, run_id: str, status: str) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE run SET status = ? WHERE id = ?", (status, run_id))
            self._conn.commit()

    def find_position(
        self, topic: str, polarity: str, scope: str = "global",
        scope_key: str | None = None,
    ) -> dict | None:
        with self._lock:
            # scope_key participates in the lookup when provided (migration
            # 0006 fix: a house position for one matter must not be returned
            # for another). Legacy callers without scope_key keep old behaviour.
            if scope_key is not None:
                row = self._conn.execute(
                    "SELECT * FROM position WHERE topic = ? AND polarity = ? "
                    "AND scope = ? AND scope_key = ?",
                    (topic, polarity, scope, scope_key),
                ).fetchone()
            else:
                row = self._conn.execute(
                    "SELECT * FROM position WHERE topic = ? AND polarity = ? AND scope = ?",
                    (topic, polarity, scope),
                ).fetchone()
        return dict(row) if row else None

    def upsert_position(
        self,
        *,
        topic: str,
        polarity: str,
        statement: str,
        issue_id: str,
        scope: str = "global",
        scope_key: str = "",
    ) -> dict:
        existing = self.find_position(topic, polarity, scope, scope_key=scope_key)
        now = _now()
        with self._lock:
            if existing:
                ids = json.loads(existing["source_issue_ids_json"] or "[]")
                if issue_id not in ids:
                    ids.append(issue_id)
                count = int(existing["evidence_count"] or 0) + 1
                active = 1 if count >= 3 or existing["active"] else 0
                self._conn.execute(
                    "UPDATE position SET evidence_count = ?, source_issue_ids_json = ?, "
                    "last_reinforced_at = ?, active = ?, statement = ? WHERE id = ?",
                    (count, json.dumps(ids), now, active, statement, existing["id"]),
                )
                self._conn.commit()
                row = self._conn.execute(
                    "SELECT * FROM position WHERE id = ?", (existing["id"],)
                ).fetchone()
                return dict(row)
            pos_id = str(uuid.uuid4())
            self._conn.execute(
                "INSERT INTO position (id, scope, scope_key, topic, statement, polarity, "
                "evidence_count, confidence, source_issue_ids_json, active, created_at, "
                "last_reinforced_at, user_edited) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)",
                (pos_id, scope, scope_key, topic, statement, polarity, 1, 0.3,
                 json.dumps([issue_id]), 0, now, now),
            )
            self._conn.commit()
            row = self._conn.execute(
                "SELECT * FROM position WHERE id = ?", (pos_id,)
            ).fetchone()
            return dict(row)

    def active_positions(self, topic: str | None = None) -> list[dict]:
        with self._lock:
            if topic:
                needle = f"%{topic.lower()}%"
                rows = self._conn.execute(
                    "SELECT * FROM position WHERE active = 1 AND "
                    "(lower(topic) LIKE ? OR lower(statement) LIKE ?) "
                    "ORDER BY last_reinforced_at DESC",
                    (needle, needle),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT * FROM position WHERE active = 1 "
                    "ORDER BY last_reinforced_at DESC"
                ).fetchall()
        return [dict(r) for r in rows]


_STORE: Store | None = None
_STORE_LOCK = threading.Lock()


def get_store() -> Store:
    global _STORE
    with _STORE_LOCK:
        if _STORE is None:
            _STORE = Store()
        return _STORE
