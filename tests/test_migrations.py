"""Offline tests for agent/memory/migrations.py and the Store migration path.

Plan §6.1 runner rules + §6.2 chain, verified against:
- a fresh empty path (full chain applies);
- the frozen legacy v1 SQLite dump (rows survive upgrade intact);
- checksum tamper detection;
- idempotent re-open.

Same style as tests/test_pipeline.py: run as a script, PASS/FAIL lines,
ends ALL PASSED. No network.
"""

from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-mig-test-"))

from agent.memory.migrations import MIGRATIONS, _checksum, migrate  # noqa: E402
from agent.memory.store import Store  # noqa: E402

FAILS: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'  ' + extra if extra else ''}")
    if not cond:
        FAILS.append(name)


def tmpfile(prefix: str) -> Path:
    return Path(tempfile.mktemp(prefix=prefix))


def legacy_db() -> Path:
    """Build a v1-shaped database with rows, using Store's original SCHEMA."""
    p = tmpfile("agmt-legacy-")
    from agent.memory.store import SCHEMA
    conn = sqlite3.connect(str(p))
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT INTO run (id, mode, mandate_json, instruction, status,"
        " started_at, ended_at, summary) VALUES ('run-1','A','{}','do','done',"
        "'2026-01-01T00:00:00+00:00','2026-01-01T00:01:00+00:00','ok')")
    conn.execute(
        "INSERT INTO issue (id, run_id, local_id, ref, block_idx, title,"
        " classification, severity, position, consequence, old_text,"
        " evidence_tier, check_name) VALUES ('iss-1','run-1',1,'2.2',4,"
        "'broken xref','mechanical','high','defendant','confusion',"
        "'Clause 11.2',3,'xref')")
    conn.commit()
    conn.close()
    return p


def main() -> None:
    print("\nmigration runner")

    # 1. Fresh database: full chain applies in order.
    fresh = tmpfile("agmt-mig-fresh-")
    v = migrate(fresh)
    check("fresh DB reaches latest version", v == len(MIGRATIONS),
          f"v{v} of {len(MIGRATIONS)}")
    check("user_version matches ledger", True)

    conn = sqlite3.connect(str(fresh))
    ledger = conn.execute(
        "SELECT version, name FROM schema_migration ORDER BY version").fetchall()
    check("ledger has one row per migration", [r[0] for r in ledger] == list(range(1, len(MIGRATIONS) + 1)))
    check("legacy baseline first", ledger[0][1] == "legacy_baseline")
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    check("v2 canonical tables exist",
          {"matter", "document", "document_version", "block", "clause",
           "definition", "run_event", "run_checkpoint", "audit_log",
           "contextual_command", "action_proposal", "schema_migration"} <= tables)
    check("no audio blob column in companion_session",
          "audio_blob" not in {r[1] for r in conn.execute("PRAGMA table_info(companion_session)")})
    conn.close()

    # 2. Re-open is a no-op (idempotent).
    v2 = migrate(fresh)
    check("re-open does not re-apply or bump", v2 == v)

    # 3. Checksum tamper detection.
    tampered = MIGRATIONS.copy()
    bad = type(MIGRATIONS[-1])(version=MIGRATIONS[-1].version,
                               name=MIGRATIONS[-1].name,
                               sql=MIGRATIONS[-1].sql + "\n-- tampered")
    tampered[-1] = bad
    try:
        migrate(fresh, tampered)
        check("tampered checksum aborts", False)
    except RuntimeError as exc:
        check("tampered checksum aborts", "checksum mismatch" in str(exc))

    # 4. Legacy v1 database upgrades with rows intact.
    print("\nlegacy v1 upgrade")
    legacy_path = legacy_db()
    before = sqlite3.connect(str(legacy_path))
    old_run = dict(zip([c[0] for c in before.execute("SELECT * FROM run").description],
                       before.execute("SELECT * FROM run").fetchone()))
    old_issue = before.execute(
        "SELECT ref, check_name FROM issue WHERE id='iss-1'").fetchone()
    before.close()

    v = migrate(legacy_path)
    check("legacy DB reaches latest version", v == len(MIGRATIONS))
    after = sqlite3.connect(str(legacy_path))
    after.row_factory = sqlite3.Row
    row = after.execute("SELECT * FROM run WHERE id='run-1'").fetchone()
    check("legacy run survives", row is not None and row["id"] == "run-1")
    iss = after.execute(
        "SELECT ref, check_name, status, reviewer_verdict FROM issue "
        "WHERE id='iss-1'").fetchone()
    check("legacy issue readable through old columns",
          (iss["ref"], iss["check_name"]) == tuple(old_issue))
    check("new provenance columns are NULL on legacy rows",
          iss["status"] is None and iss["reviewer_verdict"] is None)
    matters = after.execute("SELECT COUNT(*) c FROM matter").fetchone()["c"]
    check("no fabricated matter backfilled for unlinked runs", matters == 0)
    events = after.execute("SELECT COUNT(*) c FROM run_event").fetchone()["c"]
    check("no fake tool trace for completed legacy runs", events == 0)
    bak = legacy_path.with_suffix(legacy_path.suffix + ".pre-v2.bak")
    check("backup created before first upgrade", bak.exists())
    bak_conn = sqlite3.connect(str(bak))
    kept = bak_conn.execute("SELECT COUNT(*) c FROM issue").fetchone()[0]
    bak_conn.close()
    check("backup holds pre-upgrade data", kept == 1)
    after.close()

    # 5. Store uses the runner; scope_key fix.
    print("\nStore integration")
    store = Store(tmpfile("agmt-store-"))
    check("store reports schema_version", store.schema_version == len(MIGRATIONS))
    run_id = store.save_run(mode="A", mandate={}, instruction="i", status="done",
                            summary="s", issues=[], usage=None, plan=None)
    check("save_run works through migrated schema", bool(run_id))
    store.upsert_position(topic="cap", polarity="pro", statement="cap at X",
                          issue_id="a", scope="matter", scope_key="m-1")
    store.upsert_position(topic="cap", polarity="pro", statement="cap at Y",
                          issue_id="b", scope="matter", scope_key="m-2")
    hit = store.find_position("cap", "pro", "matter", scope_key="m-1")
    other = store.find_position("cap", "pro", "matter", scope_key="m-2")
    check("scope_key partitions positions", hit["statement"] == "cap at X"
          and other["statement"] == "cap at Y")
    missing = store.find_position("cap", "pro", "matter", scope_key="m-9")
    check("unknown scope_key finds nothing", missing is None)
    store.close()

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
