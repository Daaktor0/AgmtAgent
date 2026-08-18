"""Label matching and eval metrics. No network, no model."""
from __future__ import annotations


def _nonempty_str(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _locus_present(label: dict) -> bool:
    if _nonempty_str(label.get("ref")):
        return True
    for key in ("block_idx", "para"):
        val = label.get(key)
        if val is not None and val != "":
            return True
    return False


def _issue_blob(issue: dict) -> str:
    return (
        f"{issue.get('old_text') or ''}"
        f"{issue.get('excerpt') or ''}"
        f"{issue.get('title') or ''}"
        f"{issue.get('detail') or ''}"
    )


def _accept_blob(issue: dict) -> str:
    return (
        f"{issue.get('title') or ''} "
        f"{issue.get('detail') or ''} "
        f"{issue.get('excerpt') or ''}"
    )


def _is_trap(label: dict) -> bool:
    return bool(label.get("must_not_flag")) or label.get("type") == "trap"


def _accept_tokens(label: dict) -> list[str]:
    raw = label.get("accept_if")
    if not raw:
        raw = label.get("accept_if_titles_match")
    if not isinstance(raw, list):
        return []
    return [str(tok).strip() for tok in raw if str(tok).strip()]


def match_label(issue: dict, label: dict) -> bool:
    """True if issue satisfies label by check+locus, quote, ref-only, or accept_if."""
    label_check = label.get("check")
    if isinstance(label_check, str):
        label_check = label_check.strip() or None
    else:
        label_check = label_check or None

    issue_check = issue.get("check")
    if isinstance(issue_check, str):
        issue_check = issue_check.strip() or None
    elif not issue_check:
        issue_check = None

    if _nonempty_str(label_check) and issue_check == label_check:
        if not _locus_present(label):
            return True
        issue_ref = str(issue.get("ref") or "").strip()
        label_ref = str(label.get("ref") or "").strip()
        if label_ref and issue_ref == label_ref:
            return True
        issue_para = issue.get("para")
        if issue_para is not None:
            for key in ("block_idx", "para"):
                locus = label.get(key)
                if locus is not None and locus != "" and issue_para == locus:
                    return True

    quote = label.get("quote")
    if _nonempty_str(quote) and quote in _issue_blob(issue):
        return True

    label_ref = str(label.get("ref") or "").strip()
    if label_ref:
        conflict = (
            issue_check is not None
            and label_check is not None
            and issue_check != label_check
        )
        if not conflict and str(issue.get("ref") or "").strip() == label_ref:
            return True

    tokens = _accept_tokens(label)
    if tokens:
        blob = _accept_blob(issue).lower()
        if all(tok.lower() in blob for tok in tokens):
            return True

    return False


def _ratio(num: float, den: float, empty: float) -> float:
    if den == 0:
        return empty
    return num / den


def _issue_tag(issue: dict) -> str:
    title = issue.get("title")
    if _nonempty_str(title):
        return str(title)
    ident = issue.get("id")
    if ident not in (None, ""):
        return str(ident)
    check = issue.get("check") or ""
    ref = issue.get("ref") or ""
    tag = f"{check}:{ref}".strip(":")
    if tag:
        return tag
    return str(issue.get("detail") or "")[:80]


def _assign(issues: list[dict], labels: list[dict], taken: list[bool]) -> list[int]:
    """Greedy: each label gets the first unused matching issue. Returns label indexes hit."""
    hit_at: list[int] = []
    for li, lab in enumerate(labels):
        for i, issue in enumerate(issues):
            if taken[i]:
                continue
            if match_label(issue, lab):
                taken[i] = True
                hit_at.append(li)
                break
    return hit_at


def score(issues: list[dict], labels: list[dict], word_count: int) -> dict:
    """Score issues against labels. Vacuous recall/precision/anchor/overlap are 1.0; no traps → 0.0."""
    labels = [lab for lab in labels if isinstance(lab, dict)]
    must_finds = [lab for lab in labels if lab.get("must_find")]
    others = [lab for lab in labels if not lab.get("must_find") and not _is_trap(lab)]
    traps = [lab for lab in labels if _is_trap(lab)]
    high = [
        lab for lab in must_finds
        if str(lab.get("expected_severity") or "").strip().lower() == "high"
    ]

    taken = [False] * len(issues)
    must_hit_idx = _assign(issues, must_finds, taken)
    _assign(issues, others, taken)
    trap_hit_idx = _assign(issues, traps, taken)

    must_hit = {id(must_finds[i]) for i in must_hit_idx}
    high_matched = sum(1 for lab in high if id(lab) in must_hit)

    hits = [str(must_finds[i].get("id") or must_finds[i].get("check") or "") for i in must_hit_idx]
    hit_ids = set(must_hit_idx)
    misses = [
        str(lab.get("id") or lab.get("check") or "")
        for i, lab in enumerate(must_finds)
        if i not in hit_ids
    ]
    traps_fired = [
        str(traps[i].get("id") or traps[i].get("check") or "") for i in trap_hit_idx
    ]
    unmatched_issues = [_issue_tag(iss) for iss, used in zip(issues, taken) if not used]

    precision_hits = 0
    for issue in issues:
        if any(match_label(issue, lab) for lab in must_finds + others):
            precision_hits += 1

    with_old = [iss for iss in issues if _nonempty_str(iss.get("old_text"))]
    anchor_pass = sum(1 for iss in with_old if iss.get("anchor_verified") is True)
    with_new = [iss for iss in issues if _nonempty_str(iss.get("new_text"))]
    overlap_pass = sum(1 for iss in with_new if isinstance(iss.get("overlap_trace"), list) and iss["overlap_trace"])

    words = max(int(word_count), 1)
    counts = {
        "must_find_high_matched": high_matched,
        "must_find_high_total": len(high),
        "must_find_matched": len(must_hit_idx),
        "must_find_total": len(must_finds),
        "precision_hits": precision_hits,
        "precision_total": len(issues),
        "traps_fired": len(trap_hit_idx),
        "traps_total": len(traps),
        "anchor_pass": anchor_pass,
        "anchor_total": len(with_old),
        "overlap_pass": overlap_pass,
        "overlap_total": len(with_new),
        "n_issues": len(issues),
        "word_count": max(int(word_count), 0),
    }
    return {
        "recall@must_find_high": _ratio(high_matched, len(high), 1.0),
        "recall@must_find_all": _ratio(len(must_hit_idx), len(must_finds), 1.0),
        "precision": _ratio(precision_hits, len(issues), 1.0),
        "trap_rate": _ratio(len(trap_hit_idx), len(traps), 0.0),
        "noise_rate": (len(issues) / words) * 1000.0,
        "anchor_pass_rate": _ratio(anchor_pass, len(with_old), 1.0),
        "overlap_compliance": _ratio(overlap_pass, len(with_new), 1.0),
        "hits": hits,
        "misses": misses,
        "traps_fired": traps_fired,
        "unmatched_issues": unmatched_issues,
        "counts": counts,
    }
