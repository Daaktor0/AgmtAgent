"""Offline tests. No OpenRouter call — the router is stubbed.

    python -m tests.test_pipeline
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Supervisor store writes must never touch the live data/agmt.db (handover
# landmine 1). Point AGMT_DB at a throwaway file before any agent.* import.
os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-test-pipeline-"))

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
        if role == "reviewer":
            return {"choices": [{"message": {
                "role": "assistant",
                "content": json.dumps({
                    "verdicts": [{"id": 1, "verdict": "confirm", "note": "real defect"}],
                }),
            }}], "_model": "stub/reviewer"}
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
    check("emits reviewer event", "reviewer" in kinds)
    check("emits question event", "question" in kinds)
    done = next(e for e in events if e["event"] == "done")
    check("done issues survive a confirm verdict",
          len(done["issues"]) == 1
          and done["issues"][0].get("reviewer_verdict") == "confirm")
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
    check("clean fixture has no date, currency, threshold or signature findings",
          not heading_found & {
              "date_logic_conflict", "currency_inconsistency",
              "threshold_conflict", "signature_block_mismatch",
          })


def test_date_currency_threshold_signature():
    print("\ndate / currency / threshold / signature")
    root = Path(__file__).resolve().parent.parent
    ingested = json.loads(
        (root / "eval" / "corpus" / "synth_dates" / "ingested.json")
        .read_text(encoding="utf-8")
    )
    issues = Document(ingested["paragraphs"]).mechanical_checks()
    found = {(i.check, i.ref) for i in issues}
    for check_id, ref in (
        ("date_logic_conflict", "1.1"),
        ("date_logic_conflict", "1.2"),
        ("date_logic_conflict", "3.2"),
        ("date_logic_conflict", "7.1"),
        ("currency_inconsistency", "6.1"),
        ("threshold_conflict", "5.2"),
        ("threshold_conflict", "4.1"),
        ("signature_block_mismatch", "8"),
    ):
        check(f"synth_dates fires {check_id} at {ref}", (check_id, ref) in found)

    sample = Document(SAMPLE)
    sample_found = {i.check for i in sample.mechanical_checks()}
    check("sample SHA fires threshold_conflict on 6.4 vs 6.1",
          "threshold_conflict" in sample_found)
    check("sample SHA has no date, currency or signature findings",
          not sample_found & {
              "date_logic_conflict", "currency_inconsistency",
              "signature_block_mismatch",
          })

    later = Document([
        "This Agreement is made on 1 January 2026 between Helios Ventures Private Limited (the \"Company\") and Kestrel Growth Fund (the \"Investor\").",
        "1.1 \"Closing Date\" means 1 March 2026.",
        "2.1 The Company shall pay the Investor INR 1,00,000. The amount is the USD equivalent at the prevailing rate.",
        "3.1 The Company shall not, without Investor consent, incur any indebtedness exceeding INR 5,00,00,000.",
    ])
    later_found = {i.check for i in later.mechanical_checks()}
    check("later closing is not a date conflict",
          "date_logic_conflict" not in later_found)
    check("conversion mechanic suppresses currency_inconsistency",
          "currency_inconsistency" not in later_found)
    check("threshold without a blanket is not a conflict",
          "threshold_conflict" not in later_found)
    check("no signature block is not a mismatch",
          "signature_block_mismatch" not in later_found)

    caps = Document([
        "1. The Company as warrantor shall give the Business Warranties.",
        "2. The Company as guarantor shall pay any Loss on demand.",
    ])
    check("capacity_inconsistency fires when the same party has two roles",
          "capacity_inconsistency" in {i.check for i in caps.mechanical_checks()})
    one_cap = Document([
        "1. The Company as warrantor shall give the Business Warranties.",
        "2. The Investor shall subscribe for the Shares.",
    ])
    check("a single capacity is not inconsistent",
          "capacity_inconsistency" not in {i.check for i in one_cap.mechanical_checks()})

    scoped = Document([
        "1. The Investor shall pay the Subscription Amount into Escrow.",
        "SCHEDULE 2",
        '"Escrow" means the account nominated for the Subscription Amount.',
    ])
    check("scope_mismatch fires when a schedule definition is used in the body",
          "scope_mismatch" in {i.check for i in scoped.mechanical_checks()})


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

    oob = box.record_issue(
        ref="5.1", para=9999, title="Bad index",
        classification="drafting_defect", severity="low", position="flag",
        consequence="n/a",
    )
    check("rejects paragraph outside the document", oob.get("reason") == "block_idx")
    missing_ref = box.record_issue(
        ref="99.9", para=1, title="Ghost clause",
        classification="drafting_defect", severity="low", position="flag",
        consequence="n/a",
    )
    check("rejects a clause ref that does not resolve",
          missing_ref.get("reason") == "unresolved_ref")

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


def test_reviewer():
    print("\nreviewer pass")
    from agent.reviewer import apply_verdicts, review_issues

    paras = ["The cap is the Subscription Amount."]
    dead = [{"id": 1, "title": "Ghost", "old_text": "this is not in the document",
             "severity": "high"}]
    kept, report = review_issues(dead, paras)
    check("re-verify drops a missing quotation", kept == [] and report["dropped"] == [1])

    live = [{"id": 1, "title": "Cap", "old_text": "Subscription Amount",
             "severity": "high"}]
    kept, _ = review_issues(live, paras)
    check("re-verify keeps a real quotation",
          len(kept) == 1 and kept[0].get("anchor_verified") is True)

    issues = [
        {"id": 1, "title": "Cap", "severity": "high"},
        {"id": 2, "title": "Same cap again", "severity": "medium"},
    ]
    kept = apply_verdicts(issues, [
        {"id": 1, "verdict": "downgrade", "note": "overstated"},
        {"id": 2, "verdict": "merge", "merge_into": 1, "note": "duplicate"},
    ])
    check("downgrade lowers high to medium",
          len(kept) == 1 and kept[0]["severity"] == "medium")
    check("merge absorbs the duplicate",
          "Merged" in (kept[0].get("reviewer_note") or ""))


def test_router_fail_closed():
    print("\nrouter fail-closed")
    import time
    from agent.router import Router, RouterError

    cfg = Config()
    cfg.prefer = {"supervisor": ["does-not-exist/zzz"]}
    cfg.pinned = {}
    router = Router(cfg)
    router._catalog = [{
        "id": "anthropic/claude-opus-4", "created": 1,
        "supported_parameters": ["tools"],
    }]
    router._catalog_at = time.time()
    try:
        router.resolve("supervisor")
        check("unmatched prefix raises", False)
    except RouterError as exc:
        check("unmatched prefix raises", "Refusing" in str(exc))

    cfg.pinned = {"supervisor": "x-ai/grok-custom"}
    check("pin still wins", router.resolve("supervisor") == "x-ai/grok-custom")


def test_fidelity_and_xdoc():
    print("\nfidelity / xdoc / registry")
    from agent.document import build_document
    from agent.check_registry import BY_LEGACY

    root = Path(__file__).resolve().parent.parent
    fid = build_document(json.loads(
        (root / "eval" / "corpus" / "synth_fidelity" / "ingested.json")
        .read_text(encoding="utf-8")
    ))
    found = {i.check for i in fid.mechanical_checks()}
    for check_id in (
        "xref_implausible", "depth_anomaly",
        "unresolved_comment", "pending_tracked_change",
    ):
        check(f"synth_fidelity fires {check_id}", check_id in found)
    implausible = [i for i in fid.mechanical_checks() if i.check == "xref_implausible"]
    check("notice-to-schedule is not implausible",
          all(i.ref != "8.1" for i in implausible))
    check("comments capability reported", "comments" in fid.capabilities)
    check("unresolved_comment is versioned",
          BY_LEGACY["unresolved_comment"].id == "exec.unresolved_comment")

    xdoc = build_document(json.loads(
        (root / "eval" / "corpus" / "synth_xdoc" / "ingested.json")
        .read_text(encoding="utf-8")
    ))
    xfound = {i.check for i in xdoc.mechanical_checks()}
    for check_id in (
        "xdoc_defterm_conflict", "xdoc_threshold_conflict",
        "xdoc_orphan_reference", "xdoc_disclosure_mapping_gap",
    ):
        check(f"synth_xdoc fires {check_id}", check_id in xfound)
    suppressed = {s["check"] for s in xdoc.suppressed_checks}
    check("comments check suppressed without ingest",
          "unresolved_comment" in suppressed)

    clean = Document(["1. The Company shall pay the Subscription Amount."])
    check("no comments means unresolved_comment is suppressed, not a finding",
          "unresolved_comment" not in {i.check for i in clean.mechanical_checks()}
          and any(s["check"] == "unresolved_comment" for s in clean.suppressed_checks))


def test_plan_and_house_tools():
    print("\nplan / comments / house tools")
    doc = Document(SAMPLE)
    box = Toolbox(doc, object(), {})
    planned = box.set_plan(["outline", "mechanical", "indemnity"], focus="Mode A")
    check("plan is stored", planned["accepted"] is True
          and box.plan["steps"][0] == "outline")
    revised = box.revise_plan(["finish"], reason="enough")
    check("revise_plan replaces steps",
          box.plan["revised"] is True and box.plan["steps"] == ["finish"])
    comments = box.get_comments()
    check("comments unavailable without ingest", comments.get("available") is False)
    house = box.get_house_position("indemnity")
    check("house position returns a list", isinstance(house.get("positions"), list))
    listed = box.list_documents()
    check("list_documents includes the primary",
          listed["documents"][0]["id"] == "primary")


def test_dispositions():
    print("\ndispositions")
    import tempfile
    from agent.memory.store import Store
    from agent.memory.dispositions import record_disposition

    with tempfile.TemporaryDirectory() as tmp:
        store = Store(Path(tmp) / "t.db")
        run_id = store.save_run(
            mode="A", mandate={}, instruction="", status="done",
            summary="test",
            issues=[{
                "id": 1, "ref": "5.1", "para": 1,
                "title": "Standalone indemnity trigger",
                "check": "threshold_conflict",
            }],
        )
        issue_id = store.get_run(run_id)["issues"][0]["id"]
        first = record_disposition(store, issue_id, "rejected")
        second = record_disposition(store, issue_id, "rejected")
        third = record_disposition(store, issue_id, "rejected")
        check("first rejection is recorded", first.get("action") == "rejected")
        check("position is inactive before three",
              first["position"]["active"] is False)
        check("third consistent rejection promotes a house position",
              third["position"]["active"] is True
              and third["position"]["polarity"] == "avoid")
        store.close()


def test_eval_diff():
    print("\neval diff")
    import tempfile
    from agent.eval.diff import run_diff

    def report(precision, path):
        Path(path).write_text(json.dumps({
            "docs": 1,
            "overall": {
                "recall@must_find_high": 1.0,
                "recall@must_find_all": 1.0,
                "precision": precision,
                "trap_rate": 0.0,
                "noise_rate": 10.0,
                "anchor_pass_rate": 1.0,
                "overlap_compliance": 1.0,
            },
        }), encoding="utf-8")

    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp) / "a.json"
        cand = Path(tmp) / "b.json"
        report(0.50, base)
        report(0.75, cand)
        result = run_diff(base, cand)
    check("diff reports a precision lift",
          abs(result["metrics"]["precision"]["delta"] - 0.25) < 1e-9)


if __name__ == "__main__":
    test_document()
    test_word_list_prefixes()
    test_new_mechanical_checks()
    test_date_currency_threshold_signature()
    test_record_issue_enforcement()
    test_truncation_reporting()
    test_supervisor()
    test_eval_checks()
    from tests.test_eval_run import FAILS as EVAL_FAILS, test_eval_run
    test_eval_run()
    FAILS.extend(EVAL_FAILS)
    test_prompt()
    test_reviewer()
    test_router_fail_closed()
    test_eval_diff()
    test_fidelity_and_xdoc()
    test_plan_and_house_tools()
    test_dispositions()
    print(f"\n{'ALL PASSED' if not FAILS else str(len(FAILS)) + ' FAILED: ' + ', '.join(FAILS)}\n")
    sys.exit(1 if FAILS else 0)
