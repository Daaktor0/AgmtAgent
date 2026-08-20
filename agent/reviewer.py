"""Second-reader pass over recorded issues. No document transcript."""
from __future__ import annotations

import json
import re
from typing import Any

from .config import load_skill
from .router import Router, RouterError

VERDICTS = {"confirm", "downgrade", "merge", "drop"}
_SEV = ["high", "medium", "low"]


def _qc_checklist() -> str:
    skill = load_skill()
    start = skill.find("# 14. Quality-Control")
    if start < 0:
        return "Drop issues that are not real defects. Confirm the rest."
    end = skill.find("\n# 15.", start)
    return skill[start:end if end > start else None].strip()


def reverify_anchors(issues: list[dict], paragraphs: list[str]) -> None:
    """Mutate issues: a quoted old_text that is gone from the document is dropped."""
    for issue in issues:
        old = issue.get("old_text") or ""
        if not old:
            continue
        if any(old in p for p in paragraphs):
            issue["anchor_verified"] = True
            continue
        issue["anchor_verified"] = False
        issue["reviewer_verdict"] = "drop"
        issue["reviewer_note"] = "old_text failed deterministic re-verify."


def _parse_verdicts(text: str) -> list[dict]:
    blob = (text or "").strip()
    if blob.startswith("```"):
        blob = re.sub(r"^```(?:json)?\s*", "", blob)
        blob = re.sub(r"\s*```$", "", blob)
    data = json.loads(blob)
    if isinstance(data, dict):
        data = data.get("verdicts") or data.get("issues") or []
    if not isinstance(data, list):
        return []
    out = []
    for item in data:
        if not isinstance(item, dict):
            continue
        verdict = str(item.get("verdict") or "").strip().lower()
        if verdict not in VERDICTS:
            continue
        out.append(item)
    return out


def _downgrade(issue: dict) -> None:
    sev = str(issue.get("severity") or "").lower()
    if sev in _SEV and _SEV.index(sev) < len(_SEV) - 1:
        issue["severity"] = _SEV[_SEV.index(sev) + 1]


def apply_verdicts(issues: list[dict], verdicts: list[dict]) -> list[dict]:
    by_id = {}
    for issue in issues:
        ident = issue.get("id")
        if ident is not None:
            by_id[ident] = issue

    for item in verdicts:
        ident = item.get("id")
        issue = by_id.get(ident)
        if issue is None:
            continue
        if issue.get("reviewer_verdict") == "drop":
            continue
        verdict = str(item.get("verdict") or "").strip().lower()
        issue["reviewer_verdict"] = verdict
        note = str(item.get("note") or item.get("reason") or "").strip()
        if note:
            issue["reviewer_note"] = note
        if verdict == "downgrade":
            _downgrade(issue)
        if verdict == "merge":
            target = item.get("merge_into") or item.get("merge_with")
            issue["reviewer_merge_into"] = target

    kept: list[dict] = []
    for issue in issues:
        verdict = issue.get("reviewer_verdict") or "confirm"
        if verdict == "drop":
            continue
        if verdict == "merge" and issue.get("reviewer_merge_into") not in (None, "", issue.get("id")):
            target = by_id.get(issue["reviewer_merge_into"])
            if target is not None and target.get("reviewer_verdict") != "drop":
                extra = issue.get("title") or issue.get("id")
                prior = target.get("reviewer_note") or ""
                target["reviewer_note"] = (prior + " Merged: " + str(extra)).strip()
                continue
        if "reviewer_verdict" not in issue:
            issue["reviewer_verdict"] = "confirm"
        kept.append(issue)
    return kept


def _ask_model(issues: list[dict], router: Router) -> tuple[list[dict], str | None]:
    pending = [i for i in issues if i.get("reviewer_verdict") != "drop"]
    if not pending:
        return [], None
    compact = []
    for issue in pending:
        compact.append({
            "id": issue.get("id"),
            "ref": issue.get("ref"),
            "title": issue.get("title"),
            "severity": issue.get("severity"),
            "classification": issue.get("classification"),
            "consequence": (issue.get("consequence") or "")[:400],
            "old_text": (issue.get("old_text") or "")[:200],
            "new_text": (issue.get("new_text") or "")[:200],
            "evidence_tier": issue.get("evidence_tier"),
        })
    messages = [
        {"role": "system", "content":
            "You are a second reader on an agreement review. You receive recorded "
            "issues, not the transcript. For each issue return confirm, downgrade, "
            "merge, or drop, with a short reason. Drop noise, duplicates, and "
            "issues that invent wording. Downgrade overstated severity. Merge "
            "true duplicates into the surviving id.\n\n"
            + _qc_checklist()
            + "\n\nReply with JSON only: "
            '{"verdicts":[{"id":1,"verdict":"confirm","note":"...","merge_into":null}]}'},
        {"role": "user", "content": json.dumps({"issues": compact}, indent=2)},
    ]
    slug = router.resolve("reviewer")
    resp = router.chat("reviewer", messages, model=slug, temperature=0, max_tokens=2500)
    text = (resp.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    return _parse_verdicts(text), resp.get("_model") or slug


def review_issues(
    issues: list[dict],
    paragraphs: list[str],
    router: Any | None = None,
) -> tuple[list[dict], dict]:
    """Re-verify anchors, optionally ask a reviewer model, apply verdicts."""
    work = [dict(item) for item in issues]
    reverify_anchors(work, paragraphs)
    model = None
    model_verdicts: list[dict] = []
    if router is not None and any(i.get("reviewer_verdict") != "drop" for i in work):
        try:
            model_verdicts, model = _ask_model(work, router)
        except (RouterError, json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
            for issue in work:
                if "reviewer_verdict" not in issue:
                    issue["reviewer_verdict"] = "confirm"
                    issue["reviewer_note"] = f"reviewer unavailable: {exc}"
    kept = apply_verdicts(work, model_verdicts)
    report = {
        "kept": len(kept),
        "dropped": [i.get("id") for i in work if i.get("reviewer_verdict") == "drop"],
        "downgraded": [i.get("id") for i in kept if i.get("reviewer_verdict") == "downgrade"],
        "merged": [i.get("id") for i in work if i.get("reviewer_verdict") == "merge"
                   and i not in kept],
        "model": model,
    }
    return kept, report


EVIDENCE_VERDICTS = {"confirm", "downgrade", "drop", "human_review"}


def _quote_in_document(quote: str, paragraphs: list[str]) -> bool:
    if not quote:
        return False
    return any(quote in p for p in paragraphs)


def review_from_evidence(
    issues: list[dict],
    evidence: list[dict],
    paragraphs: list[str],
    router: Any | None = None,
) -> tuple[list[dict], dict]:
    """Independent review. Re-reads source evidence. No document-write tools.

    Reviewer failure is `unreviewed`, never automatic confirmation.
    """
    work = [dict(item) for item in issues]
    by_id = {e.get("evidence_id"): e for e in evidence if e.get("evidence_id")}

    for issue in work:
        ids = list(issue.get("evidence_ids") or [])
        if issue.get("evidence") and isinstance(issue["evidence"], dict):
            ids.append(issue["evidence"].get("evidence_id"))
        quotes: list[str] = []
        for evid_id in ids:
            rec = by_id.get(evid_id) or {}
            quotes.extend(rec.get("exact_quotes") or [])
            if rec.get("exact_quote"):
                quotes.append(rec["exact_quote"])
        if issue.get("old_text"):
            quotes.append(issue["old_text"])
        verified = [q for q in quotes if q and _quote_in_document(q, paragraphs)]
        missing = [q for q in quotes if q and q not in verified]
        if quotes and not verified:
            issue["reviewer_verdict"] = "drop"
            issue["reviewer_note"] = "evidence quotes failed deterministic re-read."
            issue["anchor_verified"] = False
        elif missing:
            issue["reviewer_verdict"] = "human_review"
            issue["reviewer_note"] = "some cited evidence could not be re-read."
            issue["anchor_verified"] = False
        else:
            issue["anchor_verified"] = True if verified else issue.get("anchor_verified")

    pending = [i for i in work if i.get("reviewer_verdict") not in {"drop"}]
    model = None
    if router is not None and pending:
        compact = []
        for issue in pending:
            ids = list(issue.get("evidence_ids") or [])
            quotes = []
            for evid_id in ids:
                rec = by_id.get(evid_id) or {}
                quotes.extend(rec.get("exact_quotes") or [])
                if rec.get("exact_quote"):
                    quotes.append(rec["exact_quote"])
            compact.append({
                "id": issue.get("id") or issue.get("issue_id"),
                "ref": issue.get("ref"),
                "title": issue.get("title"),
                "severity": issue.get("severity"),
                "consequence": (issue.get("consequence") or "")[:400],
                "evidence": quotes[:6],
            })
        messages = [
            {"role": "system", "content":
                "You are an independent second reader. You receive recorded issues "
                "and their exact evidence quotes, not the analyst transcript. "
                "Re-read the quotes. Verdicts: confirm, downgrade, drop, human_review. "
                "You have no document-write tools. Reply JSON only: "
                '{"verdicts":[{"id":1,"verdict":"confirm","note":"..."}]}'},
            {"role": "user", "content": json.dumps({"issues": compact}, indent=2)},
        ]
        try:
            slug = router.resolve("reviewer")
            resp = router.chat("reviewer", messages, model=slug, temperature=0, max_tokens=2500)
            text = (resp.get("choices") or [{}])[0].get("message", {}).get("content") or ""
            model = resp.get("_model") or slug
            parsed = _parse_verdicts(text)
            extra = []
            blob = (text or "").strip()
            try:
                data = json.loads(blob if not blob.startswith("```") else re.sub(r"^```(?:json)?\s*|\s*```$", "", blob))
                rows = data.get("verdicts") if isinstance(data, dict) else data
                for item in rows or []:
                    verdict = str((item or {}).get("verdict") or "").strip().lower()
                    if verdict in {"human_review", "require_human_review"}:
                        extra.append(item)
            except (json.JSONDecodeError, TypeError, AttributeError):
                extra = []
            verdicts = parsed + extra
            by_issue = {}
            for issue in work:
                ident = issue.get("id") or issue.get("issue_id")
                if ident is not None:
                    by_issue[ident] = issue
            for item in verdicts:
                issue = by_issue.get(item.get("id"))
                if issue is None or issue.get("reviewer_verdict") == "drop":
                    continue
                verdict = str(item.get("verdict") or "").strip().lower()
                if verdict == "require_human_review":
                    verdict = "human_review"
                if verdict not in EVIDENCE_VERDICTS:
                    continue
                issue["reviewer_verdict"] = verdict
                note = str(item.get("note") or item.get("reason") or "").strip()
                if note:
                    issue["reviewer_note"] = note
                if verdict == "downgrade":
                    _downgrade(issue)
        except Exception as exc:  # reviewer failure is unreviewed, never confirm
            for issue in work:
                if "reviewer_verdict" not in issue:
                    issue["reviewer_verdict"] = "unreviewed"
                    issue["reviewer_note"] = f"reviewer unavailable: {exc}"
            model = None

    for issue in work:
        if "reviewer_verdict" not in issue:
            # Model not asked (no router) — still not an automatic confirmation
            # of legal correctness; mark unreviewed unless already dropped.
            issue["reviewer_verdict"] = "unreviewed"
            issue.setdefault("reviewer_note", "independent review not run")

    kept = [i for i in work if i.get("reviewer_verdict") != "drop"]
    report = {
        "kept": len(kept),
        "dropped": [i.get("id") or i.get("issue_id") for i in work
                    if i.get("reviewer_verdict") == "drop"],
        "downgraded": [i.get("id") or i.get("issue_id") for i in kept
                       if i.get("reviewer_verdict") == "downgrade"],
        "unreviewed": [i.get("id") or i.get("issue_id") for i in kept
                       if i.get("reviewer_verdict") == "unreviewed"],
        "human_review": [i.get("id") or i.get("issue_id") for i in kept
                         if i.get("reviewer_verdict") == "human_review"],
        "model": model,
    }
    return kept, report
