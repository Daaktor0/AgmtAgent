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
from agent.eval.checks import run_checks  # noqa: E402
from agent.supervisor import Supervisor  # noqa: E402
from agent.tools import Toolbox  # noqa: E402

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
                "consequence": (
                    "This limb expands monetary liability for an Event of Default "
                    "that Clause 5.2 already caps, without adding any protection "
                    "the Investor does not already have."
                ),
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
    check("emits issue events", kinds.count("issue") == 1)
    check("emits question event", "question" in kinds)
    check("terminates on finish", kinds[-1] == "done")

    done = events[-1]
    check("records only the anchored issue", len(done["issues"]) == 1)
    good = done["issues"][0]
    check("verifies a real quotation", good["anchor_verified"] is True)
    check("stamps anchored evidence tier", good.get("evidence_tier") == 2)
    check("drops invented quotation",
          all("definitely not present" not in (i.get("old_text") or "")
              for i in done["issues"]))
    check("re-anchors to the right paragraph",
          "Event of Default" in SAMPLE[good["para"]])
    check("carries the summary", done["summary"] == "Two points matter.")
    check("includes mechanical findings", len(done["mechanical"]) > 5)


def test_new_mechanical_checks():
    print("\nnew mechanical checks")
    root = Path(__file__).resolve().parent.parent
    ingested = json.loads(
        (root / "eval" / "corpus" / "synth_v2" / "ingested.json")
        .read_text(encoding="utf-8")
    )
    found = {i.check for i in Document(ingested["paragraphs"]).mechanical_checks()}
    for check_id in (
        "orphan_schedule", "empty_schedule", "missing_chapeau",
        "forward_defined_term", "circular_definition", "party_name_drift",
        "percentage_sum",
    ):
        check(f"synth fires {check_id}", check_id in found)

    heading = Document([
        "1. CONDITIONS PRECEDENT",
        "1.1 The Investor's obligation is conditional on the closing certificate.",
        "1.2 The Company shall use reasonable efforts to satisfy that condition.",
        "2. BUSINESS",
        "2.1 The Company shall carry on the business set out in Schedule 1.",
        "SCHEDULE 1",
        "The Company shall deliver share certificates, the statutory registers, "
        "board resolutions authorising allotment, and the other completion items "
        "the Investor reasonably requires.",
    ])
    heading_found = {i.check for i in heading.mechanical_checks()}
    check("title-case heading is not a missing chapeau",
          "missing_chapeau" not in heading_found)
    check("cited schedule with body is not orphan or empty",
          "orphan_schedule" not in heading_found
          and "empty_schedule" not in heading_found)
    check("clean fixture has no circular, forward, drift or percentage findings",
          not heading_found & {
              "circular_definition", "forward_defined_term",
              "party_name_drift", "percentage_sum",
          })


def test_record_issue_enforcement():
    print("\nrecord_issue enforcement")
    doc = Document(SAMPLE)
    box = Toolbox(doc, object(), {})
    invented = box.record_issue(
        ref="6.1", para=27, title="Invented", classification="drafting_defect",
        severity="low", position="revise", consequence="n/a",
        old_text="this exact string is definitely not present anywhere",
        new_text="x",
    )
    check("rejects invented old_text", invented.get("rejected") is True
          and invented.get("reason") == "anchor")
    check("does not record invented old_text", box.issues == [])

    missing = box.record_issue(
        ref="6.1", para=27, title="No quote", classification="drafting_defect",
        severity="low", position="revise", consequence="n/a",
        old_text="", new_text="x",
    )
    check("rejects revise without old_text", missing.get("reason") == "missing_old_text")
    check("does not record revise without old_text", box.issues == [])

    thin = box.record_issue(
        ref="5.1", para=_para_of("Event of Default"), title="Thin",
        classification="commercial_risk", severity="high", position="delete",
        consequence="Too short to state the harm.",
        old_text="; and (c) the occurrence of an Event of Default",
    )
    check("rejects thin high-severity consequence",
          thin.get("reason") == "thin_consequence")
    check("does not record thin consequence", box.issues == [])

    good = box.record_issue(
        ref="5.1", para=_para_of("Event of Default"),
        title="Standalone indemnity trigger",
        classification="commercial_risk", severity="high", position="delete",
        consequence=(
            "This limb expands monetary liability for an Event of Default "
            "that Clause 5.2 already caps, without adding any protection "
            "the Investor does not already have."
        ),
        old_text="; and (c) the occurrence of an Event of Default",
    )
    check("records a verbatim anchored issue", good.get("recorded") == 1)
    check("stamps evidence tier 2 on anchored issue",
          box.issues and box.issues[0].get("evidence_tier") == 2
          and box.issues[0].get("anchor_verified") is True)

    bare_protect = box.record_issue(
        ref="5.1", para=_para_of("Event of Default"),
        title="Add a second cap", classification="commercial_risk",
        severity="medium", position="revise",
        consequence="Adds a second remedy for a risk already capped in 5.2.",
        old_text="; and (c) the occurrence of an Event of Default",
        new_text="; and (c) a material breach of this Agreement",
    )
    check("rejects new wording without overlap_trace",
          bare_protect.get("reason") == "overlap")
    check("does not record unprotected new wording", len(box.issues) == 1)

    with_trace = box.record_issue(
        ref="5.1", para=_para_of("Event of Default"),
        title="Add a second cap", classification="commercial_risk",
        severity="medium", position="revise",
        consequence="Adds a second remedy for a risk already capped in 5.2.",
        old_text="; and (c) the occurrence of an Event of Default",
        new_text="; and (c) a material breach of this Agreement",
        overlap_trace=["5.2"],
    )
    check("records new wording once overlap_trace is present",
          with_trace.get("recorded") == 2)

    overlap = box.check_overlap("Subscription Amount",
                                exclude_para=_para_of("Forty Four Crore"))
    check("check_overlap reports other hits",
          overlap.get("already_addressed") is True and overlap.get("total", 0) >= 1)


def test_truncation_reporting():
    print("\ntruncation reporting")
    paras = [f"{i}. Clause about indemnity and liability cap {i}" for i in range(1, 51)]
    box = Toolbox(Document(paras), object(), {})
    page = box.search_document("indemnity", limit=10)
    check("search reports total beyond the page",
          page.get("total") == 50 and page.get("shown") == 10
          and page.get("truncated") is True and page.get("next_offset") == 10)
    page2 = box.search_document("indemnity", offset=10, limit=10)
    check("search offset advances the page",
          page2.get("offset") == 10 and page2["hits"][0]["para"] == 10)
    outline = box.get_outline(limit=5)
    check("outline reports truncation",
          outline.get("total") == 50 and outline.get("shown") == 5
          and outline.get("truncated") is True)


def test_eval_checks():
    print("\neval checks")
    root = Path(__file__).resolve().parent.parent
    code = run_checks(root / "eval" / "corpus")
    check("eval corpus passes", code == 0)


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
    test_new_mechanical_checks()
    test_record_issue_enforcement()
    test_truncation_reporting()
    test_supervisor()
    test_eval_checks()
    from tests.test_eval_run import FAILS as EVAL_FAILS, test_eval_run
    test_eval_run()
    FAILS.extend(EVAL_FAILS)
    test_prompt()
    print(f"\n{'ALL PASSED' if not FAILS else str(len(FAILS)) + ' FAILED: ' + ', '.join(FAILS)}\n")
    sys.exit(1 if FAILS else 0)
