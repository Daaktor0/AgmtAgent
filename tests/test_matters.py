"""Matter/document/version repository tests (plan commit 13).

Exit criteria: same document hash is idempotent; new version gets immutable
blocks and indexes; legacy rows untouched.

Run as a script: PASS/FAIL lines, ends ALL PASSED.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-matter-"))

from agent.memory.store import Store  # noqa: E402

FAILS: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        FAILS.append(name)


BLOCKS = [
    {"idx": 0, "kind": "body", "text": "CLAUSE 9. Indemnity",
     "text_sha256": "a" * 64},
    {"idx": 1, "kind": "body", "text": "The Contractor shall indemnify.",
     "text_sha256": "b" * 64, "unique_local_id": "uli-1"},
]

CLAUSES = [{"number": "9", "kind": "clause", "heading": "Indemnity",
            "start_idx": 0, "end_idx": 1, "depth": 0,
            "confidence": 1.0, "detected_by": "regex"}]
DEFS = [{"term": "Losses", "defined_at_idx": 1, "text": "all losses",
         "usage_idxs_json": [1], "scope": "clause"}]


def main() -> None:
    store = Store(tempfile.mktemp(prefix="agmt-mat-", suffix=".db"))
    repo = store.matters

    print("\nmatters")
    m = repo.create_matter(name="Project Alpha", client="Acme",
                           governing_law="India")
    check("matter created", m["name"] == "Project Alpha"
          and m["status"] == "active")
    check("list matters", len(repo.list_matters()) == 1)
    check("archive works", repo.archive_matter(m["id"])
          and repo.get_matter(m["id"])["status"] == "archived")
    check("archived excluded by default", repo.list_matters() == [])

    print("\ndocuments")
    m2 = repo.create_matter(name="Project Beta")
    d1 = repo.add_document(matter_id=m2["id"], role="primary",
                           filename="spa.docx", word_doc_id="wd-1")
    d1_again = repo.add_document(matter_id=m2["id"], role="primary",
                                 filename="spa.docx", word_doc_id="wd-1")
    check("same word_doc_id is idempotent", d1["id"] == d1_again["id"])
    d2 = repo.add_document(matter_id=m2["id"], role="disclosure",
                           filename="disclosure.docx")
    check("two documents listed", len(repo.list_documents(m2["id"])) == 2)

    print("\nversions")
    v1, created1 = repo.ingest_version(
        document_id=d1["id"], doc_hash="h1", blocks=BLOCKS,
        clauses=CLAUSES, definitions=DEFS, capabilities={"tables": True})
    check("first ingest creates", created1 and v1["version_no"] == 1)
    v1b, created1b = repo.ingest_version(
        document_id=d1["id"], doc_hash="h1", blocks=BLOCKS)
    check("same hash is idempotent",
          not created1b and v1b["id"] == v1["id"])
    check("no duplicate blocks on idempotent ingest",
          len(repo.get_blocks(v1["id"])) == 2)

    v2, created2 = repo.ingest_version(
        document_id=d1["id"], doc_hash="h2",
        blocks=[{**BLOCKS[0], "text": "CLAUSE 9. Indemnity and liability"},
                *BLOCKS[1:]],
        supersedes_id=v1["id"])
    check("new hash creates version 2",
          created2 and v2["version_no"] == 2)
    check("version chain via supersedes_id",
          v2["supersedes_id"] == v1["id"])
    check("document points at current version",
          repo.get_document(d1["id"])["current_version_id"] == v2["id"])
    check("v1 blocks immutable", len(repo.get_blocks(v1["id"])) == 2)
    check("v2 has its own blocks", len(repo.get_blocks(v2["id"])) == 2)
    check("clauses indexed per version",
          len(repo.get_clauses(v1["id"])) == 1)
    check("definitions indexed per version",
          len(repo.get_definitions(v1["id"])) == 1)
    check("version list ordered",
          [v["version_no"] for v in repo.list_versions(d1["id"])] == [1, 2])

    print("\nlegacy isolation")
    run_id = store.save_run(mode="A", mandate={}, instruction="i",
                            status="done", summary="s", issues=[])
    run = store.get_run(run_id)
    check("legacy run has no fabricated document version",
          run["document_version_id"] is None)

    store.close()

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
