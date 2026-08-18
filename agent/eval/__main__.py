"""python -m agent.eval checks [--corpus DIR]"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .checks import run_checks

USAGE = "usage: python -m agent.eval checks [--corpus DIR]"


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else list(argv)
    if not argv or argv[0] != "checks":
        print(USAGE)
        return 2
    parser = argparse.ArgumentParser(
        prog="python -m agent.eval",
        usage=USAGE,
    )
    parser.add_argument("command")
    parser.add_argument("--corpus", type=Path, default=Path("eval/corpus"))
    args = parser.parse_args(argv)
    return run_checks(args.corpus)


if __name__ == "__main__":
    sys.exit(main())
