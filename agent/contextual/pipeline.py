"""Golden-slice pipeline: command → resolve → focused run → review → card."""
from __future__ import annotations

from typing import Any

from agent.contextual.command import capture_command, put_command
from agent.contextual.drafter import draft_minimum_amendment
from agent.contextual.focused import run_focused_analysis
from agent.contextual.profile import choose_profile, should_escalate_deep
from agent.contextual.resolver import ambiguity_prompt, resolve_command
from agent.document import Document, build_document
from agent.reviewer import review_from_evidence
from agent.runtime.base import RunHandle
from agent.runtime.current import CurrentAgmtRuntime
from agent.runtime.dsh import DSHUnavailable
from agent.runtime.factory import get_runtime
from agent.schemas.ids import new_id
from agent.tools import Toolbox


def _document(paragraphs: list[str] | Document, extras: dict | None = None) -> Document:
    if isinstance(paragraphs, Document):
        return paragraphs
    if extras:
        payload = {"paragraphs": paragraphs, **extras}
        return build_document(payload)
    return Document(paragraphs)


def run_contextual_command(
    *,
    matter_id: str,
    document_id: str,
    document_version_id: str,
    raw_text: str,
    paragraphs: list[str] | Document,
    selection: Any = None,
    extras: dict | None = None,
    provenance: dict | None = None,
    chosen_ref_ids: list[str] | None = None,
    idempotency_key: str = "",
    router: Any | None = None,
    runtime: Any | None = None,
    live_document_hash: str | None = None,
    draft: bool = False,
) -> dict[str, Any]:
    doc = _document(paragraphs, extras)
    command = capture_command(
        matter_id=matter_id,
        document_id=document_id,
        document_version_id=document_version_id,
        raw_text=raw_text,
        selection=selection,
        idempotency_key=idempotency_key,
        provenance=provenance,
        chosen_ref_ids=chosen_ref_ids,
    )
    command = resolve_command(
        command, document=doc, live_document_hash=live_document_hash,
    )
    command.execution_profile = choose_profile(command)
    put_command(command)

    if command.status == "stale":
        return _payload(command, state="stale", error="The document has changed since capture.")
    if command.status == "ambiguous":
        return _payload(
            command,
            state="ambiguity",
            message=ambiguity_prompt(command),
        )
    if command.status == "failed":
        missing = [r for r in command.references if r.status == "not_found"]
        reason = missing[0].reason if missing else "Could not resolve a reference."
        return _payload(command, state="error", error=reason)

    command.status = "running"
    put_command(command)

    box = Toolbox(doc, router or object(), {})
    handle = RunHandle(run_id=new_id())
    command.run_id = handle.run_id

    def _read_selection() -> dict:
        sel = command.selection
        return {"text": sel.selected_text if sel else ""}

    tools = {
        "get_outline": box.get_outline,
        "read_selection": _read_selection,
        "get_definition_losses": lambda: box.get_definition("Losses"),
        "search_double_recovery": lambda: box.search_document(
            r"double.?recover|recover twice|without duplication", regex=True,
        ),
        "check_overlap": lambda: box.check_overlap("indemnity recover loss"),
    }

    runtime_name = "current"
    runtime_result: dict[str, Any] = {}
    try:
        rt = runtime if runtime is not None else get_runtime(router)
        runtime_name = getattr(rt, "name", "current")
        runtime_result = rt.run(
            command.raw_input.raw_text, tools, cancel=handle,
        )
        if runtime_result.get("status") == "cancelled":
            command.status = "cancelled"
            put_command(command)
            return _payload(command, state="error", error="cancelled")
    except DSHUnavailable as exc:
        command.status = "failed"
        put_command(command)
        return _payload(command, state="error", error=str(exc), runtime="dsh")

    analysis = run_focused_analysis(command, doc, toolbox=box)
    if should_escalate_deep(
        evidence_count=len(analysis.get("evidence_ids") or []),
        overlap_refs=len(analysis.get("overlap_refs") or []),
        reviewer_challenged=False,
        retrieval_conflict=False,
    ):
        command.execution_profile = "DEEP"

    issues = []
    if analysis.get("issue"):
        issue = dict(analysis["issue"])
        issue["id"] = 1
        issue["issue_id"] = new_id()
        issues = [issue]

    kept, review_report = review_from_evidence(
        issues, analysis.get("evidence") or [], doc.paras, router=router,
    )
    _STAMP = {
        "confirm": "confirmed",
        "confirmed": "confirmed",
        "downgrade": "downgrade",
        "drop": "dropped",
        "unreviewed": "unreviewed",
        "human_review": "human_review",
    }
    reviewer_status = "confirmed"
    if not issues:
        reviewer_status = "not_required"
    elif review_report.get("dropped") and not kept:
        reviewer_status = "dropped"
        analysis["finding"] = "no_issue"
        analysis["title"] = "Independent review dropped the issue"
        analysis["why"] = "The independent reviewer did not confirm a double-recovery defect."
    elif any(i.get("reviewer_verdict") == "unreviewed" for i in kept):
        reviewer_status = "unreviewed"
    elif any(i.get("reviewer_verdict") == "human_review" for i in kept):
        reviewer_status = "human_review"
    elif kept:
        reviewer_status = _STAMP.get(kept[0].get("reviewer_verdict") or "", "unreviewed")

    amendment = None
    if draft:
        amendment = draft_minimum_amendment(command, analysis, doc)

    command.status = "completed"
    put_command(command)

    card = {
        "hooks": analysis.get("hooks") or [],
        "title": analysis.get("title"),
        "finding": analysis.get("finding"),
        "why": analysis.get("why"),
        "evidence": [
            {
                "evidence_id": e.get("evidence_id"),
                "ref": e.get("block_or_clause_ref") or (e.get("refs") or [""])[0],
                "quote": e.get("exact_quote") or (e.get("exact_quotes") or [""])[0],
                "para": e.get("para"),
                "retrieval_method": e.get("retrieval_method"),
            }
            for e in analysis.get("evidence") or []
        ],
        "reviewer": reviewer_status,
        "reviewer_note": (kept[0].get("reviewer_note") if kept else None),
        "can_amend": analysis.get("finding") == "double_recovery" and reviewer_status in {
            "confirmed", "unreviewed", "downgrade", "human_review", "confirm",
        },
    }
    return _payload(
        command,
        state="contextual_result",
        card=card,
        analysis=analysis,
        review=review_report,
        amendment=amendment,
        runtime=runtime_name,
        runtime_result={"status": runtime_result.get("status"), "run_id": runtime_result.get("run_id")},
    )


def _payload(command, **extra) -> dict[str, Any]:
    return {
        "command": command.model_dump(),
        "command_id": command.command_id,
        "status": command.status,
        **extra,
    }
