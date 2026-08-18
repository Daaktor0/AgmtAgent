"""Tools the supervisor can call, and their dispatch."""
from __future__ import annotations

import json
from typing import Any, Callable

from .document import Document
from .router import Router

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "get_outline",
            "description": "Document architecture: every clause, schedule and heading with "
                           "its reference, paragraph range and length. Call this first. "
                           "Paginated — if truncated is true, call again with offset.",
            "parameters": {
                "type": "object",
                "properties": {
                    "offset": {"type": "integer", "description": "Skip this many clauses."},
                    "limit": {"type": "integer", "description": "Page size. Default 400."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read",
            "description": "Read the exact text of a clause by reference (e.g. '7.3', "
                           "'Schedule 2') or a paragraph range. Paragraph numbers are shown "
                           "in square brackets and are the anchors you must cite.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ref": {"type": "string", "description": "Clause or schedule reference."},
                    "start": {"type": "integer", "description": "First paragraph index."},
                    "end": {"type": "integer", "description": "Last paragraph index."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_document",
            "description": "Find every paragraph mentioning a term or matching a regex. Use "
                           "this for the overlap check: before proposing protection, find "
                           "where else the same risk is already addressed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "regex": {"type": "boolean", "default": False},
                    "offset": {"type": "integer", "description": "Skip this many hits."},
                    "limit": {"type": "integer", "description": "Page size. Default 40."},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_definition",
            "description": "The definition of a term plus every paragraph where it operates. "
                           "Never assess a definition without seeing where it bites.",
            "parameters": {
                "type": "object",
                "properties": {"term": {"type": "string"}},
                "required": ["term"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_definitions",
            "description": "Every defined term found, with usage counts.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_mechanical_checks",
            "description": "Exact, non-model checks: broken cross-references, duplicate or "
                           "unused definitions, unfilled placeholders, numbering gaps, "
                           "figure-vs-words amount mismatches, defined-term case drift. "
                           "Results are ground truth. Essential for QC and consistency modes.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delegate",
            "description": "Hand a bounded slice of the document to a worker model with a "
                           "specific instruction, and get its analysis back. Use for breadth: "
                           "first-pass reads of long schedules, warranty sets, reserved "
                           "matters lists. You remain responsible for the conclusion — treat "
                           "the worker's output as a draft to verify, not an answer.",
            "parameters": {
                "type": "object",
                "properties": {
                    "role": {"type": "string", "enum": ["analyst", "drafter", "extractor"]},
                    "instruction": {"type": "string"},
                    "start": {"type": "integer"},
                    "end": {"type": "integer"},
                },
                "required": ["role", "instruction", "start", "end"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_overlap",
            "description": "Where else in this document the same risk or concept is already "
                           "addressed. Call this before proposing new protection. Pass the "
                           "refs it returns as overlap_trace on record_issue.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string",
                              "description": "The risk, concept or phrase to look for."},
                    "exclude_para": {
                        "type": "integer",
                        "description": "Paragraph you are about to change — omitted from hits.",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "record_issue",
            "description": "Record one issue for the user. Call once per issue, as you settle "
                           "it. Only record what survives your own consequence test.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ref": {"type": "string", "description": "Clause reference, e.g. '9.2'."},
                    "para": {"type": "integer", "description": "Paragraph index to anchor to."},
                    "title": {"type": "string", "description": "One line, the issue itself."},
                    "classification": {
                        "type": "string",
                        "enum": ["legal_defect", "drafting_defect", "commercial_risk",
                                 "negotiation_preference", "factual_point"],
                    },
                    "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                    "position": {
                        "type": "string",
                        "enum": ["accept", "accept_with_drafting_fix", "revise", "delete",
                                 "clarify", "negotiate", "reject", "commercial_call",
                                 "factual_confirmation_needed"],
                    },
                    "consequence": {
                        "type": "string",
                        "description": "What actually goes wrong. Economic and legal effect, "
                                       "not a paraphrase of the clause.",
                    },
                    "old_text": {
                        "type": "string",
                        "description": "The exact existing words to replace or delete. Must be "
                                       "copied verbatim from the document and be under 200 "
                                       "characters so it can be located in Word. Omit if no "
                                       "text change is proposed.",
                    },
                    "new_text": {
                        "type": "string",
                        "description": "Replacement for old_text. Empty string means delete. "
                                       "Minimum effective change only.",
                    },
                    "comment": {
                        "type": "string",
                        "description": "External bubble comment, in the restrained voice of "
                                       "Mode E. Omit unless a comment is actually useful.",
                    },
                    "consequential": {
                        "type": "array", "items": {"type": "string"},
                        "description": "Other clause references that must move if this change "
                                       "is accepted.",
                    },
                    "overlap_trace": {
                        "type": "array", "items": {"type": "string"},
                        "description": "Clause refs from check_overlap. Required whenever "
                                       "new_text proposes new wording.",
                    },
                },
                "required": ["ref", "para", "title", "classification", "severity",
                             "position", "consequence"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ask_user",
            "description": "Ask the user a question you cannot resolve from the document — a "
                           "mandate gap or a factual/instruction point. Returns immediately "
                           "without an answer; the question is surfaced in the task pane. Do "
                           "not use it to avoid work you can do from the document.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "why": {"type": "string", "description": "What turns on the answer."},
                },
                "required": ["question"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finish",
            "description": "End the review. Give the headline first: the two or three things "
                           "that actually matter, then anything the user must instruct on.",
            "parameters": {
                "type": "object",
                "properties": {"summary": {"type": "string"}},
                "required": ["summary"],
            },
        },
    },
]


class Toolbox:
    """Executes tool calls against one document. Collects issues and questions."""

    def __init__(self, doc: Document, router: Router, mandate: dict):
        self.doc = doc
        self.router = router
        self.mandate = mandate
        self.issues: list[dict] = []
        self.questions: list[dict] = []
        self.finished: str | None = None
        self.delegations = 0
        self._handlers: dict[str, Callable[..., Any]] = {
            "get_outline": self.get_outline,
            "read": self.read,
            "search_document": self.search_document,
            "get_definition": self.get_definition,
            "list_definitions": self.list_definitions,
            "run_mechanical_checks": self.run_mechanical_checks,
            "delegate": self.delegate,
            "check_overlap": self.check_overlap,
            "record_issue": self.record_issue,
            "ask_user": self.ask_user,
            "finish": self.finish,
        }

    def call(self, name: str, args: dict) -> str:
        fn = self._handlers.get(name)
        if not fn:
            return json.dumps({"error": f"no such tool: {name}"})
        try:
            raw = json.dumps(fn(**args), ensure_ascii=False)
            if len(raw) <= 60000:
                return raw
            return json.dumps({
                "truncated": True, "total_chars": len(raw), "shown": 55000,
                "preview": raw[:55000],
            }, ensure_ascii=False)
        except TypeError as exc:
            return json.dumps({"error": f"bad arguments for {name}: {exc}"})
        except Exception as exc:  # a tool failure must not kill the run
            return json.dumps({"error": f"{name} failed: {exc}"})

    # ---------------- handlers ----------------

    def get_outline(self, offset: int = 0, limit: int = 400) -> Any:
        total = len(self.doc.clauses)
        offset = max(0, int(offset))
        limit = max(1, int(limit))
        items = self.doc.outline(max_items=limit, offset=offset)
        shown = len(items)
        truncated = offset + shown < total
        return {
            "paragraph_count": len(self.doc.paras),
            "outline": items,
            "total": total,
            "shown": shown,
            "offset": offset,
            "truncated": truncated,
            "next_offset": (offset + shown) if truncated else None,
        }

    def read(self, ref: str | None = None, start: int | None = None,
             end: int | None = None) -> Any:
        if ref:
            c = self.doc.find_clause(ref)
            if not c:
                near = [x.ref for x in self.doc.clauses if ref.lower() in x.ref.lower()][:8]
                return {"error": f"no clause '{ref}'", "did_you_mean": near}
            return {"ref": c.ref, "heading": c.heading,
                    "text": self.doc.read(c.start, c.end)}
        if start is None:
            return {"error": "give ref, or start and end"}
        return {"text": self.doc.read(start, end if end is not None else start + 20)}

    def search_document(self, query: str, regex: bool = False,
                        offset: int = 0, limit: int = 40) -> Any:
        all_hits = self.doc.search_all(query, regex=regex)
        if all_hits and all_hits[0].get("error"):
            return {"query": query, "hits": all_hits, "total": 0,
                    "shown": 0, "truncated": False}
        offset = max(0, int(offset))
        limit = max(1, int(limit))
        page = all_hits[offset:offset + limit]
        truncated = offset + len(page) < len(all_hits)
        return {
            "query": query,
            "hits": page,
            "total": len(all_hits),
            "shown": len(page),
            "offset": offset,
            "truncated": truncated,
            "next_offset": (offset + len(page)) if truncated else None,
        }

    def get_definition(self, term: str) -> Any:
        d = self.doc.definitions.get(term)
        if not d:
            near = [t for t in self.doc.definitions if term.lower() in t.lower()][:10]
            return {"error": f"'{term}' not found as a defined term",
                    "did_you_mean": near}
        usages = d.usages
        return {
            "term": d.term, "defined_at_para": d.para, "definition": d.text,
            "operates_at_paras": usages[:60], "usage_count": len(usages),
            "total": len(usages),
            "truncated": len(usages) > 60,
        }

    def list_definitions(self) -> Any:
        return {"definitions": [
            {"term": t, "para": d.para, "uses": len(d.usages)}
            for t, d in sorted(self.doc.definitions.items())
        ]}

    def run_mechanical_checks(self) -> Any:
        return {"findings": [
            {"check": i.check, "severity": i.severity, "para": i.para,
             "ref": i.ref, "detail": i.detail, "excerpt": i.excerpt,
             "certainty": i.certainty, "evidence_tier": i.evidence_tier}
            for i in self.doc.mechanical_checks()
        ]}

    def delegate(self, role: str, instruction: str, start: int, end: int) -> Any:
        if self.delegations >= 25:
            return {"error": "delegation budget exhausted; do the remaining work yourself"}
        self.delegations += 1
        slice_text = self.doc.read(start, end)
        if len(slice_text) > 400_000:
            return {"error": "slice too large; narrow the paragraph range"}
        msgs = [
            {"role": "system", "content":
                "You are a corporate transactions lawyer assisting a supervising partner. "
                "You have been given one slice of an agreement and one instruction. Answer "
                "only that instruction, on that slice. Cite paragraph numbers in square "
                "brackets for everything you assert. Quote existing wording exactly when you "
                "refer to it. Do not propose drafting unless asked. Do not speculate about "
                "parts of the document you cannot see. If the slice does not support a "
                "conclusion, say so.\n\n"
                f"Mandate: {json.dumps(self.mandate)}"},
            {"role": "user", "content":
                f"Instruction: {instruction}\n\nSlice (paragraphs {start}-{end}):\n{slice_text}"},
        ]
        resp = self.router.chat(role, msgs)
        return {"model": resp.get("_model"),
                "analysis": resp["choices"][0]["message"].get("content", "")}

    def check_overlap(self, query: str, exclude_para: int | None = None) -> Any:
        hits = self.doc.search_all(query)
        if hits and hits[0].get("error"):
            return {"query": query, "error": hits[0]["error"],
                    "hits": [], "total": 0, "already_addressed": False}
        others = [h for h in hits if exclude_para is None or h["para"] != exclude_para]
        return {
            "query": query,
            "hits": others[:40],
            "total": len(others),
            "shown": min(40, len(others)),
            "truncated": len(others) > 40,
            "already_addressed": len(others) > 0,
            "refs": [h["ref"] for h in others[:40]],
        }

    def record_issue(self, **kw) -> Any:
        kw.setdefault("old_text", "")
        kw.setdefault("new_text", "")
        kw.setdefault("comment", "")
        kw.setdefault("consequential", [])
        kw.setdefault("overlap_trace", [])
        old = kw.get("old_text") or ""
        kw["old_text"] = old

        found = False
        if old:
            para = kw.get("para", -1)
            found = 0 <= para < len(self.doc.paras) and old in self.doc.paras[para]
            if not found:
                found = any(old in p for p in self.doc.paras)
                if found:
                    kw["para"] = next(i for i, p in enumerate(self.doc.paras)
                                      if old in p)

        if old and (len(old) > 200 or not found):
            if len(old) > 200:
                error = "Too long for Word to locate. Narrow the change."
            else:
                error = ("old_text not found. Re-read the paragraph and "
                         "copy the wording exactly.")
            return {"rejected": True, "reason": "anchor", "error": error}

        if kw.get("position") in {"revise", "delete"} and not old.strip():
            return {"rejected": True, "reason": "missing_old_text",
                    "error": "A revise/delete position requires the exact words being changed."}

        consequence = kw.get("consequence") or ""
        if kw.get("severity") == "high" and len(consequence.strip()) < 120:
            return {"rejected": True, "reason": "thin_consequence",
                    "error": "State what actually goes wrong, not a paraphrase of the clause."}

        new_text = (kw.get("new_text") or "").strip()
        trace = kw.get("overlap_trace") or []
        if new_text and not trace:
            return {"rejected": True, "reason": "overlap",
                    "error": "Call check_overlap first. Adding a second remedy "
                             "for one wrong is a failure."}

        if old:
            kw["anchor_verified"] = True
            kw["evidence_tier"] = 2
        else:
            kw["anchor_verified"] = None
            kw["evidence_tier"] = 3
        kw["id"] = len(self.issues) + 1
        self.issues.append(kw)
        return {"recorded": kw["id"]}

    def ask_user(self, question: str, why: str = "") -> Any:
        self.questions.append({"question": question, "why": why})
        return {"asked": True, "note": "No answer available in this run. Proceed on the most "
                                       "defensible assumption and state it, or stop if you "
                                       "genuinely cannot."}

    def finish(self, summary: str) -> Any:
        self.finished = summary
        return {"done": True}
