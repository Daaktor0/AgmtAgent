"""Compare two eval-run JSON reports."""
from __future__ import annotations

import json
from pathlib import Path

METRICS = (
    "recall@must_find_high",
    "recall@must_find_all",
    "precision",
    "trap_rate",
    "noise_rate",
    "anchor_pass_rate",
    "overlap_compliance",
)


def load_report(path: Path) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if "overall" not in data:
        raise ValueError(f"{path} is not an eval-run report")
    return data


def diff_reports(baseline: dict, candidate: dict) -> dict:
    b = baseline.get("overall") or {}
    c = candidate.get("overall") or {}
    deltas = {}
    for key in METRICS:
        left = float(b.get(key) or 0)
        right = float(c.get(key) or 0)
        deltas[key] = {"baseline": left, "candidate": right, "delta": right - left}
    return {
        "baseline_docs": baseline.get("docs"),
        "candidate_docs": candidate.get("docs"),
        "metrics": deltas,
    }


def format_diff(result: dict) -> str:
    lines = ["eval diff"]
    for key, row in (result.get("metrics") or {}).items():
        sign = "+" if row["delta"] >= 0 else ""
        lines.append(
            f"  {key:24}  {row['baseline']:.4f} -> {row['candidate']:.4f}  "
            f"({sign}{row['delta']:.4f})"
        )
    return "\n".join(lines)


def run_diff(baseline: Path, candidate: Path) -> dict:
    result = diff_reports(load_report(baseline), load_report(candidate))
    print(format_diff(result))
    return result
