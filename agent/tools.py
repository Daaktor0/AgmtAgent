"""Tools the supervisor can call, and their dispatch."""
from __future__ import annotations

import json
import re
from typing import Any, Callable

from .document import Document
from .memory import get_store, query_positions
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
                           "Results are ground truth. Essential for QC and consistency modes. "
                           "Reports suppressed checks when the ingest lacked comments, "
                           "tracked changes or companion documents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "family": {
                        "type": "string",
                        "description": "Optional family filter: structure, defterm, amount, "
                                       "date, threshold, party, exec, xdoc.",
                    },
                },
            },
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
            "name": "plan",
            "description": "Record the steps you will take on this document. Call this first. "
                           "The plan is shown in the pane.",
            "parameters": {
                "type": "object",
                "properties": {
                    "steps": {
                        "type": "array", "items": {"type": "string"},
                        "description": "Ordered steps you will take.",
                    },
                    "focus": {
                        "type": "string",
                        "description": "What this run is concentrating on.",
                    },
                },
                "required": ["steps"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "revise_plan",
            "description": "Replace the current plan when the work changes direction.",
            "parameters": {
                "type": "object",
                "properties": {
                    "steps": {"type": "array", "items": {"type": "string"}},
                    "reason": {"type": "string"},
                },
                "required": ["steps"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_comments",
            "description": "Word comments on this document, with thread structure.",
            "parameters": {
                "type": "object",
                "properties": {
                    "unresolved_only": {"type": "boolean", "default": True},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_tracked_changes",
            "description": "Unaccepted revisions, with before/after text.",
            "parameters": {
                "type": "object",
                "properties": {
                    "author": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": ["insertion", "deletion", "format", "move"],
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_table",
            "description": "A table extracted from the document as rows and columns.",
            "parameters": {
                "type": "object",
                "properties": {
                    "index": {
                        "type": "integer",
                        "description": "0-based table index. Default 0.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_documents",
            "description": "Documents in this matter and their roles.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_matter",
            "description": "Search every document in the matter.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "regex": {"type": "boolean", "default": False},
                    "offset": {"type": "integer"},
                    "limit": {"type": "integer"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_versions",
            "description": "Changes between this document and a counterpart, or the "
                           "unaccepted tracked changes if that is what we have.",
            "parameters": {
                "type": "object",
                "properties": {
                    "other_id": {
                        "type": "string",
                        "description": "Companion document id. Defaults to the counterpart.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_house_position",
            "description": "Learned house positions relevant to a topic, from prior "
                           "accept/reject decisions.",
            "parameters": {
                "type": "object",
                "properties": {"topic": {"type": "string"}},
                "required": ["topic"],
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

    def __init__(self, doc: Document, router: Router, mandate: dict,
                 matter: list[Document] | None = None):
        self.doc = doc
        self.router = router
        self.mandate = mandate
        self.matter: list[Document] = matter or [doc]
        self.issues: list[dict] = []
        self.questions: list[dict] = []
        self.finished: str | None = None
        self.plan: dict | None = None
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
            "plan": self.set_plan,
            "revise_plan": self.revise_plan,
            "get_comments": self.get_comments,
            "get_tracked_changes": self.get_tracked_changes,
            "read_table": self.read_table,
            "list_documents": self.list_documents,
            "search_matter": self.search_matter,
            "compare_versions": self.compare_versions,
            "get_house_position": self.get_house_position,
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

    def run_mechanical_checks(self, family: str | None = None) -> Any:
        findings = self.doc.mechanical_checks(family=family)
        return {
            "findings": [
                {"check": i.check, "check_id": i.check_id, "family": i.family,
                 "version": i.check_version, "severity": i.severity, "para": i.para,
                 "ref": i.ref, "detail": i.detail, "excerpt": i.excerpt,
                 "certainty": i.certainty, "evidence_tier": i.evidence_tier}
                for i in findings
            ],
            "suppressed": list(self.doc.suppressed_checks),
        }

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

        para = kw.get("para", -1)
        try:
            para = int(para)
        except (TypeError, ValueError):
            para = -1
        kw["para"] = para
        if para != -1 and not (0 <= para < len(self.doc.paras)):
            return {"rejected": True, "reason": "block_idx",
                    "error": "block_idx is outside the document."}

        ref = str(kw.get("ref") or "").strip()
        if ref and self.doc.find_clause(ref) is None:
            looks_like_ref = bool(re.fullmatch(
                r"(?:(?:clause|section|schedule|article)\s+)?\d+(?:\.\d+)*",
                ref, re.IGNORECASE,
            ))
            if looks_like_ref:
                return {"rejected": True, "reason": "unresolved_ref",
                        "error": f"ref {ref!r} does not resolve to a clause or schedule."}

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
        if 0 <= para < len(self.doc.unique_local_ids):
            kw["unique_local_id"] = self.doc.unique_local_ids[para]
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

    def set_plan(self, steps: list[str], focus: str = "") -> Any:
        self.plan = {"steps": list(steps), "focus": focus, "revised": False}
        return {"accepted": True, "plan": self.plan}

    def revise_plan(self, steps: list[str], reason: str = "") -> Any:
        self.plan = {"steps": list(steps), "focus": reason, "revised": True}
        return {"accepted": True, "plan": self.plan}

    def get_comments(self, unresolved_only: bool = True) -> Any:
        if self.doc.comments is None:
            return {"available": False, "comments": [],
                    "note": "Comments were not ingested from Word."}
        rows = list(self.doc.comments)
        if unresolved_only:
            rows = [c for c in rows if not c.get("resolved")]
        return {"available": True, "comments": rows, "total": len(rows)}

    def get_tracked_changes(self, author: str | None = None,
                            type: str | None = None) -> Any:  # noqa: A002
        if self.doc.revisions is None:
            return {"available": False, "changes": [],
                    "note": "Tracked changes were not ingested from Word."}
        rows = list(self.doc.revisions)
        if author:
            rows = [r for r in rows if (r.get("author") or "").lower() == author.lower()]
        if type:
            rows = [r for r in rows if (r.get("type") or "").lower() == type.lower()]
        return {"available": True, "changes": rows, "total": len(rows)}

    def read_table(self, index: int = 0) -> Any:
        if self.doc.tables is None:
            return {"available": False, "error": "Tables were not ingested from Word."}
        if not self.doc.tables:
            return {"available": True, "error": "No tables in this document."}
        idx = int(index)
        if idx < 0 or idx >= len(self.doc.tables):
            return {"available": True, "error": f"table index {idx} out of range",
                    "total": len(self.doc.tables)}
        table = self.doc.tables[idx]
        return {
            "available": True,
            "index": idx,
            "total": len(self.doc.tables),
            "start_idx": table.get("start_idx"),
            "headers": table.get("headers") or [],
            "rows": table.get("rows") or [],
        }

    def list_documents(self) -> Any:
        return {"documents": [
            {"id": d.doc_id, "role": d.role, "filename": d.filename,
             "paragraphs": len(d.paras), "clauses": len(d.clauses)}
            for d in self.matter
        ]}

    def search_matter(self, query: str, regex: bool = False,
                      offset: int = 0, limit: int = 40) -> Any:
        from .matter import search_matter
        all_hits = search_matter(self.matter, query, regex=regex)
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

    def compare_versions(self, other_id: str | None = None) -> Any:
        if self.doc.revisions:
            return {
                "source": "tracked_changes",
                "changes": [
                    {
                        "para": r.get("block_idx"),
                        "type": r.get("type"),
                        "author": r.get("author"),
                        "before": r.get("text_before") or "",
                        "after": r.get("text_after") or "",
                    }
                    for r in self.doc.revisions
                ],
            }
        other = None
        if other_id:
            other = next((d for d in self.matter if d.doc_id == other_id), None)
        if other is None:
            other = next((d for d in self.matter if d.role == "counterpart"), None)
        if other is None:
            other = next((d for d in self.matter if d is not self.doc), None)
        if other is None:
            return {"error": "No counterpart version or tracked changes."}
        changes = []
        mine = {c.number: c for c in self.doc.clauses if c.number}
        theirs = {c.number: c for c in other.clauses if c.number}
        for num, c in mine.items():
            if num not in theirs:
                changes.append({"ref": c.ref, "kind": "added_here",
                                "heading": c.heading})
                continue
            a = self.doc.read(c.start, c.end)
            b = other.read(theirs[num].start, theirs[num].end)
            if a != b:
                changes.append({"ref": c.ref, "kind": "text_differs",
                                "heading": c.heading})
        for num, c in theirs.items():
            if num not in mine:
                changes.append({"ref": c.ref, "kind": "only_in_counterpart",
                                "heading": c.heading})
        return {
            "source": "counterpart",
            "other_id": other.doc_id,
            "changes": changes[:200],
            "total": len(changes),
            "truncated": len(changes) > 200,
        }

    def get_house_position(self, topic: str) -> Any:
        try:
            rows = query_positions(get_store(), topic)
        except OSError as exc:
            return {"error": f"position store unavailable: {exc}", "positions": []}
        return {"topic": topic, "positions": [
            {"topic": r["topic"], "polarity": r["polarity"],
             "statement": r["statement"], "evidence_count": r["evidence_count"]}
            for r in rows
        ]}
