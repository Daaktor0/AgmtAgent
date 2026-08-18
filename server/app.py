"""Local HTTPS server: serves the Word task pane and the agent API.

Everything runs on 127.0.0.1. The document text never leaves the machine except
in the model calls you configure, and the API key stays in config.yaml on disk.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.config import Config  # noqa: E402
from agent.document import build_document  # noqa: E402
from agent.memory import get_store, record_disposition  # noqa: E402
from agent.router import Router, RouterError  # noqa: E402
from agent.supervisor import MODES, Supervisor  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
cfg = Config.load()
router = Router(cfg)
app = FastAPI(title="Agreement Review & Drafting Agent")


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


@app.get("/api/health")
def health():
    return {"ok": True, "has_key": bool(cfg.api_key), "modes": {
        k: v["name"] for k, v in MODES.items()}}


@app.get("/api/models")
def models():
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
def settings(s: Settings):
    if s.api_key is not None:
        cfg.save_key(s.api_key.strip())
        router.cfg = cfg
    if s.pinned is not None:
        cfg.save_pins(s.pinned)
        router.cfg = cfg
    return {"ok": True, "has_key": bool(cfg.api_key), "pinned": cfg.pinned}


@app.post("/api/checks")
def checks(req: ReviewRequest):
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
def review(req: ReviewRequest):
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
def disposition(issue_id: str, body: DispositionIn):
    try:
        result = record_disposition(
            get_store(), issue_id, body.action, body.final_text, body.note,
        )
    except OSError as exc:
        return {"error": str(exc)}
    return result


@app.get("/api/runs/{run_id}")
def run_get(run_id: str):
    try:
        row = get_store().get_run(run_id)
    except OSError as exc:
        return {"error": str(exc)}
    if row is None:
        return {"error": "run not found"}
    return row


@app.get("/api/positions")
def positions(topic: str = ""):
    try:
        rows = get_store().active_positions(topic or None)
    except OSError as exc:
        return {"error": str(exc), "positions": []}
    return {"positions": rows}


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
