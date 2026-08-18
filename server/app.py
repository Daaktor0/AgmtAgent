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
from agent.document import Document  # noqa: E402
from agent.router import Router, RouterError  # noqa: E402
from agent.supervisor import MODES, Supervisor  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
cfg = Config.load()
router = Router(cfg)
app = FastAPI(title="Agreement Review & Drafting Agent")


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
    doc = Document(req.paragraphs, prefixes=req.list_prefixes)
    return {
        "paragraphs": len(doc.paras),
        "clauses": len(doc.clauses),
        "definitions": len(doc.definitions),
        "findings": [
            {"check": i.check, "severity": i.severity, "para": i.para,
             "ref": i.ref, "detail": i.detail, "excerpt": i.excerpt}
            for i in doc.mechanical_checks()
        ],
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
                                 prefixes=req.list_prefixes):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except RouterError as exc:
            yield f"data: {json.dumps({'event': 'error', 'message': str(exc)})}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'event': 'error', 'message': repr(exc)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


app.mount("/", StaticFiles(directory=ROOT / "addin", html=True), name="addin")


def main():
    import uvicorn

    from server.certs import ensure_cert

    cert, key = ensure_cert()
    print(f"\n  Agreement Agent running at https://localhost:{cfg.port}")
    print(f"  API key configured: {'yes' if cfg.api_key else 'NO — set it in the task pane'}\n")
    uvicorn.run(app, host="127.0.0.1", port=cfg.port,
                ssl_certfile=str(cert), ssl_keyfile=str(key), log_level="warning")


if __name__ == "__main__":
    main()
