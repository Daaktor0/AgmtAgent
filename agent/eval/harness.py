"""Offline eval runner: mechanical checks plus an optional issue dump. No model."""
from __future__ import annotations

import json
from pathlib import Path

from ..document import Document, Issue, build_document
from .corpus import load_corpus
from .metrics import score
from .report import format_report

# Dump files are typically a recording from one sample_sha run (global, no doc_id).
# Score dump issues against sample_sha only; every other corpus doc stays mechanical-only.


def normalize_issue(raw: object) -> dict:
    if isinstance(raw, Issue):
        return {
            "check": raw.check or None,
            "ref": raw.ref or "",
            "para": raw.para,
            "title": "",
            "detail": raw.detail or "",
            "excerpt": raw.excerpt or "",
            "old_text": "",
            "new_text": "",
            "severity": raw.severity or "",
            "overlap_trace": [],
            "anchor_verified": None,
        }
    src = raw if isinstance(raw, dict) else {}
    if src.get("event") == "issue" and isinstance(src.get("issue"), dict):
        src = src["issue"]
    check = src.get("check")
    if check is not None:
        check = str(check).strip() or None
    para = src.get("para")
    if para is not None and para != "":
        try:
            para = int(para)
        except (TypeError, ValueError):
            para = None
    else:
        para = None
    trace = src.get("overlap_trace")
    if not isinstance(trace, list):
        trace = []
    verified = src.get("anchor_verified")
    if verified not in (True, False, None):
        verified = None
    out = {
        "check": check,
        "ref": str(src.get("ref") or ""),
        "para": para,
        "title": str(src.get("title") or ""),
        "detail": str(src.get("detail") or ""),
        "excerpt": str(src.get("excerpt") or ""),
        "old_text": str(src.get("old_text") or ""),
        "new_text": str(src.get("new_text") or ""),
        "severity": str(src.get("severity") or ""),
        "overlap_trace": trace,
        "anchor_verified": verified,
    }
    if src.get("id") not in (None, ""):
        out["id"] = src["id"]
    return out


def _extract_issues(data: object) -> list[dict]:
    if isinstance(data, list):
        if any(isinstance(item, dict) and "event" in item for item in data):
            out: list[dict] = []
            for item in data:
                if isinstance(item, dict) and item.get("event") == "issue":
                    payload = item.get("issue") if isinstance(item.get("issue"), dict) else {}
                    out.append(normalize_issue(payload))
            return out
        return [normalize_issue(item) for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        if isinstance(data.get("issues"), list):
            return [normalize_issue(item) for item in data["issues"] if isinstance(item, dict)]
        if data.get("event") == "issue":
            payload = data.get("issue") if isinstance(data.get("issue"), dict) else {}
            return [normalize_issue(payload)]
        return [normalize_issue(data)]
    return []


def load_issues(path: Path) -> list[dict]:
    text = Path(path).read_text(encoding="utf-8")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        out: list[dict] = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            out.extend(_extract_issues(json.loads(line)))
        return out
    return _extract_issues(data)


def word_count(paragraphs: list[str]) -> int:
    return sum(len(p.split()) for p in paragraphs)


def _metric_block(counts: dict) -> dict:
    def ratio(num: float, den: float, empty: float) -> float:
        if den == 0:
            return empty
        return num / den

    words = max(int(counts.get("word_count") or 0), 1)
    return {
        "recall@must_find_high": ratio(
            counts["must_find_high_matched"], counts["must_find_high_total"], 1.0
        ),
        "recall@must_find_all": ratio(
            counts["must_find_matched"], counts["must_find_total"], 1.0
        ),
        "precision": ratio(counts["precision_hits"], counts["precision_total"], 1.0),
        "trap_rate": ratio(counts["traps_fired"], counts["traps_total"], 0.0),
        "noise_rate": (counts["n_issues"] / words) * 1000.0,
        "anchor_pass_rate": ratio(counts["anchor_pass"], counts["anchor_total"], 1.0),
        "overlap_compliance": ratio(counts["overlap_pass"], counts["overlap_total"], 1.0),
    }


def _zero_counts() -> dict:
    return {
        "must_find_high_matched": 0,
        "must_find_high_total": 0,
        "must_find_matched": 0,
        "must_find_total": 0,
        "precision_hits": 0,
        "precision_total": 0,
        "traps_fired": 0,
        "traps_total": 0,
        "anchor_pass": 0,
        "anchor_total": 0,
        "overlap_pass": 0,
        "overlap_total": 0,
        "n_issues": 0,
        "word_count": 0,
    }


def run_eval(
    corpus_dir: Path,
    *,
    mode: str = "A",
    dump: Path | None = None,
    out_dir: Path | None = None,
    reviewer: bool = False,
) -> dict:
    docs = load_corpus(Path(corpus_dir))
    dump_issues = load_issues(Path(dump)) if dump is not None else []

    per_doc: list[dict] = []
    totals = _zero_counts()
    for doc in docs:
        parsed = build_document(doc.ingested, doc_id=doc.doc_id)
        issues = [normalize_issue(item) for item in parsed.mechanical_checks()]
        if dump is not None and doc.doc_id == "sample_sha":
            if reviewer:
                from ..reviewer import review_issues
                dump_issues, _ = review_issues(dump_issues, doc.paragraphs)
            issues.extend(dump_issues)
        words = word_count(doc.paragraphs)
        result = score(issues, doc.labels, words)
        counts = result["counts"]
        for key, value in counts.items():
            totals[key] = totals.get(key, 0) + value
        per_doc.append({
            "doc_id": doc.doc_id,
            "metrics": {k: result[k] for k in _metric_block(counts)},
            "hits": result["hits"],
            "misses": result["misses"],
            "traps_fired": result["traps_fired"],
            "unmatched_issues": result["unmatched_issues"],
            "n_issues": counts["n_issues"],
            "word_count": counts["word_count"],
        })

    overall = _metric_block(totals)
    report = {
        "mode": mode,
        "docs": len(docs),
        "issues": totals["n_issues"],
        "words": totals["word_count"],
        "overall": overall,
        "per_doc": per_doc,
    }

    written: Path | None = None
    if out_dir is not None:
        dest = Path(out_dir)
        dest.mkdir(parents=True, exist_ok=True)
        written = dest / "eval-run.json"
        written.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(format_report(report, written))
    return report
