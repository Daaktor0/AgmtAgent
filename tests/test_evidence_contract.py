"""Evidence/provenance contract tests (plan commit 11).

Invariants enforced at record time:
- every recorded issue carries anchor fields consistent with its old_text;
- anchor_method records how the quote was located;
- a provenance block identifies the document and engine that produced it.

Run as a script: PASS/FAIL lines, ends ALL PASSED. No network, no API key.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-evc-"))

from agent.config import Config  # noqa: E402
from agent.supervisor import Supervisor  # noqa: E402
from agent.tools import Toolbox  # noqa: E402
from agent.document import build_document  # noqa: E402

FAILS: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        FAILS.append(name)


class StubRouter:
    def resolve(self, role):
        return "stub/model"

    def chat(self, role, messages, **kw):
        return {"choices": [{"message": {"role": "assistant", "content": "x"}}],
                "usage": {}}


PARAS = [
    "CLAUSE 9. Indemnity",
    "The Contractor shall indemnify the Employer against all losses arising "
    "from negligence.",
    "CLAUSE 10. Cap",
    "The total liability shall not exceed INR 45,00,00,000 (Rupees Forty Four "
    "Crore only).",
]


def main() -> None:
    doc = build_document({"paragraphs": PARAS})
    box = Toolbox(doc, StubRouter(), mandate={})

    print("\nanchor contract")
    r = box.record_issue(
        ref="9", para=1, title="Broad indemnity",
        classification="legal_defect", severity="high",
        position="revise",
        consequence="Uncapped indemnity exposes the Employer to unlimited "
                    "liability far beyond the contract value and any insurance "
                    "the Contractor may carry, and survives termination of the "
                    "agreement unless expressly limited by a cap clause.",
        old_text="The Contractor shall indemnify the Employer against all losses",
    )
    print("   record_issue ->", r)
    check("anchored issue recorded", r.get("recorded") == 1)
    issue = box.issues[0]
    check("anchor_verified true with exact quote", issue["anchor_verified"] is True)
    check("evidence_tier 2 for verified quote", issue["evidence_tier"] == 2)
    check("anchor_method records location strategy",
          issue["anchor_method"] == "exact_at_para")

    # Quote from a different paragraph than claimed: still verifiable but via
    # document-wide search.
    box2 = Toolbox(doc, StubRouter(), mandate={})
    box2.record_issue(
        ref="", para=0, title="Cap mismatch",
        classification="drafting_defect", severity="high",
        position="clarify",
        consequence="Figure and words disagree; the enforceability of the cap "
                    "is open to challenge in arbitration and a court may hold "
                    "the words to prevail, creating uncertainty for both "
                    "parties about the true extent of liability.",
        old_text="(Rupees Forty Four Crore only)",
    )
    issue2 = box2.issues[0]
    check("misplaced para re-anchored to the true location",
          issue2["para"] == 3 and issue2["anchor_verified"] is True)

    print("\njudgement-only issues")
    box3 = Toolbox(doc, StubRouter(), mandate={})
    box3.record_issue(
        ref="10", para=3, title="Cap adequacy is a commercial call",
        classification="commercial_risk", severity="medium",
        position="commercial_call",
        consequence="A cap at the contract price may be inadequate for the "
                    "risk profile; this needs a client instruction.",
    )
    j = box3.issues[0]
    check("no quote means no anchor claim", j["anchor_verified"] is None)
    check("judgement tier is 3", j["evidence_tier"] == 3)
    check("anchor_method None for judgement", j["anchor_method"] is None)

    print("\nprovenance")
    prov = issue["provenance"]
    check("provenance names recorder", prov["recorded_by"] == "supervisor.record_issue")
    check("provenance carries doc id", prov["doc_id"] == "primary")
    check("provenance carries paragraph count", prov["n_paragraphs"] == len(PARAS))

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
