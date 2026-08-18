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
