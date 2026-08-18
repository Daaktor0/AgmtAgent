"""python -m agent.eval {checks,run} [--corpus DIR] [--mode A] [--dump PATH] [--out DIR]"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .checks import run_checks
from .harness import run_eval

USAGE = (
    "usage: python -m agent.eval checks [--corpus DIR]\n"
    "       python -m agent.eval run [--corpus DIR] [--mode A] [--dump PATH] [--out DIR]"
)


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else list(argv)
    if not argv or argv[0] not in {"checks", "run"}:
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
    args = parser.parse_args(argv)
    if args.repeat != 1:
        print("error: --repeat != 1 is not implemented")
        return 2
    if args.roles is not None:
        print("live roles not implemented; scoring mechanical/dump only")
    try:
        run_eval(args.corpus, mode=args.mode, dump=args.dump, out_dir=args.out)
    except (OSError, ValueError, KeyError) as exc:
        print(f"failed to run eval: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
