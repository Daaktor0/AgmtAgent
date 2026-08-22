"""Reviewer evidence re-read tests (plan commit 12).

Exit criterion: the reviewer can drop an issue because its source evidence is
absent or contradictory — it receives the exact cited paragraph text re-read
from the document, not just the issue prose.

Run as a script: PASS/FAIL lines, ends ALL PASSED. No network.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-rev-"))

from agent.reviewer import (  # noqa: E402
    _evidence_block, _parse_verdicts, apply_verdicts, review_issues,
)

FAILS: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        FAILS.append(name)


PARAS = [
    "CLAUSE 9. Indemnity",
    "The Contractor shall indemnify the Employer against all losses.",
    "CLAUSE 10. Cap",
    "Liability is capped at the Contract Price.",
]

ISSUES = [
    {"id": 1, "ref": "9", "para": 1, "title": "Broad indemnity",
     "severity": "high", "classification": "legal_defect",
     "consequence": "c" * 150,
     "old_text": "The Contractor shall indemnify the Employer against all losses.",
     "evidence_tier": 2},
    # Fabricated quote: not in the document.
    {"id": 2, "ref": "10", "para": 3, "title": "Ghost wording",
     "severity": "medium", "classification": "drafting_defect",
     "consequence": "c" * 150,
     "old_text": "The parties agree to unlimited liability forever.",
     "evidence_tier": 2},
]


class CapturingRouter:
    """Records what the reviewer was actually shown; confirms issue 1."""

    def __init__(self):
        self.seen_payload = None

    def resolve(self, role):
        return "stub/reviewer"

    def chat(self, role, messages, model=None, **kw):
        self.seen_payload = json.loads(messages[-1]["content"])
        return {"choices": [{"message": {"content": json.dumps(
            {"verdicts": [
                {"id": 1, "verdict": "confirm", "note": "real"},
                # Reviewer drops id 2 because its evidence block shows the
                # old_text is absent from the cited paragraph.
                {"id": 2, "verdict": "drop",
                 "note": "quoted words are not in the cited paragraph"},
            ]})}}],
            "_model": "stub/reviewer"}


def main() -> None:
    print("\nevidence blocks")
    ev = _evidence_block(ISSUES[0], PARAS)
    check("anchor para recorded", ev["anchor_para"] == 1)
    check("cited text is the document's own words",
          ev["cited_text"] == PARAS[1])
    check("old_text verified inside cited text", ev["old_text_in_cited"] is True)
    check("context includes neighbouring paragraphs", len(ev["context"]) == 3)

    ghost = _evidence_block(ISSUES[1], PARAS)
    check("fabricated quote fails verification",
          ghost["old_text_in_cited"] is False)

    unanchored = _evidence_block({"para": None}, PARAS)
    check("no anchor yields judgement marker",
          unanchored.get("anchor_para") is None)

    print("\nreviewer sees evidence")
    router = CapturingRouter()
    kept, report = review_issues(ISSUES, PARAS, router=router)
    entry = router.seen_payload["issues"][0]
    check("payload includes evidence re-read", "evidence" in entry)
    check("reviewer saw document words, not memory",
          entry["evidence"]["cited_text"] == PARAS[1])
    dropped_in_kept = {i["id"] for i in kept}
    check("reviewer can drop on absent evidence", 2 not in dropped_in_kept)
    check("verified issue survives", 1 in dropped_in_kept)

    print("\ndeterministic drop still first")
    issues2 = [dict(ISSUES[1])]
    kept2, report2 = review_issues(issues2, PARAS, router=None)
    check("deterministic re-verify drops without a router",
          report2["dropped"] and not kept2)

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
