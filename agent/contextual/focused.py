"""Focused double-recovery analysis using Agmt document tools.

Discovers issues through outline, exact read, definition lookup, use-sites,
search and overlap. Does not hard-code clause numbers or answers.
"""
from __future__ import annotations

import re
from typing import Any

from agent.document import Document
from agent.schemas.command import ContextualCommand, ReferenceCandidate
from agent.schemas.evidence import Evidence, make_evidence
from agent.tools import Toolbox

_RECOVERY = re.compile(
    r"\b(recover|recovery|indemnif|gross(?:ed)?\s+up|deemed to have suffered|"
    r"shall pay|amount payable|compensation|damages)\b",
    re.I,
)
_DOUBLE = re.compile(
    r"\b(double[-\s]?recover|recover twice|without duplication|"
    r"no double recovery|not recover more than once|shall not recover twice)\b",
    re.I,
)
_ADDITION = re.compile(r"\b(in addition|additionally|without prejudice to)\b", re.I)
_LOSS_TERM = re.compile(r"\b(Losses?|Indemnified Losses?|Damages)\b")


def _record(
    bag: list[Evidence],
    *,
    document_version_id: str,
    quote: str,
    ref: str,
    para: int | None,
    method: str,
) -> Evidence:
    item = make_evidence(
        document_version_id=document_version_id,
        quote=quote,
        ref=ref,
        para=para,
        retrieval_method=method,  # type: ignore[arg-type]
        producer="agmt.focused",
    )
    bag.append(item)
    return item


def _selection_para(command: ContextualCommand, doc: Document) -> int | None:
    sel = command.selection
    if sel and sel.first_block_idx is not None:
        return sel.first_block_idx
    text = (sel.selected_text if sel else "") or ""
    if not text:
        return None
    for i, para in enumerate(doc.paras):
        if text in para:
            return i
    return None


def _resolved(command: ContextualCommand, category: str) -> ReferenceCandidate | None:
    mention_ids = {m.mention_id for m in command.mentions if m.category == category}
    for ref in command.references:
        if ref.mention_id in mention_ids and ref.status == "resolved":
            return ref.candidate
    return None


def _family_text(doc: Document, ref: str | None) -> tuple[int | None, str]:
    if not ref:
        return None, ""
    clause = doc.find_clause(ref)
    if clause is None:
        return None, ""
    start, end = clause.start, clause.end
    number = (clause.number or "").rstrip(".")
    prefix = number + "."
    for other in doc.clauses:
        n = (other.number or "").rstrip(".")
        if n == number or (number and (n.startswith(prefix) or n == number)):
            start = min(start, other.start)
            end = max(end, other.end)
    return start, " ".join(doc.paras[start:end + 1])


def run_focused_analysis(
    command: ContextualCommand,
    doc: Document,
    *,
    toolbox: Toolbox | None = None,
) -> dict[str, Any]:
    """Return a result card payload. Every proposition carries evidence ids."""
    box = toolbox or Toolbox(doc, object(), {})
    version_id = command.document_version_id
    evidence: list[Evidence] = []
    tools_used: list[str] = []

    outline = box.get_outline()
    tools_used.append("get_outline")

    sel = command.selection
    selected_text = (sel.selected_text if sel else "") or ""
    sel_para = _selection_para(command, doc)
    sel_clause = doc.clause_at(sel_para) if sel_para is not None else None
    if selected_text:
        _record(
            evidence,
            document_version_id=version_id,
            quote=selected_text,
            ref=sel_clause.ref if sel_clause else (sel.structural_path[-1] if sel and sel.structural_path else ""),
            para=sel_para,
            method="selection",
        )

    indemnity = _resolved(command, "heading")
    indemnity_ref = indemnity.clause_ref if indemnity else None
    fam_start, fam_text = _family_text(doc, indemnity_ref)
    if indemnity_ref:
        read = box.read(ref=indemnity_ref)
        tools_used.append("read")
        quote_src = ""
        if fam_start is not None:
            quote_src = doc.paras[fam_start + 1] if fam_start + 1 < len(doc.paras) else doc.paras[fam_start]
        if not quote_src and not read.get("error"):
            quote_src = doc.paras[indemnity.para] if indemnity and indemnity.para is not None else ""
        if quote_src:
            _record(
                evidence,
                document_version_id=version_id,
                quote=quote_src.strip(),
                ref=indemnity_ref,
                para=fam_start,
                method="exact_read",
            )

    loss_def = None
    for term in ("Losses", "Loss", "Indemnified Losses"):
        got = box.get_definition(term)
        tools_used.append("get_definition")
        if not got.get("error"):
            loss_def = got
            defn_para = got.get("defined_at_para")
            defn_text = doc.paras[defn_para] if isinstance(defn_para, int) and 0 <= defn_para < len(doc.paras) else (got.get("definition") or "")
            _record(
                evidence,
                document_version_id=version_id,
                quote=defn_text,
                ref=term,
                para=defn_para,
                method="definition",
            )
            break

    no_double_hits = box.search_document(
        r"double.?recover|recover twice|without duplication|not recover more than once",
        regex=True,
    )
    tools_used.append("search_document")
    no_double_real = []
    for hit in no_double_hits.get("hits") or []:
        if hit.get("error"):
            continue
        para_text = doc.paras[hit["para"]] if 0 <= hit.get("para", -1) < len(doc.paras) else ""
        if _DOUBLE.search(para_text or hit.get("excerpt") or ""):
            no_double_real.append(hit)
            _record(
                evidence,
                document_version_id=version_id,
                quote=para_text.strip() or (hit.get("excerpt") or ""),
                ref=hit.get("ref") or "",
                para=hit.get("para"),
                method="search",
            )

    overlap = box.check_overlap(
        "indemnity recover loss payment",
        exclude_para=sel_para,
    )
    tools_used.append("check_overlap")
    overlap_refs = list(overlap.get("refs") or [])

    additional_route = bool(
        selected_text
        and _RECOVERY.search(selected_text)
        and (
            _ADDITION.search(selected_text)
            or re.search(r"deemed to have suffered|gross(?:ed)?\s+up", selected_text, re.I)
        )
        and not re.search(r"\bnot a Loss\b|price adjustment", selected_text, re.I)
    )

    indemnity_pays = bool(fam_text and (_RECOVERY.search(fam_text) or _INDEMNITY_BODY.search(fam_text)))

    finding: str
    title: str
    severity = "medium"
    why = ""
    if no_double_real and additional_route and indemnity_pays:
        finding = "resolved_by_existing"
        title = "Existing no-double-recovery language"
        why = (
            "Another provision already prevents recovering twice for the same "
            "Loss, so the selected wording does not open a live duplicate route."
        )
        severity = "low"
    elif additional_route and indemnity_pays and not no_double_real:
        finding = "double_recovery"
        title = "Potential duplicate recovery"
        why = (
            "The selected provision creates an additional recovery route for "
            "Losses that may already be recoverable under the indemnity."
        )
        severity = "high"
    elif additional_route and overlap.get("already_addressed") and not indemnity_pays:
        finding = "distinct_remedies"
        title = "Overlapping but distinct remedies"
        why = (
            "Related payment mechanics exist, but they do not share the same "
            "indemnity recovery measure on the evidence retrieved."
        )
        severity = "low"
    else:
        finding = "no_issue"
        title = "No double-recovery issue identified"
        why = (
            "The selected language does not, on the retrieved evidence, create "
            "a second recovery route for the same Loss."
        )
        severity = "low"

    hooks = []
    if sel_clause:
        hooks.append(sel_clause.ref)
    if indemnity_ref:
        hooks.append(indemnity_ref)
    if loss_def:
        hooks.append(f'Definition: "{loss_def.get("term")}"')

    issue = None
    if finding == "double_recovery" and selected_text:
        issue = {
            "title": title,
            "classification": "legal_defect",
            "severity": severity,
            "position": "revise",
            "consequence": why + " Two routes of recovery for the same underlying Loss may be open.",
            "old_text": selected_text[:200],
            "para": sel_para if sel_para is not None else -1,
            "ref": sel_clause.ref if sel_clause else "",
            "evidence_ids": [e.evidence_id for e in evidence],
            "overlap_trace": overlap_refs[:8],
        }

    return {
        "finding": finding,
        "title": title,
        "why": why,
        "severity": severity,
        "hooks": hooks,
        "evidence": [e.model_dump() for e in evidence],
        "evidence_ids": [e.evidence_id for e in evidence],
        "overlap_refs": overlap_refs,
        "tools_used": tools_used,
        "issue": issue,
        "outline_count": outline.get("total") or len(outline.get("outline") or []),
        "no_double_recovery_present": bool(no_double_real),
        "loss_definition": loss_def.get("term") if loss_def else None,
        "indemnity_ref": indemnity_ref,
        "selection_ref": sel_clause.ref if sel_clause else None,
    }


_INDEMNITY_BODY = re.compile(r"\bindemnif", re.I)
