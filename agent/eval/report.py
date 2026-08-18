"""Stdout report for `python -m agent.eval run`."""
from __future__ import annotations

from pathlib import Path


def format_report(result: dict, written: Path | None = None) -> str:
    overall = result.get("overall") or {}
    lines = [
        f"eval run  mode={result.get('mode', 'A')}  "
        f"docs={result.get('docs', 0)}  "
        f"issues={result.get('issues', 0)}  "
        f"words={result.get('words', 0)}"
    ]
    width = 0
    for doc in result.get("per_doc") or []:
        width = max(width, len(str(doc.get("doc_id") or "")))
    for doc in result.get("per_doc") or []:
        metrics = doc.get("metrics") or {}
        name = str(doc.get("doc_id") or "").ljust(width)
        lines.append(
            f"{name}  recall_all={metrics.get('recall@must_find_all', 0):.2f}  "
            f"precision={metrics.get('precision', 0):.2f}  "
            f"traps={metrics.get('trap_rate', 0):.2f}  "
            f"noise={metrics.get('noise_rate', 0):.2f}"
        )
    lines.append(
        f"{'overall'.ljust(width) if width else 'overall'}  "
        f"recall@must_find_high={overall.get('recall@must_find_high', 0):.2f}  "
        f"recall@must_find_all={overall.get('recall@must_find_all', 0):.2f}"
    )
    pad = " " * (width if width else len("overall"))
    lines.append(
        f"{pad}  precision={overall.get('precision', 0):.2f}  "
        f"trap_rate={overall.get('trap_rate', 0):.2f}  "
        f"noise_rate={overall.get('noise_rate', 0):.2f}"
    )
    lines.append(
        f"{pad}  anchor_pass_rate={overall.get('anchor_pass_rate', 0):.2f}  "
        f"overlap_compliance={overall.get('overlap_compliance', 0):.2f}"
    )
    if written is not None:
        lines.append(f"wrote {Path(written).as_posix()}")
    return "\n".join(lines)
