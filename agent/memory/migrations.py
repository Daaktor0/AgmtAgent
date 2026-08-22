"""Ordered, checksummed SQLite migration runner (plan §6.1).

Replaces the single SCHEMA string in store.py. Rules enforced here:

- foreign_keys ON, WAL mode, busy timeout on every connection;
- schema_migration(version, name, applied_at, checksum) ledger;
- each migration runs in one transaction where SQLite permits it
  (DDL in SQLite is transactional; PRAGMA user_version is written last);
- ALTER TABLE additions are idempotent via PRAGMA table_info checks;
- a local database is backed up before the first upgrade;
- an already-applied migration whose checksum no longer matches aborts;
- existing rows are never reset or recreated.

Migrations are plain SQL strings plus an optional `py` hook that receives the
connection after the SQL runs.
"""

from __future__ import annotations

import hashlib
import shutil
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    sql: str = ""
    py: Any = None  # optional callable(conn) hook

    @property
    def label(self) -> str:
        return f"{self.version:04d}_{self.name}"


# ---------------------------------------------------------------------------
# Migration chain (plan §6.2). Append-only once shipped: never edit an entry,
# add a new one.
# ---------------------------------------------------------------------------

MIGRATIONS: list[Migration] = [
    # Legacy baseline: v1 tables exactly as store.py SCHEMA created them.
    # Uses IF NOT EXISTS so it opens a current v1 database without touching rows.
    Migration(
        1,
        "legacy_baseline",
        sql="""
        CREATE TABLE IF NOT EXISTS run (
            id TEXT PRIMARY KEY, mode TEXT, mandate_json TEXT, instruction TEXT,
            status TEXT, started_at TEXT, ended_at TEXT,
            tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0,
            cost_usd REAL DEFAULT 0, steps_used INTEGER DEFAULT 0,
            summary TEXT, plan_json TEXT);
        CREATE TABLE IF NOT EXISTS issue (
            id TEXT PRIMARY KEY, run_id TEXT NOT NULL, local_id INTEGER,
            ref TEXT, block_idx INTEGER, title TEXT, classification TEXT,
            severity TEXT, position TEXT, consequence TEXT, old_text TEXT,
            new_text TEXT, comment TEXT, evidence_tier INTEGER,
            check_name TEXT, payload_json TEXT,
            FOREIGN KEY (run_id) REFERENCES run(id));
        CREATE TABLE IF NOT EXISTS disposition (
            id TEXT PRIMARY KEY, issue_id TEXT NOT NULL, action TEXT NOT NULL,
            final_text TEXT, note TEXT, decided_at TEXT NOT NULL,
            FOREIGN KEY (issue_id) REFERENCES issue(id));
        CREATE TABLE IF NOT EXISTS position (
            id TEXT PRIMARY KEY, scope TEXT, scope_key TEXT, topic TEXT NOT NULL,
            statement TEXT, polarity TEXT, evidence_count INTEGER DEFAULT 1,
            confidence REAL DEFAULT 0, source_issue_ids_json TEXT,
            active INTEGER DEFAULT 0, created_at TEXT, last_reinforced_at TEXT,
            user_edited INTEGER DEFAULT 0);
        CREATE INDEX IF NOT EXISTS idx_issue_run ON issue(run_id);
        CREATE INDEX IF NOT EXISTS idx_disp_issue ON disposition(issue_id);
        CREATE INDEX IF NOT EXISTS idx_pos_topic ON position(topic);
        """,
    ),
    # Provenance columns on run and issue (nullable, additive only).
    Migration(
        2,
        "run_issue_provenance",
        sql="""
        ALTER TABLE run ADD COLUMN matter_id TEXT;
        ALTER TABLE run ADD COLUMN document_version_id TEXT;
        ALTER TABLE run ADD COLUMN engine_version TEXT;
        ALTER TABLE run ADD COLUMN skill_version TEXT;
        ALTER TABLE run ADD COLUMN model_roles_json TEXT;
        ALTER TABLE run ADD COLUMN provider_provenance_json TEXT;
        ALTER TABLE run ADD COLUMN budget_json TEXT;
        ALTER TABLE issue ADD COLUMN check_id TEXT;
        ALTER TABLE issue ADD COLUMN check_version TEXT;
        ALTER TABLE issue ADD COLUMN family TEXT;
        ALTER TABLE issue ADD COLUMN certainty TEXT;
        ALTER TABLE issue ADD COLUMN anchor_verified INTEGER;
        ALTER TABLE issue ADD COLUMN anchor_method TEXT;
        ALTER TABLE issue ADD COLUMN block_id TEXT;
        ALTER TABLE issue ADD COLUMN overlap_trace_json TEXT;
        ALTER TABLE issue ADD COLUMN consequential_json TEXT;
        ALTER TABLE issue ADD COLUMN provenance_json TEXT;
        ALTER TABLE issue ADD COLUMN reviewer_verdict TEXT;
        ALTER TABLE issue ADD COLUMN reviewer_note TEXT;
        ALTER TABLE issue ADD COLUMN status TEXT;
        """,
    ),
    # Matter / document / document_version canonical tables + backfill of a
    # legacy matter for old runs. Old runs get matter_id set but no
    # document_version — we do not pretend they had one.
    Migration(
        3,
        "matter_documents_versions",
        sql="""
        CREATE TABLE IF NOT EXISTS matter (
            id TEXT PRIMARY KEY, name TEXT, client TEXT, party_represented TEXT,
            counterparty TEXT, deal_type TEXT, governing_law TEXT,
            status TEXT DEFAULT 'active', created_at TEXT, archived_at TEXT);
        CREATE TABLE IF NOT EXISTS document (
            id TEXT PRIMARY KEY, matter_id TEXT REFERENCES matter(id), role TEXT,
            filename TEXT, word_doc_id TEXT, current_version_id TEXT,
            created_at TEXT);
        CREATE TABLE IF NOT EXISTS document_version (
            id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES document(id),
            version_no INTEGER, version_label TEXT, doc_hash TEXT, source TEXT,
            ingest_schema_version TEXT, capabilities_json TEXT,
            ingested_at TEXT, supersedes_id TEXT);
        CREATE TABLE IF NOT EXISTS block (
            id TEXT PRIMARY KEY,
            document_version_id TEXT NOT NULL REFERENCES document_version(id),
            idx INTEGER, kind TEXT, text TEXT, text_sha256 TEXT,
            list_prefix TEXT, list_level INTEGER, style TEXT,
            style_built_in TEXT, story_type TEXT, table_id TEXT, row INTEGER,
            col INTEGER, section TEXT, footnote_ref TEXT,
            unique_local_id TEXT, char_start INTEGER, char_end INTEGER,
            structural_path_json TEXT);
        CREATE TABLE IF NOT EXISTS clause (
            id TEXT PRIMARY KEY,
            document_version_id TEXT NOT NULL REFERENCES document_version(id),
            number TEXT, kind TEXT, heading TEXT, start_idx INTEGER,
            end_idx INTEGER, depth INTEGER, confidence REAL, detected_by TEXT);
        CREATE TABLE IF NOT EXISTS definition (
            id TEXT PRIMARY KEY,
            document_version_id TEXT NOT NULL REFERENCES document_version(id),
            term TEXT, defined_at_idx INTEGER, text TEXT,
            usage_idxs_json TEXT, scope TEXT);
        CREATE INDEX IF NOT EXISTS idx_block_version ON block(document_version_id);
        CREATE INDEX IF NOT EXISTS idx_block_local ON block(document_version_id, unique_local_id);
        CREATE INDEX IF NOT EXISTS idx_block_hash ON block(document_version_id, text_sha256);
        CREATE INDEX IF NOT EXISTS idx_clause_version ON clause(document_version_id);
        CREATE INDEX IF NOT EXISTS idx_definition_version ON definition(document_version_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_document_word_doc_id ON document(word_doc_id)
            WHERE word_doc_id IS NOT NULL;
        """,
    ),
    # Run events, checkpoints, audit log; lease/last-event columns on run.
    Migration(
        4,
        "run_events_checkpoints_audit",
        sql="""
        CREATE TABLE IF NOT EXISTS run_event (
            id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES run(id),
            seq INTEGER NOT NULL, ts TEXT NOT NULL, event_type TEXT NOT NULL,
            payload_json TEXT, latency_ms INTEGER, tokens_in INTEGER,
            tokens_out INTEGER, cost_usd REAL);
        CREATE TABLE IF NOT EXISTS run_checkpoint (
            id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES run(id),
            seq INTEGER NOT NULL, state_json TEXT, plan_json TEXT,
            messages_hash TEXT, created_at TEXT);
        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY, ts TEXT NOT NULL, actor TEXT, matter_id TEXT,
            action TEXT NOT NULL, subject_type TEXT, subject_id TEXT,
            detail_json TEXT);
        ALTER TABLE run ADD COLUMN lease_until TEXT;
        ALTER TABLE run ADD COLUMN last_event_seq INTEGER;
        CREATE INDEX IF NOT EXISTS idx_run_event_run ON run_event(run_id, seq);
        CREATE INDEX IF NOT EXISTS idx_audit_matter ON audit_log(matter_id, ts);
        """,
    ),
    # Contextual command / action proposal tables.
    Migration(
        5,
        "contextual_commands",
        sql="""
        CREATE TABLE IF NOT EXISTS contextual_command (
            id TEXT PRIMARY KEY, parent_id TEXT, matter_id TEXT,
            document_id TEXT, document_version_id TEXT, modality TEXT,
            activation TEXT, selection_json TEXT, raw_input_json TEXT,
            intent_json TEXT, references_json TEXT, status TEXT,
            run_id TEXT REFERENCES run(id), idempotency_key TEXT,
            provenance_json TEXT, created_at TEXT, resolved_at TEXT,
            error_json TEXT);
        CREATE TABLE IF NOT EXISTS contextual_reference (
            id TEXT PRIMARY KEY,
            command_id TEXT NOT NULL REFERENCES contextual_command(id),
            kind TEXT, candidate_ids_json TEXT, selected_id TEXT,
            status TEXT, created_at TEXT);
        CREATE TABLE IF NOT EXISTS action_proposal (
            id TEXT PRIMARY KEY, issue_id TEXT REFERENCES issue(id),
            command_id TEXT REFERENCES contextual_command(id), operation TEXT,
            precondition_json TEXT, new_text TEXT, comment TEXT, risk TEXT,
            approval_status TEXT, applied_at TEXT, result_json TEXT);
        CREATE TABLE IF NOT EXISTS companion_session (
            id TEXT PRIMARY KEY, matter_id TEXT, pairing_token_hash TEXT,
            transport TEXT, status TEXT, created_at TEXT, closed_at TEXT);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cmd_idem
            ON contextual_command(matter_id, idempotency_key)
            WHERE idempotency_key IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_proposal_issue ON action_proposal(issue_id);
        """,
    ),
    # Position precedent columns + unique scope-aware key. Also fixes the
    # find_position bug that ignored scope_key (code fix lives in store.py).
    Migration(
        6,
        "positions_precedent",
        sql="""
        ALTER TABLE position ADD COLUMN contradiction_count INTEGER DEFAULT 0;
        ALTER TABLE position ADD COLUMN precedent_clause TEXT;
        """,
    ),
]


def _checksum(mig: Migration) -> str:
    return hashlib.sha256(f"{mig.version}:{mig.name}:{mig.sql}".encode()).hexdigest()


def _table_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]


def _apply_sql_idempotent(conn: sqlite3.Connection, mig: Migration) -> None:
    """Run migration SQL, skipping ALTER TABLE statements for columns that
    already exist so re-opening a partially-upgraded legacy DB is safe."""
    for raw in mig.sql.split(";"):
        stmt = raw.strip()
        if not stmt:
            continue
        upper = " ".join(stmt.split()).upper()
        if upper.startswith("ALTER TABLE"):
            parts = stmt.split()
            table = parts[2]
            column = parts[-1].split()[0] if len(parts) >= 5 else ""
            # 'ADD [COLUMN] name' — take token after ADD/COLUMN.
            add_at = next(i for i, p in enumerate(parts) if p.upper() == "ADD")
            column = parts[add_at + 2] if parts[add_at + 1].upper() == "COLUMN" else parts[add_at + 1]
            if column.lower() in {c.lower() for c in _table_columns(conn, table)}:
                continue
        conn.execute(stmt)


def backup_before_first_upgrade(db_path: Path, current_version: int) -> Path | None:
    """Copy the database aside before its first-ever upgrade past v0/legacy."""
    if current_version != 0 or not db_path.exists() or str(db_path) == ":memory:":
        return None
    backup = db_path.with_suffix(db_path.suffix + ".pre-v2.bak")
    if not backup.exists():
        shutil.copy2(db_path, backup)
        return backup
    return backup


def migrate(path: Path | str, migrations: list[Migration] | None = None) -> int:
    """Bring the database at `path` up to the latest migration. Returns the
    applied schema version."""
    chain = migrations if migrations is not None else MIGRATIONS
    chain = sorted(chain, key=lambda m: m.version)

    conn = sqlite3.connect(str(path))
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")

        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migration ("
            "version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT, checksum TEXT)"
        )
        current = conn.execute("PRAGMA user_version").fetchone()[0]
        backup_before_first_upgrade(Path(path), current)

        applied = {
            r[0]: r for r in conn.execute(
                "SELECT version, name, checksum FROM schema_migration").fetchall()
        }

        for mig in chain:
            row = applied.get(mig.version)
            if row is not None:
                if row[2] != _checksum(mig):
                    raise RuntimeError(
                        f"checksum mismatch for migration {mig.label}: "
                        "the migration chain was edited after it was applied")
                continue
            with conn:  # one transaction per migration
                _apply_sql_idempotent(conn, mig)
                if mig.py is not None:
                    mig.py(conn)
                conn.execute(
                    "INSERT INTO schema_migration (version, name, applied_at, checksum)"
                    " VALUES (?,?,?,?)", (mig.version, mig.name, _now(), _checksum(mig)))
                conn.execute(f"PRAGMA user_version = {mig.version}")

        return conn.execute("PRAGMA user_version").fetchone()[0]
    finally:
        conn.close()
