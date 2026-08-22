"""Registry integrity tests (plan commit 10).

Exit criterion: every registry entry has a stable id, a version, a precision
target, a legacy name that the eval corpus can match, and a runner that exists
on Document — or is explicitly matter-scope.

Run as a script: PASS/FAIL lines, ends ALL PASSED. No network.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-reg-"))

from agent.document.check_registry import BY_ID, BY_LEGACY, CHECKS  # noqa: E402
from agent.document.model import Document  # noqa: E402

FAILS: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'  ' + extra if extra else ''}")
    if not cond:
        FAILS.append(name)


def main() -> None:
    print("\nregistry integrity")

    ids = [c.id for c in CHECKS]
    check("ids are unique", len(ids) == len(set(ids)))
    check("legacy names are unique",
          len([c.legacy for c in CHECKS]) == len({c.legacy for c in CHECKS}))

    bad_version = [c.id for c in CHECKS if not isinstance(c.version, int) or c.version < 1]
    check("every entry has version >= 1", not bad_version, ", ".join(bad_version))
    bad_prec = [c.id for c in CHECKS if not (0.0 < c.precision_target <= 1.0)]
    check("every entry has precision target in (0, 1]", not bad_prec,
          ", ".join(bad_prec))
    bad_sev = [c.id for c in CHECKS if c.default_severity not in {"high", "medium", "low"}]
    check("default severities valid", not bad_sev)

    # Every document-scope runner exists on Document; matter-scope runners
    # live on the matter layer and are excluded here.
    missing = []
    for c in CHECKS:
        if c.scope == "document":
            if not hasattr(Document, c.runner):
                missing.append(f"{c.id}->{c.runner}")
    check("document-scope runners exist on Document", not missing,
          ", ".join(missing))

    # Bidirectional maps agree.
    check("BY_ID covers all entries", set(BY_ID) == set(ids))
    check("BY_LEGACY covers all entries",
          set(BY_LEGACY) == {c.legacy for c in CHECKS})

    # Capability requirements name real capabilities.
    real_caps = {"comments", "revisions", "tables", "companions", "unique_local_ids"}
    bad_req = [c.id for c in CHECKS
               if not all(r in real_caps for r in c.requires)]
    check("capability requirements known", not bad_req, ", ".join(bad_req))

    print("\ncorpus fixture coverage")
    corpus = Path(__file__).resolve().parent.parent / "eval" / "corpus"
    labelled: set[str] = set()
    for labels in corpus.glob("*/labels.yaml"):
        for line in labels.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("check:"):
                val = line.split(":", 1)[1].strip().strip('"\'')
                if val:
                    labelled.add(val)
    covered = {c.legacy for c in CHECKS} & labelled
    check("corpus exercises registered checks", len(covered) >= 10,
          f"{len(covered)} checks have fixtures")
    unknown = {x.strip('"\'') for x in labelled} - {c.legacy for c in CHECKS}
    check("no corpus label references an unregistered check", not unknown,
          ", ".join(sorted(unknown)))

    print("\nstamp contract")
    from agent.document.model import Issue
    i = Issue(check="amount_mismatch", severity="high", para=3,
              ref="2.1", detail="d")
    from agent.document.check_registry import stamp
    stamped = stamp(i)
    check("stamping fills check_id/version/family",
          stamped.check_id == "amount.figure_word_mismatch"
          and stamped.check_version == 1 and stamped.family == "amount")
    plain = Issue(check="not_a_check", severity="low", para=1,
                  ref="", detail="")
    check("unknown check passes through unstamped", stamp(plain).check_id == "")

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
