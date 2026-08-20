"""Baseline contract freeze. No behaviour change.

    .venv/Scripts/python.exe tests/test_contract_freeze.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAILS: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'  ' + extra if extra else ''}")
    if not cond:
        FAILS.append(name)


def _run(script: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(script), *args],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


def test_contract_freeze():
    print("\ncontract freeze")
    gen = ROOT / "tests" / "fixtures" / "contract" / "generate.py"
    result = _run(gen, "--check")
    check("generate.py --check exits 0", result.returncode == 0,
          result.stderr[-200:] if result.returncode else "")


def test_contextual_fixtures_valid():
    print("\ncontextual fixtures")
    script = ROOT / "tests" / "fixtures" / "contextual" / "validate.py"
    result = _run(script)
    check("validate.py exits 0", result.returncode == 0,
          (result.stdout + result.stderr)[-300:] if result.returncode else "")
    check("reports all cases valid", "cases valid" in result.stdout)


def test_flags_default_no_dsh():
    print("\nfeature flags")
    sys.path.insert(0, str(ROOT))
    from agent.flags import load_flags

    flags = load_flags(ROOT / "config.example.yaml")
    check("DSH off by default", flags.dsh_runtime is False)
    check("contextual command available", flags.contextual_command is True)
    check("safe actions available", flags.safe_actions is True)


if __name__ == "__main__":
    test_contract_freeze()
    test_contextual_fixtures_valid()
    test_flags_default_no_dsh()
    print(f"\n{'ALL PASSED' if not FAILS else str(len(FAILS)) + ' FAILED: ' + ', '.join(FAILS)}\n")
    sys.exit(1 if FAILS else 0)
