"""Offline tests. No OpenRouter call — the router is stubbed.

    python -m tests.test_pipeline
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.config import Config  # noqa: E402
from agent.document import Document, words_to_number  # noqa: E402
from agent.supervisor import Supervisor  # noqa: E402

SAMPLE = (Path(__file__).parent / "sample_sha.txt").read_text(encoding="utf-8").split("\n")

FAILS: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'  ' + extra if extra else ''}")
    if not cond:
        FAILS.append(name)


# ---------------------------------------------------------------- documents

def test_document():
    print("\ndocument parsing")
    d = Document(SAMPLE)
    check("segments clauses", len(d.clauses) > 20, f"({len(d.clauses)})")
    check("finds definitions", "Investor Majority" in d.definitions)
    check("finds inline party definitions", "Company" in d.definitions
          and "Promoters" in d.definitions)
    check("locates clause by ref", d.find_clause("5.1") is not None)
    check("clause_at maps paragraph to clause",
          (d.clause_at(24) or d.clauses[0]).number.startswith("5"))
    check("definition usages indexed", len(d.definitions["Subscription Amount"].usages) >= 2)

    hits = d.search("Investor Majority")
    check("search finds every reserved matter", len(hits) >= 4, f"({len(hits)})")

    print("\nnumber words")
    check("lakh", words_to_number("Fifteen Lakh") == 1_500_000)
    check("crore", words_to_number("Forty Five Crore") == 450_000_000)
    check("compound", words_to_number("Two Crore Fifty Lakh") == 25_000_000)
    check("western", words_to_number("Three Million Two Hundred Thousand") == 3_200_000)
    check("rejects unknown words", words_to_number("Some Amount Or Other") is None)

    print("\nmechanical checks")
    found = {i.check for i in d.mechanical_checks()}
    check("amount mismatch", "amount_mismatch" in found)
    check("broken cross-reference", "broken_cross_reference" in found)
    check("unfilled placeholder", "unfilled_placeholder" in found)
    check("numbering gap", "numbering_gap" in found)
    check("unused definition", "defined_but_unused" in found)
    xrefs = [i for i in d.mechanical_checks() if i.check == "broken_cross_reference"]
    check("no false positive on valid Clause 2 / Schedule 3 refs",
          all("Clause 2 " not in i.detail and "Schedule 3" not in i.detail for i in xrefs))


def test_word_list_prefixes():
    print("\nword list prefixes")
    paras = [
        '"Affiliate" means, with respect to any Person, any entity that controls such Person.',
        "The Company shall maintain complete books and records.",
        "The Investor may transfer Securities only in accordance with this Agreement.",
    ]

    plain = Document(paras)
    check("verbatim paragraphs without numbers collapse to body",
          len(plain.clauses) == 1 and plain.clauses[0].kind == "body")

    doc = Document(paras, prefixes=["1.", "1.1", "2.1"])
    check("uses Word list prefixes for top-level clause", doc.find_clause("1.") is not None)
    check("uses Word list prefixes for sub-clause", doc.find_clause("1.1") is not None)
    check("uses Word list prefixes for later clause", doc.find_clause("2.1") is not None)
    check("keeps paragraph text verbatim", doc.paras[0] == paras[0])
    check("finds quoted definition on verbatim text",
          doc.definitions.get("Affiliate") is not None
          and doc.definitions["Affiliate"].text == paras[0])


# ---------------------------------------------------------------- supervisor

class StubRouter:
    """Plays a model that uses the tools, records a good issue and a bad one."""

    def __init__(self):
        self.step = 0
        self.cfg = Config()

    def resolve(self, role):
        return f"stub/{role}"

    def chat(self, role, messages, tools=None, model=None, **kw):
        self.step += 1
        script = [
            ("get_outline", {}),
            ("run_mechanical_checks", {}),
            ("search_document", {"query": "Investor Majority"}),
            ("get_definition", {"term": "Subscription Amount"}),
            ("record_issue", {
                "ref": "5.1", "para": _para_of("Event of Default"),
                "title": "Standalone indemnity trigger for an EOD duplicates limb (a)",
                "classification": "commercial_risk", "severity": "high",
                "position": "delete",
                "consequence": "Expands monetary liability without adding protection.",
                "old_text": "; and (c) the occurrence of an Event of Default",
                "new_text": "",
                "comment": "Clause [X] separately addresses the consequences of an Event "
                           "of Default.",
                "consequential": ["5.2"],
            }),
            ("record_issue", {
                "ref": "6.1", "para": 27,
                "title": "Invented wording that is not in the document",
                "classification": "drafting_defect", "severity": "low",
                "position": "revise",
                "consequence": "n/a",
                "old_text": "this exact string is definitely not present anywhere",
                "new_text": "x",
            }),
            ("ask_user", {"question": "Which side do we act for?", "why": "Changes the analysis."}),
            ("finish", {"summary": "Two points matter."}),
        ]
        if self.step > len(script):
            name, args = "finish", {"summary": "done"}
        else:
            name, args = script[self.step - 1]
        return {"choices": [{"message": {
            "role": "assistant", "content": None,
            "tool_calls": [{"id": f"c{self.step}", "type": "function",
                            "function": {"name": name,
                                         "arguments": json.dumps(args)}}],
        }}], "_model": "stub/supervisor"}


def _para_of(needle: str) -> int:
    for i, p in enumerate(SAMPLE):
        if needle in p:
            return i
    return -1


def test_supervisor():
    print("\nsupervisor loop")
    cfg = Config()
    sup = Supervisor(cfg, StubRouter())
    events = list(sup.run(SAMPLE, "A", {"party_represented": "Company"}))
    kinds = [e["event"] for e in events]

    check("emits parsed event", "parsed" in kinds)
    check("emits tool events", kinds.count("tool") >= 6, f"({kinds.count('tool')})")
    check("emits issue events", kinds.count("issue") == 2)
    check("emits question event", "question" in kinds)
    check("terminates on finish", kinds[-1] == "done")

    done = events[-1]
    good, bad = done["issues"]
    check("verifies a real quotation", good["anchor_verified"] is True)
    check("rejects an invented quotation", bad["anchor_verified"] is False)
    check("re-anchors to the right paragraph",
          "Event of Default" in SAMPLE[good["para"]])
    check("carries the summary", done["summary"] == "Two points matter.")
    check("includes mechanical findings", len(done["mechanical"]) > 5)


def test_prompt():
    print("\nsystem prompt")
    from agent.supervisor import build_system_prompt
    p = build_system_prompt("N", {"party_represented": "the Company"}, 40)
    check("embeds the skill", "Minimum effective intervention" in p)
    check("embeds the mode", "pre-signing qc" in p.lower())
    check("embeds the mandate", "the Company" in p)
    check("embeds operating rules", "old_text" in p)


if __name__ == "__main__":
    test_document()
    test_word_list_prefixes()
    test_supervisor()
    test_prompt()
    print(f"\n{'ALL PASSED' if not FAILS else str(len(FAILS)) + ' FAILED: ' + ', '.join(FAILS)}\n")
    sys.exit(1 if FAILS else 0)
