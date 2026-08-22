"""Local HTTPS server: serves the Word task pane and the agent API.

Everything runs on 127.0.0.1. The document text never leaves the machine except
in the model calls you configure, and the API key stays in config.yaml on disk.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.runtime.auth import check_authorized, auth_enabled  # noqa: E402

from agent.actions.tickets import (  # noqa: E402
    LiveDocument, approve_action, apply_prepared, get_ticket, prepare_ticket,
    verify_write,
)
from agent.config import Config  # noqa: E402
from agent.contextual.command import get_command  # noqa: E402
from agent.contextual.drafter import draft_minimum_amendment  # noqa: E402
from agent.contextual.pipeline import run_contextual_command  # noqa: E402
from agent.document import Document, build_document  # noqa: E402
from agent.flags import load_flags  # noqa: E402
from agent.memory import get_store, record_disposition  # noqa: E402
from agent.router import Router, RouterError  # noqa: E402
from agent.schemas.action import ProposedAction  # noqa: E402
from agent.schemas.ids import document_hash  # noqa: E402
from agent.supervisor import MODES, Supervisor  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
cfg = Config.load()
router = Router(cfg)
app = FastAPI(title="Agreement Review & Drafting Agent")


def _guard(authorization: str | None) -> None:
    """Pairing gate (plan commit 4). No-op until AGMT_PAIRING_TOKEN is set."""
    if not check_authorized(authorization):
        raise HTTPException(status_code=401, detail="unpaired or expired token")


@app.get("/", include_in_schema=False)
def app_home():
    return RedirectResponse("/taskpane.html")


class CommentIn(BaseModel):
    id: str = ""
    block_idx: int = -1
    thread_id: str = ""
    parent_id: str | None = None
    author: str = ""
    created_at: str = ""
    text: str = ""
    resolved: bool = False


class RevisionIn(BaseModel):
    id: str = ""
    block_idx: int = -1
    type: str = "insertion"
    author: str = ""
    date: str = ""
    text_before: str = ""
    text_after: str = ""


class TableIn(BaseModel):
    id: str = ""
    start_idx: int = -1
    headers: list[str] = []
    rows: list[list[str]] = []


class CompanionIn(BaseModel):
    id: str = ""
    doc_id: str = ""
    role: str = "ancillary"
    filename: str = ""
    paragraphs: list[str]
    list_prefixes: list[str] = []
    prefixes: list[str] = []
    comments: list[CommentIn] = []
    revisions: list[RevisionIn] = []
    tables: list[TableIn] = []


class ReviewRequest(BaseModel):
    paragraphs: list[str]
    list_prefixes: list[str] = []
    mode: str = "A"
    instruction: str = ""
    party: str = ""
    counterparty: str = ""
    document_type: str = ""
    stage: str = ""
    context: str = ""
    comments: list[CommentIn] | None = None
    revisions: list[RevisionIn] | None = None
    tables: list[TableIn] | None = None
    unique_local_ids: list[str] = []
    list_levels: list[int | None] = []
    documents: list[CompanionIn] = []


class DispositionIn(BaseModel):
    action: str
    final_text: str = ""
    note: str = ""


def _extras(req: ReviewRequest) -> dict:
    extras: dict = {
        "paragraphs": req.paragraphs,
        "list_prefixes": req.list_prefixes,
        "unique_local_ids": req.unique_local_ids,
        "list_levels": req.list_levels,
    }
    if req.comments is not None:
        extras["comments"] = [c.model_dump() for c in req.comments]
    if req.revisions is not None:
        extras["revisions"] = [r.model_dump() for r in req.revisions]
    if req.tables is not None:
        extras["tables"] = [t.model_dump() for t in req.tables]
    if req.documents:
        extras["companions"] = []
        for d in req.documents:
            extras["companions"].append({
                "doc_id": d.doc_id or d.id or "other",
                "role": d.role,
                "filename": d.filename,
                "paragraphs": d.paragraphs,
                "list_prefixes": d.list_prefixes or d.prefixes,
                "comments": [c.model_dump() for c in d.comments],
                "revisions": [r.model_dump() for r in d.revisions],
                "tables": [t.model_dump() for t in d.tables],
            })
    return extras


class Settings(BaseModel):
    api_key: str | None = None
    pinned: dict[str, str] | None = None


class SelectionIn(BaseModel):
    selection_id: str | None = None
    document_id: str | None = None
    document_version_id: str | None = None
    story: str = "body"
    story_type: str | None = None
    selected_text: str = ""
    selected_text_hash: str | None = None
    selected_text_sha256: str | None = None
    unique_local_ids: list[str] = []
    block_ids: list[str] = []
    first_block_idx: int | None = None
    last_block_idx: int | None = None
    prefix_text: str = ""
    suffix_text: str = ""
    structural_path: list[str] = []
    paragraph_indexes: list[int] = []
    captured_at: str | None = None
    source_word_api: str = "Document.getSelection"


class ContextualCommandIn(BaseModel):
    matter_id: str = "local"
    document_id: str = "primary"
    document_version_id: str = ""
    raw_text: str
    modality: str = "text"
    activation: str = "typed"
    selection: SelectionIn | None = None
    paragraphs: list[str] = []
    list_prefixes: list[str] = []
    unique_local_ids: list[str] = []
    list_levels: list[int | None] = []
    comments: list[CommentIn] | None = None
    revisions: list[RevisionIn] | None = None
    tables: list[TableIn] | None = None
    captured_doc_hash: str | None = None
    live_document_hash: str | None = None
    chosen_ref_ids: list[str] = []
    idempotency_key: str = ""
    draft: bool = False


class DraftIn(BaseModel):
    command_id: str
    paragraphs: list[str] = []
    list_prefixes: list[str] = []


class ActionApproveIn(BaseModel):
    action: dict
    paragraphs: list[str]
    document_version_id: str
    version_hash: str | None = None
    protected: bool = False
    capabilities: list[str] = ["track_changes", "search"]
    tracking_mode: str = "off"


class ActionApplyIn(BaseModel):
    ticket_id: str
    paragraphs: list[str]
    document_version_id: str
    version_hash: str | None = None
    protected: bool = False
    capabilities: list[str] = ["track_changes", "search"]
    tracking_mode: str = "off"


def _selection_payload(sel: SelectionIn | None) -> dict | None:
    if sel is None:
        return None
    data = sel.model_dump()
    if not data.get("selected_text_sha256"):
        data["selected_text_sha256"] = data.get("selected_text_hash") or ""
    if not data.get("story_type"):
        data["story_type"] = "main" if data.get("story") == "body" else data.get("story")
    return data


@app.get("/api/health")
def health():
    flags = load_flags()
    try:
        schema_version = get_store().schema_version
    except Exception:
        schema_version = None
    return {"ok": True, "has_key": bool(cfg.api_key), "schema_version": schema_version,
            "modes": {k: v["name"] for k, v in MODES.items()}, "flags": flags.as_dict()}


@app.get("/api/models")
def models(authorization: str | None = Header(default=None)):
    if auth_enabled():
        _guard(authorization)
    try:
        catalog = router.catalog()
    except Exception as exc:
        return {"error": f"Could not reach OpenRouter: {exc}", "models": [], "roles": {}}
    slim = sorted(
        ({"id": m["id"], "name": m.get("name", m["id"]),
          "context": (m.get("top_provider") or {}).get("context_length")
                     or m.get("context_length"),
          "tools": "tools" in (m.get("supported_parameters") or [])}
         for m in catalog),
        key=lambda m: m["id"],
    )
    return {"models": slim, "roles": router.resolved_roles(), "pinned": cfg.pinned}


@app.post("/api/settings")
def settings(s: Settings, authorization: str | None = Header(default=None)):
    if auth_enabled():
        _guard(authorization)
    if s.api_key is not None:
        cfg.save_key(s.api_key.strip())
        router.cfg = cfg
    if s.pinned is not None:
        cfg.save_pins(s.pinned)
        router.cfg = cfg
    return {"ok": True, "has_key": bool(cfg.api_key), "pinned": cfg.pinned}


@app.post("/api/checks")
def checks(req: ReviewRequest, authorization: str | None = Header(default=None)):
    if auth_enabled():
        _guard(authorization)
    """Mechanical checks only. No model call, no cost, instant."""
    doc = build_document(_extras(req))
    findings = doc.mechanical_checks()
    payload = [
        {"check": i.check, "check_id": i.check_id, "family": i.family,
         "severity": i.severity, "para": i.para,
         "ref": i.ref, "detail": i.detail, "excerpt": i.excerpt,
         "certainty": i.certainty, "evidence_tier": i.evidence_tier}
        for i in findings
    ]
    run_id = None
    try:
        issues = [
            {**f, "id": n + 1, "title": f["detail"],
             "classification": "drafting_defect", "_mechanical": f["check"]}
            for n, f in enumerate(payload)
        ]
        run_id = get_store().save_run(
            mode="checks", mandate={}, instruction="", status="done",
            summary=f"{len(payload)} mechanical findings", issues=issues,
        )
        for n, f in enumerate(payload):
            f["issue_id"] = issues[n].get("issue_id")
    except OSError:
        run_id = None
    return {
        "paragraphs": len(doc.paras),
        "clauses": len(doc.clauses),
        "definitions": len(doc.definitions),
        "findings": payload,
        "suppressed": list(doc.suppressed_checks),
        "run_id": run_id,
    }


@app.post("/api/review")
def review(req: ReviewRequest, authorization: str | None = Header(default=None)):
    if auth_enabled():
        _guard(authorization)
    mandate = {
        "party_represented": req.party,
        "counterparty": req.counterparty,
        "document_type": req.document_type,
        "negotiation_stage": req.stage,
        "commercial_context": req.context,
    }
    sup = Supervisor(cfg, router)

    def stream():
        try:
            for event in sup.run(req.paragraphs, req.mode, mandate, req.instruction,
                                 prefixes=req.list_prefixes, extras=_extras(req)):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except RouterError as exc:
            yield f"data: {json.dumps({'event': 'error', 'message': str(exc)})}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'event': 'error', 'message': repr(exc)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


@app.post("/api/issues/{issue_id}/disposition")
def disposition(issue_id: str, body: DispositionIn, authorization: str | None = Header(default=None)):
    if auth_enabled():
        _guard(authorization)
    try:
        result = record_disposition(
            get_store(), issue_id, body.action, body.final_text, body.note,
        )
    except OSError as exc:
        return {"error": str(exc)}
    return result


@app.get("/api/runs/{run_id}")
def run_get(run_id: str, authorization: str | None = Header(default=None)):
    if auth_enabled():
        _guard(authorization)
    try:
        row = get_store().get_run(run_id)
    except OSError as exc:
        return {"error": str(exc)}
    if row is None:
        return {"error": "run not found"}
    return row


# ---- durable async runs (plan commit 17) ----
from agent.worker import RunWorker  # noqa: E402

_worker: RunWorker | None = None


def get_worker() -> RunWorker:
    global _worker
    if _worker is None:
        _worker = RunWorker(get_store(),
                            lambda: Supervisor(cfg, router))
        for stale in _worker.recover_stale():
            print(f"[startup] reaped stale run {stale}")
    return _worker


class AsyncRunIn(BaseModel):
    paragraphs: list[str]
    mode: str = "A"
    instruction: str = ""
    mandate: dict = {}
    list_prefixes: list[str] | None = None


@app.post("/api/runs")
def create_async_run(body: AsyncRunIn,
                     authorization: str | None = Header(default=None)):
    """Start a durable background run; poll or stream via /api/runs/{id}."""
    if auth_enabled():
        _guard(authorization)
    try:
        run_id = get_worker().submit(
            mode=body.mode, mandate=body.mandate,
            instruction=body.instruction, paragraphs=body.paragraphs,
            prefixes=body.list_prefixes)
    except Exception as exc:  # noqa: BLE001
        return {"error": repr(exc)}
    return {"run_id": run_id, "status": "running"}


@app.get("/api/runs/{run_id}/stream")
def stream_run(run_id: str, since: int = 0,
               authorization: str | None = Header(default=None)):
    """SSE long-poll over persisted events — reconnect-safe resume."""
    if auth_enabled():
        _guard(authorization)

    def stream():
        cursor = since
        idle = 0
        while idle < 120:  # ~10 min max idle before closing
            events = get_worker().wait_for_events(run_id, cursor, timeout=5.0)
            if not events:
                idle += 1
                yield ": keep-alive\n\n"
                continue
            idle = 0
            for e in events:
                payload = json.loads(e["payload_json"] or "{}")
                payload["event"] = e["event_type"]
                payload["seq"] = e["seq"]
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                cursor = e["seq"]
            status = get_worker().status(run_id)
            if status and status["status"] in {"done", "failed", "cancelled"}:
                yield f'data: {{"event":"end","status":"{status["status"]}"}}\n\n'
                break

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


@app.get("/api/runs/{run_id}/events")
def run_events(run_id: str, since: int = 0,
               authorization: str | None = Header(default=None)):
    """Replay persisted events after `since` — SSE resume without loss."""
    if auth_enabled():
        _guard(authorization)
    try:
        events = get_store().list_events(run_id, since_seq=since)
    except OSError as exc:
        return {"error": str(exc)}
    return {"run_id": run_id, "since": since, "events": [
        {"seq": e["seq"], "ts": e["ts"], **json.loads(e["payload_json"] or "{}"),
         "event": e["event_type"]} for e in events]}


@app.get("/api/positions")
def positions(topic: str = "", authorization: str | None = Header(default=None)):
    if auth_enabled():
        _guard(authorization)
    try:
        rows = get_store().active_positions(topic or None)
    except OSError as exc:
        return {"error": str(exc), "positions": []}
    return {"positions": rows}


@app.post("/api/contextual-commands")
def contextual_commands(req: ContextualCommandIn, authorization: str | None = Header(default=None)):
    if auth_enabled():
        _guard(authorization)
    flags = load_flags()
    if not flags.contextual_command:
        return {"error": "AGMT_CONTEXTUAL_COMMAND is off"}
    version_id = req.document_version_id or "live"
    extras = {
        "paragraphs": req.paragraphs,
        "list_prefixes": req.list_prefixes,
        "unique_local_ids": req.unique_local_ids,
        "list_levels": req.list_levels,
    }
    if req.comments is not None:
        extras["comments"] = [c.model_dump() for c in req.comments]
    if req.revisions is not None:
        extras["revisions"] = [r.model_dump() for r in req.revisions]
    if req.tables is not None:
        extras["tables"] = [t.model_dump() for t in req.tables]
    provenance = {}
    captured = req.captured_doc_hash or (document_hash(req.paragraphs) if req.paragraphs else None)
    if captured:
        provenance["captured_doc_hash"] = captured
    try:
        return run_contextual_command(
            matter_id=req.matter_id,
            document_id=req.document_id,
            document_version_id=version_id,
            raw_text=req.raw_text,
            paragraphs=req.paragraphs,
            selection=_selection_payload(req.selection),
            extras=extras,
            provenance=provenance,
            chosen_ref_ids=req.chosen_ref_ids,
            idempotency_key=req.idempotency_key,
            router=router if cfg.api_key else None,
            live_document_hash=req.live_document_hash or captured,
            draft=req.draft,
        )
    except Exception as exc:  # noqa: BLE001
        return {"error": repr(exc), "status": "failed"}


@app.post("/api/contextual-commands/{command_id}/draft")
def contextual_draft(command_id: str, req: DraftIn, authorization: str | None = Header(default=None)):
    if auth_enabled():
        _guard(authorization)
    command = get_command(command_id)
    if command is None:
        return {"error": "command not found"}
    extras = {"paragraphs": req.paragraphs, "list_prefixes": req.list_prefixes}
    doc = build_document(extras) if req.paragraphs else Document([])
    from agent.contextual.focused import run_focused_analysis
    analysis = run_focused_analysis(command, doc)
    return draft_minimum_amendment(command, analysis, doc)


@app.post("/api/actions/prepare")
def actions_prepare(req: ActionApproveIn, authorization: str | None = Header(default=None)):
    if auth_enabled():
        _guard(authorization)
    flags = load_flags()
    if not flags.safe_actions:
        return {"error": "AGMT_SAFE_ACTIONS is off"}
    action = approve_action(ProposedAction.model_validate(req.action))
    live = LiveDocument(
        paragraphs=req.paragraphs,
        document_version_id=req.document_version_id,
        version_hash=req.version_hash or document_hash(req.paragraphs),
        tracking_mode=req.tracking_mode,  # type: ignore[arg-type]
        protected=req.protected,
        capabilities=set(req.capabilities),
    )
    ticket, reason = prepare_ticket(action, live)
    if ticket is None:
        return {"status": "refused", "reason": reason}
    return {"status": "prepared", "ticket": ticket.model_dump(), "action": action.model_dump()}


@app.post("/api/actions/apply")
def actions_apply(req: ActionApplyIn, authorization: str | None = Header(default=None)):
    if auth_enabled():
        _guard(authorization)
    flags = load_flags()
    if not flags.safe_actions:
        return {"error": "AGMT_SAFE_ACTIONS is off"}
    live = LiveDocument(
        paragraphs=req.paragraphs,
        document_version_id=req.document_version_id,
        version_hash=req.version_hash or document_hash(req.paragraphs),
        tracking_mode=req.tracking_mode,  # type: ignore[arg-type]
        protected=req.protected,
        capabilities=set(req.capabilities),
    )
    result = apply_prepared(live, req.ticket_id)
    ticket = get_ticket(req.ticket_id)
    result["ticket"] = ticket.model_dump() if ticket else None
    result["paragraphs"] = live.paragraphs
    return result


@app.post("/api/actions/verify")
def actions_verify(req: ActionApplyIn, authorization: str | None = Header(default=None)):
    if auth_enabled():
        _guard(authorization)
    ticket = get_ticket(req.ticket_id)
    if ticket is None:
        return {"status": "refused", "reason": "missing_ticket"}
    live = LiveDocument(
        paragraphs=req.paragraphs,
        document_version_id=req.document_version_id,
        version_hash=req.version_hash or document_hash(req.paragraphs),
        protected=req.protected,
        capabilities=set(req.capabilities),
    )
    status = verify_write(live, ticket)
    return {"status": status, "live_hash": live.version_hash}


app.mount("/", StaticFiles(directory=ROOT / "addin", html=True), name="addin")


def main():
    import os
    import uvicorn

    host = os.environ.get("BIND_HOST", "127.0.0.1")
    use_tls = os.environ.get("TLS", "1") != "0"
    kwargs = {"host": host, "port": cfg.port, "log_level": "warning"}
    if use_tls:
        from server.certs import ensure_cert
        cert, key = ensure_cert()
        kwargs["ssl_certfile"] = str(cert)
        kwargs["ssl_keyfile"] = str(key)
        scheme = "https"
    else:
        scheme = "http"
    print(f"\n  Agreement Agent running at {scheme}://{host}:{cfg.port}")
    print(f"  API key configured: {'yes' if cfg.api_key else 'NO — set it in the task pane'}\n")
    uvicorn.run(app, **kwargs)


if __name__ == "__main__":
    main()
