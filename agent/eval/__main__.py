"""python -m agent.eval {checks,run,diff}"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .checks import run_checks
from .diff import run_diff
from .harness import run_eval

USAGE = (
    "usage: python -m agent.eval checks [--corpus DIR]\n"
    "       python -m agent.eval run [--corpus DIR] [--mode A] [--dump PATH] [--out DIR] [--reviewer]\n"
    "       python -m agent.eval diff --baseline FILE --candidate FILE"
)


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else list(argv)
    if not argv or argv[0] not in {"checks", "run", "diff"}:
        print(USAGE)
        return 2

    if argv[0] == "checks":
        parser = argparse.ArgumentParser(
            prog="python -m agent.eval",
            usage=USAGE,
        )
        parser.add_argument("command")
        parser.add_argument("--corpus", type=Path, default=Path("eval/corpus"))
        args = parser.parse_args(argv)
        return run_checks(args.corpus)

    if argv[0] == "diff":
        parser = argparse.ArgumentParser(
            prog="python -m agent.eval",
            usage=USAGE,
        )
        parser.add_argument("command")
        parser.add_argument("--baseline", type=Path, required=True)
        parser.add_argument("--candidate", type=Path, required=True)
        args = parser.parse_args(argv)
        try:
            run_diff(args.baseline, args.candidate)
        except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
            print(f"failed to diff: {exc}")
            return 1
        return 0

    parser = argparse.ArgumentParser(
        prog="python -m agent.eval",
        usage=USAGE,
    )
    parser.add_argument("command")
    parser.add_argument("--corpus", type=Path, default=Path("eval/corpus"))
    parser.add_argument("--mode", default="A")
    parser.add_argument("--dump", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=Path("reports/"))
    parser.add_argument("--roles", default=None)
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--reviewer", action="store_true")
    args = parser.parse_args(argv)
    if args.repeat != 1:
        print("error: --repeat != 1 is not implemented")
        return 2
    if args.roles is not None:
        print("live roles not implemented; scoring mechanical/dump only")
    try:
        run_eval(args.corpus, mode=args.mode, dump=args.dump,
                 out_dir=args.out, reviewer=args.reviewer)
    except (OSError, ValueError, KeyError) as exc:
        print(f"failed to run eval: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
