"""Offline gate for the two 1.00 metrics from the release checklist (artefact 07).

`python -m agent.eval run` always exits 0, even after a load/parse exception, so
CLI exit status is not a pass condition. Until the CLI grows a threshold flag,
this script regenerates `reports/eval-run.json` and asserts:

    anchor_pass_rate == 1.00
    overlap_compliance == 1.00
    recall@must_find_all == 1.00 and trap_rate == 0.0

Same style as tests/test_pipeline.py: run as a script, PASS/FAIL lines, ends
ALL PASSED. No network.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-gate-"))

failures: list[str] = []


def check(name: str, cond: bool) -> None:
    tag = "PASS" if cond else "FAIL"
    print(f"  {tag}  {name}")
    if not cond:
        failures.append(name)


def main() -> None:
    print("\neval 1.00 gates")

    out_dir = Path(tempfile.mkdtemp(prefix="agmt-evalgate-"))
    proc = subprocess.run(
        [sys.executable, "-m", "agent.eval", "run",
         "--corpus", str(REPO / "eval" / "corpus"), "--out", str(out_dir)],
        cwd=REPO, capture_output=True, text=True,
    )
    report_path = out_dir / "eval-run.json"

    check("eval run produced a report", proc.returncode == 0 and report_path.exists())
    if not report_path.exists():
        print(proc.stdout[-2000:])
        print(proc.stderr[-2000:])
        return

    overall = json.loads(report_path.read_text()).get("overall", {})
    check("anchor_pass_rate == 1.00", overall.get("anchor_pass_rate") == 1.0)
    check("overlap_compliance == 1.00", overall.get("overlap_compliance") == 1.0)
    check("recall@must_find_all == 1.00", overall.get("recall@must_find_all") == 1.0)
    check("trap_rate == 0.0", overall.get("trap_rate") == 0.0)


if __name__ == "__main__":
    main()
    if failures:
        print(f"\nFAILED ({len(failures)}): " + ", ".join(failures))
        sys.exit(1)
    print("\nALL PASSED")
