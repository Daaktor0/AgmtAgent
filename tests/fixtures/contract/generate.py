"""Generate v1 contract snapshots and the legacy Store SQL fixture.

    .venv/Scripts/python.exe tests/fixtures/contract/generate.py
    .venv/Scripts/python.exe tests/fixtures/contract/generate.py --check
    .venv/Scripts/python.exe tests/fixtures/contract/generate.py --build-db PATH
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import tempfile
from dataclasses import asdict, fields
from difflib import unified_diff
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
FIXTURE_NAMES = (
    "v1_events.json",
    "v1_issues.json",
    "v1_mechanical_findings.json",
    "v1_settings.json",
    "v1_addin_payload.json",
    "v1_store_schema.sql",
    "legacy_v1.sql",
)
FROZEN_NOW = "1970-01-01T00:00:00+00:00"
UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)
TS_RE = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?"
)
HOST_RE = re.compile(
    r"\b(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]|::1)(?::\d+)?\b",
    re.IGNORECASE,
)
KEY_RE = re.compile(r"^(?:sk-|or-)[A-Za-z0-9_\-]+$")
KEY_FIELD_NAMES = {"api_key", "openrouter_api_key", "authorization"}
STUB_CATALOG: list[dict[str, Any]] = [
    {
        "id": "anthropic/claude-opus-4",
        "name": "Claude Opus 4",
        "created": 4,
        "supported_parameters": ["tools"],
        "context_length": 200000,
        "top_provider": {"context_length": 200000},
    },
    {
        "id": "anthropic/claude-sonnet-4",
        "name": "Claude Sonnet 4",
        "created": 3,
        "supported_parameters": ["tools"],
        "context_length": 200000,
        "top_provider": {"context_length": 200000},
    },
    {
        "id": "anthropic/claude-haiku-4",
        "name": "Claude Haiku 4",
        "created": 2,
        "supported_parameters": ["tools"],
        "context_length": 200000,
        "top_provider": {"context_length": 200000},
    },
    {
        "id": "openai/gpt-5",
        "name": "GPT-5",
        "created": 4,
        "supported_parameters": ["tools"],
        "context_length": 128000,
        "top_provider": {"context_length": 128000},
    },
    {
        "id": "google/gemini-3",
        "name": "Gemini 3",
        "created": 3,
        "supported_parameters": ["tools"],
        "context_length": 1000000,
        "top_provider": {"context_length": 1000000},
    },
    {
        "id": "x-ai/grok-4",
        "name": "Grok 4",
        "created": 2,
        "supported_parameters": ["tools"],
        "context_length": 131072,
        "top_provider": {"context_length": 131072},
    },
]


class _NoNetwork:
    """httpx stand-in that refuses every call."""

    def get(self, *args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("network disabled in contract snapshot")

    def post(self, *args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("network disabled in contract snapshot")

    def close(self) -> None:
        return None


class Normalizer:
    """Replace volatile values with stable first-seen placeholders."""

    def __init__(self) -> None:
        self._ids: dict[str, str] = {}
        self._timestamps: dict[str, str] = {}

    def _id_for(self, raw: str) -> str:
        token = raw.lower()
        if token not in self._ids:
            self._ids[token] = f"<id:{len(self._ids) + 1}>"
        return self._ids[token]

    def _ts_for(self, raw: str) -> str:
        if raw not in self._timestamps:
            self._timestamps[raw] = f"<ts:{len(self._timestamps) + 1}>"
        return self._timestamps[raw]

    def normalize_text(self, text: str) -> str:
        def id_sub(match: re.Match[str]) -> str:
            return self._id_for(match.group(0))

        def ts_sub(match: re.Match[str]) -> str:
            return self._ts_for(match.group(0))

        text = UUID_RE.sub(id_sub, text)
        text = TS_RE.sub(ts_sub, text)
        if KEY_RE.match(text):
            return "<redacted>"
        if _looks_like_abs_path(text):
            return "<path>"
        text = HOST_RE.sub("<host>", text)
        return text

    def normalize(self, value: Any, key: str | None = None) -> Any:
        if (
            key is not None
            and key.lower() in KEY_FIELD_NAMES
            and isinstance(value, str)
        ):
            return "<redacted>"
        if isinstance(value, dict):
            return {k: self.normalize(v, k) for k, v in value.items()}
        if isinstance(value, list):
            return [self.normalize(item, key) for item in value]
        if isinstance(value, tuple):
            return [self.normalize(item, key) for item in value]
        if isinstance(value, str):
            return self.normalize_text(value)
        return value


def _looks_like_abs_path(text: str) -> bool:
    if len(text) < 3:
        return False
    if re.match(r"^[A-Za-z]:[\\/]", text):
        return True
    if text.startswith("\\\\"):
        return True
    if text.startswith("/") and not text.startswith("/api"):
        return os.path.isabs(text) and ("/" in text[1:] or text.startswith("/tmp"))
    return False


def _write_json(path: Path, data: Any) -> None:
    text = json.dumps(data, sort_keys=True, indent=2, ensure_ascii=False)
    path.write_text(text + "\n", encoding="utf-8")


def _write_sql(path: Path, sql: str) -> None:
    if not sql.endswith("\n"):
        sql += "\n"
    path.write_text(sql, encoding="utf-8")


def _sample_paragraphs() -> list[str]:
    return (ROOT / "tests" / "sample_sha.txt").read_text(encoding="utf-8").split("\n")


def _make_stub_router(paragraphs: list[str]) -> Any:
    from agent.config import Config

    def para_of(needle: str) -> int:
        for i, para in enumerate(paragraphs):
            if needle in para:
                return i
        return -1

    class StubRouter:
        """Plays a model that uses the tools, records a good issue and a bad one."""

        def __init__(self) -> None:
            self.step = 0
            self.cfg = Config()

        def resolve(self, role: str) -> str:
            return f"stub/{role}"

        def chat(self, role: str, messages: Any, tools: Any = None, model: Any = None, **kw: Any) -> dict:
            if role == "reviewer":
                return {"choices": [{"message": {
                    "role": "assistant",
                    "content": json.dumps({
                        "verdicts": [{"id": 1, "verdict": "confirm", "note": "real defect"}],
                    }),
                }}], "_model": "stub/reviewer"}
            self.step += 1
            script = [
                ("get_outline", {}),
                ("run_mechanical_checks", {}),
                ("search_document", {"query": "Investor Majority"}),
                ("get_definition", {"term": "Subscription Amount"}),
                ("record_issue", {
                    "ref": "5.1", "para": para_of("Event of Default"),
                    "title": "Standalone indemnity trigger for an EOD duplicates limb (a)",
                    "classification": "commercial_risk", "severity": "high",
                    "position": "delete",
                    "consequence": (
                        "This limb expands monetary liability for an Event of Default "
                        "that Clause 5.2 already caps, without adding any protection "
                        "the Investor does not already have."
                    ),
                    "old_text": "; and (c) the occurrence of an Event of Default",
                    "new_text": "",
                    "comment": "Clause [X] separately addresses the consequences of an Event "
                               "of Default.",
                    "consequential": ["5.2"],
                }),
                ("record_issue", {
                    "ref": "6.1", "para": 27,
                    "title": "Invented wording that is not in the document",
                    "classification": "drafting_defect", "severity": "low",
                    "position": "revise",
                    "consequence": "n/a",
                    "old_text": "this exact string is definitely not present anywhere",
                    "new_text": "x",
                }),
                ("ask_user", {"question": "Which side do we act for?", "why": "Changes the analysis."}),
                ("finish", {"summary": "Two points matter."}),
            ]
            if self.step > len(script):
                name, args = "finish", {"summary": "done"}
            else:
                name, args = script[self.step - 1]
            return {"choices": [{"message": {
                "role": "assistant", "content": None,
                "tool_calls": [{"id": f"c{self.step}", "type": "function",
                                "function": {"name": name,
                                             "arguments": json.dumps(args)}}],
            }}], "_model": "stub/supervisor"}

    return StubRouter()


def _taskpane_payload_keys(source: str) -> dict[str, list[str]]:
    start = source.find("function payload(doc)")
    if start < 0:
        raise RuntimeError("addin/taskpane.js has no payload(doc) function")
    nxt = source.find("\nfunction ", start + 1)
    chunk = source[start:] if nxt < 0 else source[start:nxt]
    always: list[str] = []
    for match in re.finditer(r"^\s+(\w+): ", chunk, re.MULTILINE):
        always.append(match.group(1))
    optional: list[str] = []
    for match in re.finditer(r"if \(doc\.(\w+)\) body\.\1", chunk):
        optional.append(match.group(1))
    return {"always": always, "optional": optional}


def _taskpane_example_body(paragraphs: list[str], keys: list[str]) -> dict[str, Any]:
    values: dict[str, Any] = {
        "paragraphs": paragraphs,
        "list_prefixes": [],
        "unique_local_ids": [],
        "list_levels": [],
        "mode": "A",
        "instruction": "",
        "party": "",
        "counterparty": "",
        "document_type": "",
        "stage": "",
        "context": "",
    }
    missing = [key for key in keys if key not in values]
    if missing:
        raise RuntimeError(f"no sample value for taskpane key(s): {missing}")
    return {key: values[key] for key in keys}


def _close_store_singleton() -> None:
    import agent.memory.store as store_mod

    existing = store_mod._STORE
    if existing is not None:
        existing.close()
        store_mod._STORE = None


def _snapshot_events_and_issues(
    paragraphs: list[str], normalizer: Normalizer,
) -> tuple[list[Any], list[Any]]:
    from agent.config import Config
    from agent.supervisor import Supervisor

    events = list(Supervisor(Config(), _make_stub_router(paragraphs)).run(
        paragraphs, "A", {"party_represented": "Company"},
    ))
    events_n = normalizer.normalize(events)
    issues: list[Any] = []
    for event in events_n:
        if isinstance(event, dict) and event.get("event") == "done":
            raw_issues = event.get("issues") or []
            issues = list(raw_issues) if isinstance(raw_issues, list) else []
    return events_n, issues


def _snapshot_mechanical(normalizer: Normalizer) -> dict[str, list[dict]]:
    from agent.document import build_document
    from agent.eval.corpus import load_corpus
    from agent.eval.harness import normalize_issue

    docs = load_corpus(ROOT / "eval" / "corpus")
    out: dict[str, list[dict]] = {}
    for doc in docs:
        parsed = build_document(doc.ingested, doc_id=doc.doc_id)
        out[doc.doc_id] = [normalize_issue(item) for item in parsed.mechanical_checks()]
    return normalizer.normalize(out)


def _snapshot_settings(normalizer: Normalizer) -> dict[str, Any]:
    import warnings

    warnings.filterwarnings(
        "ignore",
        message="Using `httpx` with `starlette.testclient` is deprecated",
    )
    from fastapi.testclient import TestClient

    from agent.config import Config, DEFAULT_ROLES
    import server.app as server_app

    old_client = server_app.router._client
    server_app.router.catalog = lambda force=False: [dict(row) for row in STUB_CATALOG]
    server_app.router._client = _NoNetwork()
    try:
        old_client.close()
    except Exception:
        pass
    server_app.cfg.pinned = {}
    server_app.cfg.prefer = {k: list(v) for k, v in DEFAULT_ROLES.items()}
    server_app.cfg.require_only_free = False
    server_app.router.cfg = server_app.cfg

    with TestClient(server_app.app) as client:
        health = client.get("/api/health").json()
        models = client.get("/api/models").json()
        settings_empty = client.post("/api/settings", json={}).json()

    def freeze_volatile(payload: Any) -> Any:
        if isinstance(payload, dict):
            out = dict(payload)
            if "has_key" in out:
                out["has_key"] = False
            if "pinned" in out:
                out["pinned"] = {}
            return {k: freeze_volatile(v) for k, v in out.items()}
        if isinstance(payload, list):
            return [freeze_volatile(item) for item in payload]
        return payload

    return normalizer.normalize({
        "config_field_names": [item.name for item in fields(Config)],
        "config_defaults": asdict(Config()),
        "settings_model_schema": server_app.Settings.model_json_schema(),
        "get_api_health": freeze_volatile(health),
        "get_api_models": freeze_volatile(models),
        "post_api_settings_empty": freeze_volatile(settings_empty),
    })


def _snapshot_addin(paragraphs: list[str], normalizer: Normalizer) -> dict[str, Any]:
    import server.app as server_app

    source = (ROOT / "addin" / "taskpane.js").read_text(encoding="utf-8")
    keys = _taskpane_payload_keys(source)
    posted = _taskpane_example_body(paragraphs, keys["always"])
    validated = server_app.ReviewRequest.model_validate(posted)
    return normalizer.normalize({
        "json_schema": server_app.ReviewRequest.model_json_schema(),
        "example": validated.model_dump(mode="json"),
        "example_as_posted_by_taskpane": posted,
        "taskpane_payload_keys": keys,
    })


def _finding_payloads(paragraphs: list[str]) -> list[dict[str, Any]]:
    from agent.document import Document

    findings = list(Document(paragraphs).mechanical_checks())
    payload = [
        {"check": item.check, "check_id": item.check_id, "family": item.family,
         "severity": item.severity, "para": item.para,
         "ref": item.ref, "detail": item.detail, "excerpt": item.excerpt,
         "certainty": item.certainty, "evidence_tier": item.evidence_tier}
        for item in findings
    ]
    # Same conversion /api/checks uses before Store.save_run.
    return [
        {**row, "id": n + 1, "title": row["detail"],
         "classification": "drafting_defect", "_mechanical": row["check"]}
        for n, row in enumerate(payload)
    ]


def _renumber(issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for n, item in enumerate(issues, start=1):
        row = dict(item)
        row["id"] = n
        out.append(row)
    return out


def _snapshot_store(
    paragraphs: list[str], tmp: Path, normalizer: Normalizer,
) -> tuple[str, str]:
    from agent.memory.dispositions import VALID, record_disposition
    from agent.memory.store import Store

    issues_all = _finding_payloads(paragraphs)
    if len(issues_all) < 4:
        raise RuntimeError(
            f"need at least 4 mechanical findings to populate dispositions, got {len(issues_all)}"
        )
    cut = max(2, len(issues_all) // 2)
    run1_issues = _renumber(issues_all[:cut])
    run2_issues = _renumber(issues_all[cut:])
    if len(run2_issues) < 2:
        raise RuntimeError("second Store run needs several issues")

    db_path = tmp / "legacy.db"
    store = Store(db_path)
    try:
        run1 = store.save_run(
            mode="A",
            mandate={"party_represented": "Company"},
            instruction="",
            status="done",
            summary="Two points matter.",
            issues=run1_issues,
            plan=None,
            steps_used=8,
        )
        store.save_run(
            mode="checks",
            mandate={},
            instruction="",
            status="done",
            summary=f"{len(run2_issues)} mechanical findings",
            issues=run2_issues,
        )
        rows = store.get_run(run1)
        if rows is None:
            raise RuntimeError("save_run did not persist run 1")
        saved = rows["issues"]
        if len(saved) < 4:
            raise RuntimeError("run 1 did not persist enough issues")

        rejected_id = saved[0]["id"]
        accepted_id = saved[1]["id"]
        modified_id = saved[2]["id"]
        deferred_id = saved[3]["id"]
        modified_issue = store.get_issue(modified_id) or {}

        record_disposition(store, rejected_id, "rejected")
        record_disposition(store, rejected_id, "rejected")
        third = record_disposition(store, rejected_id, "rejected")
        record_disposition(store, accepted_id, "accepted")
        record_disposition(
            store, modified_id, "accepted_modified",
            final_text=str(modified_issue.get("old_text") or ""),
            note=str(modified_issue.get("title") or ""),
        )
        record_disposition(store, deferred_id, "deferred")

        position = (third or {}).get("position") or {}
        if not position.get("active"):
            raise RuntimeError("expected three consistent rejections to promote an active position")
        unused = sorted(VALID - {"accepted", "accepted_modified", "rejected", "deferred"})
        if unused:
            raise RuntimeError(f"disposition actions not exercised: {unused}")

        conn = store._conn
        schema_rows = conn.execute(
            "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name"
        ).fetchall()
        schema = "\n\n".join(row[0].rstrip() + ";" for row in schema_rows) + "\n"
        dump = "\n".join(conn.iterdump())
        if not dump.endswith("\n"):
            dump += "\n"
        return schema, normalizer.normalize_text(dump)
    finally:
        store.close()


def _bootstrap(tmp: Path) -> None:
    os.environ["AGMT_DB"] = str(tmp / "agmt.db")
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    import agent.memory.store as store_mod

    store_mod._now = lambda: FROZEN_NOW


def generate(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="agmt-contract-") as raw_tmp:
        tmp = Path(raw_tmp)
        _bootstrap(tmp)
        normalizer = Normalizer()
        paragraphs = _sample_paragraphs()
        try:
            events, issues = _snapshot_events_and_issues(paragraphs, normalizer)
            mechanical = _snapshot_mechanical(normalizer)
            settings = _snapshot_settings(normalizer)
            addin = _snapshot_addin(paragraphs, normalizer)
            schema, dump = _snapshot_store(paragraphs, tmp, normalizer)
            _write_json(out_dir / "v1_events.json", events)
            _write_json(out_dir / "v1_issues.json", issues)
            _write_json(out_dir / "v1_mechanical_findings.json", mechanical)
            _write_json(out_dir / "v1_settings.json", settings)
            _write_json(out_dir / "v1_addin_payload.json", addin)
            _write_sql(out_dir / "v1_store_schema.sql", schema)
            _write_sql(out_dir / "legacy_v1.sql", dump)
        finally:
            _close_store_singleton()


def build_db(path: Path) -> None:
    sql_path = HERE / "legacy_v1.sql"
    if not sql_path.is_file():
        raise FileNotFoundError(f"missing {sql_path}")
    sql = sql_path.read_text(encoding="utf-8")
    path = Path(path)
    if path.exists():
        path.unlink()
    if path.parent != Path(".") and str(path.parent) != "":
        path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    try:
        conn.executescript(sql)
        conn.commit()
    finally:
        conn.close()


def check() -> int:
    with tempfile.TemporaryDirectory(prefix="agmt-contract-check-") as raw_tmp:
        tmp = Path(raw_tmp)
        generate(tmp)
        failed = False
        for name in FIXTURE_NAMES:
            committed = HERE / name
            produced = tmp / name
            left = committed.read_text(encoding="utf-8") if committed.is_file() else ""
            right = produced.read_text(encoding="utf-8") if produced.is_file() else ""
            if left == right:
                continue
            failed = True
            diff = unified_diff(
                left.splitlines(keepends=True),
                right.splitlines(keepends=True),
                fromfile=str(committed),
                tofile=str(produced),
            )
            sys.stdout.writelines(diff)
            if not left.endswith("\n") or not right.endswith("\n"):
                sys.stdout.write("\\ No newline at end of file\n")
        return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Machine-generate v1 contract snapshots from the live modules.",
    )
    parser.add_argument(
        "--check", action="store_true",
        help="regenerate into a temp dir and diff against the committed fixtures",
    )
    parser.add_argument(
        "--build-db", type=Path, metavar="PATH", default=None,
        help="materialize a SQLite database from legacy_v1.sql at PATH",
    )
    args = parser.parse_args(argv)
    if args.check and args.build_db is not None:
        parser.error("--check and --build-db cannot be combined")
    if args.build_db is not None:
        build_db(args.build_db)
        return 0
    if args.check:
        return check()
    generate(HERE)
    for name in FIXTURE_NAMES:
        print(HERE / name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
