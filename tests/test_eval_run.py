"""Offline tests for `python -m agent.eval run`. No network.

    python tests/test_eval_run.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.eval.harness import load_issues, run_eval  # noqa: E402
from agent.eval.metrics import match_label, score  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FAILS: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'  ' + extra if extra else ''}")
    if not cond:
        FAILS.append(name)


def test_eval_run() -> None:
    FAILS.clear()
    print("\neval run matcher")
    orphan = {
        "check": "orphan_schedule",
        "ref": "Schedule 4",
        "para": 31,
        "title": "",
        "detail": "Schedule 4 is present but is not cited as a schedule target.",
        "excerpt": "SCHEDULE 4",
        "old_text": "",
        "new_text": "",
        "severity": "medium",
        "overlap_trace": [],
        "anchor_verified": None,
    }
    trap = {
        "id": "SYNTH-trap-01",
        "type": "trap",
        "must_find": False,
        "must_not_flag": True,
        "check": "orphan_schedule",
        "ref": "Schedule 1",
        "description": "Schedule 1 is cited in 7.1 and has a body; flagging it as orphan is a false positive",
    }
    check("Schedule 4 orphan is not SYNTH-trap-01", not match_label(orphan, trap))
    check(
        "orphan matches must-find without locus",
        match_label(orphan, {"check": "orphan_schedule", "must_find": True, "ref": ""}),
    )

    print("\neval run vacuous score")
    vacant = score([], [], 0)
    check("vacuous recall@must_find_high", vacant["recall@must_find_high"] == 1.0)
    check("vacuous recall@must_find_all", vacant["recall@must_find_all"] == 1.0)
    check("vacuous precision", vacant["precision"] == 1.0)
    check("vacuous trap_rate", vacant["trap_rate"] == 0.0)
    check("vacuous anchor_pass_rate", vacant["anchor_pass_rate"] == 1.0)
    check("vacuous overlap_compliance", vacant["overlap_compliance"] == 1.0)

    print("\neval run dump loader")
    events = [
        {"event": "parsed", "paragraphs": 1},
        {
            "event": "issue",
            "issue": {
                "check": "amount_mismatch",
                "ref": "2.1",
                "title": "Subscription Amount clash",
                "detail": "Forty Four",
                "excerpt": "",
                "old_text": "",
                "new_text": "",
                "severity": "high",
            },
        },
        {"event": "done"},
    ]
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "events.json"
        path.write_text(json.dumps(events), encoding="utf-8")
        loaded = load_issues(path)
    check("dump loader accepts a JSON event array", len(loaded) == 1)
    check("event-array issue keeps check", loaded[0].get("check") == "amount_mismatch")

    fixture = load_issues(ROOT / "tests" / "fixtures" / "eval_dump.json")
    check("fixture dump has 3 issues", len(fixture) == 3)
    amount_label = {
        "id": "SAMPLE-amount-01",
        "check": "amount_mismatch",
        "ref": "2.1",
        "must_find": True,
        "accept_if": ["forty four", "subscription"],
    }
    xref_label = {
        "id": "SAMPLE-xref-01",
        "check": "broken_cross_reference",
        "ref": "2.2",
        "must_find": True,
        "accept_if": ["broken", "cross-reference"],
    }
    check("dump issue 1 matches SAMPLE-amount-01", match_label(fixture[0], amount_label))
    check("dump issue 2 matches SAMPLE-xref-01", match_label(fixture[1], xref_label))
    check("dump noise matches no sample label",
          not match_label(fixture[2], amount_label) and not match_label(fixture[2], xref_label))

    print("\neval run harness")
    out_dir = ROOT / "reports"
    report = run_eval(ROOT / "eval" / "corpus", mode="A", out_dir=out_dir)
    written = out_dir / "eval-run.json"
    check("run_eval writes reports/eval-run.json", written.is_file())
    payload = json.loads(written.read_text(encoding="utf-8"))
    keys = {
        "recall@must_find_high",
        "recall@must_find_all",
        "precision",
        "trap_rate",
        "noise_rate",
        "anchor_pass_rate",
        "overlap_compliance",
    }
    overall = payload.get("overall") or {}
    check("eval-run.json has all six metric keys", keys <= set(overall))
    check("run_eval returns overall metrics", keys <= set(report.get("overall") or {}))

    print("\neval run CLI")
    no_args = subprocess.run(
        [sys.executable, "-m", "agent.eval"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    check("CLI with no args exits 2", no_args.returncode == 2)
    usage = (no_args.stdout or "") + (no_args.stderr or "")
    check("CLI with no args mentions run", "run" in usage.lower())
    ran = subprocess.run(
        [sys.executable, "-m", "agent.eval", "run",
         "--corpus", "eval/corpus", "--mode", "A", "--out", "reports/"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    check("CLI run is accepted", ran.returncode == 0)
    stdout = ran.stdout or ""
    for name in keys:
        check(f"CLI run stdout has {name}", name in stdout)


if __name__ == "__main__":
    test_eval_run()
    print(f"\n{'ALL PASSED' if not FAILS else str(len(FAILS)) + ' FAILED: ' + ', '.join(FAILS)}\n")
    sys.exit(1 if FAILS else 0)
