"""Matter, document and document-version repositories (plan commit 13).

The canonical domain: a Matter holds Documents; each Document has immutable
DocumentVersions; each version owns Blocks, Clauses and Definitions. Ingesting
the same document hash twice is idempotent — the existing version is returned,
never duplicated.
"""

from __future__ import annotations

import uuid
from typing import Any

from .store import Store, _now


def _uuid() -> str:
    return str(uuid.uuid4())


class MatterRepository:
    """Repository methods mixed into Store via inheritance-free composition:
    constructed with the Store instance so locks/connections are shared."""

    def __init__(self, store: Store):
        self._store = store

    @property
    def conn(self):
        return self._store._conn

    @property
    def lock(self):
        return self._store._lock

    # ------------------------------------------------------------- matters

    def create_matter(self, *, name: str, client: str = "",
                      party_represented: str = "", counterparty: str = "",
                      deal_type: str = "", governing_law: str = "") -> dict:
        mid = _uuid()
        with self.lock:
            self.conn.execute(
                "INSERT INTO matter (id, name, client, party_represented,"
                " counterparty, deal_type, governing_law, status, created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                (mid, name, client, party_represented, counterparty,
                 deal_type, governing_law, "active", _now()))
            self.conn.commit()
        return self.get_matter(mid)

    def get_matter(self, matter_id: str) -> dict | None:
        with self.lock:
            row = self.conn.execute(
                "SELECT * FROM matter WHERE id = ?", (matter_id,)).fetchone()
        return dict(row) if row else None

    def list_matters(self, include_archived: bool = False) -> list[dict]:
        q = ("SELECT * FROM matter" +
             ("" if include_archived else " WHERE status != 'archived'") +
             " ORDER BY created_at DESC")
        with self.lock:
            rows = self.conn.execute(q).fetchall()
        return [dict(r) for r in rows]

    def archive_matter(self, matter_id: str) -> bool:
        with self.lock:
            cur = self.conn.execute(
                "UPDATE matter SET status='archived', archived_at=? WHERE id=?",
                (_now(), matter_id))
            self.conn.commit()
        return cur.rowcount > 0

    # ----------------------------------------------------------- documents

    def add_document(self, *, matter_id: str, role: str, filename: str,
                     word_doc_id: str | None = None) -> dict:
        doc_id = _uuid()
        with self.lock:
            row = self.conn.execute(
                "SELECT id FROM document WHERE matter_id=? AND word_doc_id IS ?",
                (matter_id, word_doc_id)).fetchone() if word_doc_id else None
            if row is not None:
                existing = self.get_document(row["id"])
                self.conn.commit()
                return existing  # type: ignore[return-value]
            self.conn.execute(
                "INSERT INTO document (id, matter_id, role, filename,"
                " word_doc_id, created_at) VALUES (?,?,?,?,?,?)",
                (doc_id, matter_id, role, filename, word_doc_id, _now()))
            self.conn.commit()
        return self.get_document(doc_id)

    def get_document(self, document_id: str) -> dict | None:
        with self.lock:
            row = self.conn.execute(
                "SELECT * FROM document WHERE id=?", (document_id,)).fetchone()
        return dict(row) if row else None

    def list_documents(self, matter_id: str) -> list[dict]:
        with self.lock:
            rows = self.conn.execute(
                "SELECT * FROM document WHERE matter_id=? ORDER BY created_at",
                (matter_id,)).fetchall()
        return [dict(r) for r in rows]

    # ---------------------------------------------------- document versions

    def ingest_version(
        self, *, document_id: str, doc_hash: str, blocks: list[dict],
        clauses: list[dict] | None = None, definitions: list[dict] | None = None,
        capabilities: dict | None = None, source: str = "word-addin",
        version_label: str = "", supersedes_id: str | None = None,
    ) -> tuple[dict, bool]:
        """Ingest one immutable version. Idempotent on (document_id, doc_hash):
        re-ingesting identical bytes returns the existing version with
        created=False instead of duplicating."""
        with self.lock:
            row = self.conn.execute(
                "SELECT id FROM document_version WHERE document_id=? AND doc_hash=?",
                (document_id, doc_hash)).fetchone()
            if row is not None:
                existing = self.get_version(row["id"])
                self.conn.commit()
                return existing, False  # type: ignore[return-value]

            n = self.conn.execute(
                "SELECT COUNT(*) c FROM document_version WHERE document_id=?",
                (document_id,)).fetchone()["c"]
            vid = _uuid()
            self.conn.execute(
                "INSERT INTO document_version (id, document_id, version_no,"
                " version_label, doc_hash, source, ingest_schema_version,"
                " capabilities_json, ingested_at, supersedes_id)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                (vid, document_id, n + 1, version_label or f"v{n + 1}",
                 doc_hash, source, "2", _json(capabilities), _now(),
                 supersedes_id))
            for b in blocks or []:
                self.conn.execute(
                    "INSERT INTO block (id, document_version_id, idx, kind,"
                    " text, text_sha256, list_prefix, list_level, style,"
                    " style_built_in, story_type, table_id, row, col, section,"
                    " footnote_ref, unique_local_id, char_start, char_end,"
                    " structural_path_json)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (_uuid(), vid, b.get("idx"), b.get("kind") or "body",
                     b.get("text"), b.get("text_sha256"), b.get("list_prefix"),
                     b.get("list_level"), b.get("style"),
                     b.get("style_built_in"), b.get("story_type"),
                     b.get("table_id"), b.get("row"), b.get("col"),
                     b.get("section"), b.get("footnote_ref"),
                     b.get("unique_local_id"), b.get("char_start"),
                     b.get("char_end"), _json(b.get("structural_path"))))
            for c in clauses or []:
                self.conn.execute(
                    "INSERT INTO clause (id, document_version_id, number,"
                    " kind, heading, start_idx, end_idx, depth, confidence,"
                    " detected_by) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (_uuid(), vid, c.get("number"), c.get("kind"),
                     c.get("heading"), c.get("start_idx"), c.get("end_idx"),
                     c.get("depth"), c.get("confidence"), c.get("detected_by")))
            for d in definitions or []:
                self.conn.execute(
                    "INSERT INTO definition (id, document_version_id, term,"
                    " defined_at_idx, text, usage_idxs_json, scope)"
                    " VALUES (?,?,?,?,?,?,?)",
                    (_uuid(), vid, d.get("term"), d.get("defined_at_idx"),
                     d.get("text"), _json(d.get("usage_idxs")),
                     d.get("scope")))
            self.conn.execute(
                "UPDATE document SET current_version_id=? WHERE id=?",
                (vid, document_id))
            self.conn.commit()
        return self.get_version(vid), True  # type: ignore[return-value]

    def get_version(self, version_id: str) -> dict | None:
        with self.lock:
            row = self.conn.execute(
                "SELECT * FROM document_version WHERE id=?",
                (version_id,)).fetchone()
        return dict(row) if row else None

    def list_versions(self, document_id: str) -> list[dict]:
        with self.lock:
            rows = self.conn.execute(
                "SELECT id, version_no, version_label, doc_hash, source,"
                " ingested_at, supersedes_id FROM document_version"
                " WHERE document_id=? ORDER BY version_no",
                (document_id,)).fetchall()
        return [dict(r) for r in rows]

    def get_blocks(self, version_id: str) -> list[dict]:
        with self.lock:
            rows = self.conn.execute(
                "SELECT * FROM block WHERE document_version_id=? ORDER BY idx",
                (version_id,)).fetchall()
        return [dict(r) for r in rows]

    def get_clauses(self, version_id: str) -> list[dict]:
        with self.lock:
            rows = self.conn.execute(
                "SELECT * FROM clause WHERE document_version_id=?"
                " ORDER BY start_idx", (version_id,)).fetchall()
        return [dict(r) for r in rows]

    def get_definitions(self, version_id: str) -> list[dict]:
        with self.lock:
            rows = self.conn.execute(
                "SELECT * FROM definition WHERE document_version_id=?"
                " ORDER BY defined_at_idx", (version_id,)).fetchall()
        return [dict(r) for r in rows]


def _json(value: Any) -> str | None:
    import json
    return json.dumps(value, ensure_ascii=False) if value is not None else None


# Attach to Store so get_store() users get it for free.
def attach_matter_repository(store: Store) -> Store:
    store.matters = MatterRepository(store)  # type: ignore[attr-defined]
    return store
