"""Immutable request context and local pairing (plan commit 4, §7.1).

Local mode: the server binds to loopback only. Requests must carry a pairing
token in the Authorization header unless they are explicitly unauthenticated
endpoints (/api/health). The token is never stored in plaintext — only its
SHA-256 hash and expiry live in the pairing table.

Legacy behaviour (no AGMT_PAIRING_TOKEN configured) stays open for the single
user on loopback; setting the env var switches every other endpoint to 401.
"""

from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass(frozen=True)
class RequestContext:
    """Immutable per-request identity. Every tool call, event and audit entry
    receives this explicitly — no request reads module globals."""

    request_id: str
    actor_id: str
    deployment_mode: Literal["local", "tenant"] = "local"
    matter_id: str | None = None
    document_id: str | None = None
    document_version_id: str | None = None
    provider_policy_id: str = "default"
    redaction_policy: str = "none-local"
    retention_policy: str = "local-default"

    @classmethod
    def anonymous(cls) -> "RequestContext":
        return cls(request_id=str(uuid.uuid4()), actor_id="local-user")


class PairingStore:
    """Pairing tokens for the local companion/add-in bridge.

    Frozen rule from artefact 06: pairing_token == pairing_code (6-digit).
    Only the SHA-256 hash is persisted. Tokens expire.
    """

    def __init__(self, db_path: str):
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS pairing_session (
                    id TEXT PRIMARY KEY,
                    token_hash TEXT NOT NULL,
                    actor_id TEXT NOT NULL DEFAULT 'companion',
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    paired_at TEXT,
                    closed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_pairing_hash
                    ON pairing_session(token_hash);
                """
            )
            self._conn.commit()

    @staticmethod
    def hash_token(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    def issue(self, *, actor_id: str = "companion",
              ttl_seconds: int = 600) -> tuple[str, str]:
        """Create a session; returns (pairing_code, session_id)."""
        code = f"{secrets.randbelow(1_000_000):06d}"
        now = datetime.now(timezone.utc)
        sid = str(uuid.uuid4())
        with self._lock:
            self._conn.execute(
                "INSERT INTO pairing_session (id, token_hash, actor_id,"
                " created_at, expires_at) VALUES (?,?,?,?,?)",
                (sid, self.hash_token(code), actor_id, _now(),
                 (now + timedelta(seconds=ttl_seconds)).isoformat(timespec="seconds")),
            )
            self._conn.commit()
        return code, sid

    def verify(self, token: str) -> dict | None:
        """Return the open, unexpired session for this raw token."""
        h = self.hash_token(token)
        now = _now()
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM pairing_session WHERE token_hash = ?"
                " AND paired_at IS NULL AND closed_at IS NULL AND expires_at > ?"
                " ORDER BY created_at DESC LIMIT 1", (h, now),
            ).fetchone()
            if row is None:
                return None
            # Mark as consumed on first successful use.
            self._conn.execute(
                "UPDATE pairing_session SET paired_at = ? WHERE id = ?",
                (_now(), row["id"]),
            )
            self._conn.commit()
        return dict(row)

    def close_session(self, session_id: str) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE pairing_session SET closed_at = ? WHERE id = ?",
                (_now(), session_id),
            )
            self._conn.commit()

    def close_conn(self) -> None:
        self._conn.close()


def audit(store_conn: sqlite3.Connection, *, actor: str, action: str,
          matter_id: str | None = None, subject_type: str | None = None,
          subject_id: str | None = None, detail: dict | None = None) -> None:
    """Append an audit row. No document text goes in — ids and metadata only."""
    import json
    store_conn.execute(
        "INSERT INTO audit_log (id, ts, actor, matter_id, action,"
        " subject_type, subject_id, detail_json) VALUES (?,?,?,?,?,?,?,?)",
        (str(uuid.uuid4()), _now(), actor, matter_id, action,
         subject_type, subject_id,
         json.dumps(detail or {}, ensure_ascii=False)),
    )


# --- FastAPI dependency -----------------------------------------------------

def pairing_token_from_request(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return authorization.strip()


def auth_enabled() -> bool:
    return bool(os.environ.get("AGMT_PAIRING_TOKEN"))


def check_authorized(authorization: str | None) -> bool:
    """True when the request may proceed. With no token configured (plain
    local single-user mode) everything on loopback is allowed."""
    expected = os.environ.get("AGMT_PAIRING_TOKEN")
    if not expected:
        return True
    provided = pairing_token_from_request(authorization)
    if not provided:
        return False
    return secrets.compare_digest(provided, expected)
