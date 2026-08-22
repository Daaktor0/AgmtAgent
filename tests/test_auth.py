"""Offline tests for agent/runtime/auth.py and the server pairing gate
(plan commit 4). No network; the FastAPI app is exercised through
TestClient only for the 401 path.

Run as a script: PASS/FAIL lines, ends ALL PASSED.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.pop("AGMT_PAIRING_TOKEN", None)  # deterministic baseline

from agent.runtime.auth import (  # noqa: E402
    PairingStore, RequestContext, audit, auth_enabled, check_authorized,
)

FAILS: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        FAILS.append(name)


def main() -> None:
    print("\nrequest context")
    ctx = RequestContext(request_id="r-1", actor_id="tester")
    check("default mode is local", ctx.deployment_mode == "local")
    try:
        ctx.actor_id = "nope"  # type: ignore[misc]
        check("context is immutable", False)
    except Exception:
        check("context is immutable", True)

    print("\npairing store")
    db = tempfile.mktemp(prefix="agmt-auth-", suffix=".db")
    ps = PairingStore(db)
    code, sid = ps.issue(actor_id="companion", ttl_seconds=60)
    check("pairing code is six digits",
          len(code) == 6 and code.isdigit())
    check("token hash is not plaintext",
          code.encode() not in open(db, "rb").read())

    got = ps.verify(code)
    check("correct token verifies", got is not None and got["actor_id"] == "companion")
    replay = ps.verify(code)
    check("token cannot be reused (single use)", replay is None)
    wrong = ps.verify("000000" if code != "000000" else "111111")
    check("wrong token rejected", wrong is None)

    code2, sid2 = ps.issue(ttl_seconds=-1)
    expired = ps.verify(code2)
    check("expired token rejected", expired is None)

    print("\nserver gate")
    check("auth off without env var", auth_enabled() is False)
    check("open when disabled", check_authorized(None) is True)

    os.environ["AGMT_PAIRING_TOKEN"] = "543210"
    try:
        check("auth on with env var", auth_enabled() is True)
        check("missing header fails closed", check_authorized(None) is False)
        check("wrong bearer fails", check_authorized("Bearer 999999") is False)
        check("right bearer passes", check_authorized("Bearer 543210") is True)
    finally:
        os.environ.pop("AGMT_PAIRING_TOKEN")

    # TestClient against the real app: /api/health stays open, others 401.
    try:
        from fastapi.testclient import TestClient
        from server.app import app
        client = TestClient(app)
        os.environ["AGMT_PAIRING_TOKEN"] = "543210"
        try:
            h = client.get("/api/health")
            check("/api/health stays open", h.status_code == 200)
            p = client.get("/api/positions")
            check("unguarded API endpoint returns 401", p.status_code == 401)
            ok = client.get("/api/positions",
                            headers={"Authorization": "Bearer 543210"})
            check("paired request passes gate", ok.status_code == 200)
        finally:
            os.environ.pop("AGMT_PAIRING_TOKEN")
    except ImportError:
        print("  SKIP  TestClient not installed")

    print("\naudit hook")
    import sqlite3
    conn = sqlite3.connect(tempfile.mktemp(prefix="agmt-audit-"))
    from agent.memory.migrations import migrate
    migrate(":memory:")  # smoke only
    # audit needs a DB with audit_log; make one via migrations on disk
    db2 = tempfile.mktemp(prefix="agmt-audit2-", suffix=".db")
    migrate(db2)
    conn = sqlite3.connect(db2)
    audit(conn, actor="local-user", action="apply_action",
          subject_type="action_proposal", subject_id="ap-1",
          detail={"ticket": "t-1"})
    row = conn.execute(
        "SELECT actor, action, detail_json FROM audit_log").fetchone()
    check("audit row written", row[0] == "local-user" and row[1] == "apply_action")
    conn.close()

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
