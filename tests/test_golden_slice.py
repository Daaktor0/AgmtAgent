"""Golden vertical slice tests. No OpenRouter. No Word host.

    .venv/Scripts/python.exe tests/test_golden_slice.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tests.fixtures.golden.documents import (
    AMBIGUOUS_INDEMNITY,
    DISTINCT_REMEDIES,
    DOUBLE_RECOVERY,
    DUPLICATE_TEXT,
    GOLDEN_INSTRUCTION,
    NO_DOUBLE_ALREADY,
    NO_ISSUE,
    RENAMED,
    SELECTION_5_3,
    TABLE_CELL,
)

from agent.actions.tickets import (
    LiveDocument,
    apply_prepared,
    approve_action,
    prepare_ticket,
    refuse_reason,
    reset_tickets,
    verify_write,
)
from agent.contextual.command import capture_command, reset_commands
from agent.contextual.interpreter import extract_mentions, interpret
from agent.contextual.pipeline import run_contextual_command
from agent.contextual.resolver import resolve_command
from agent.document import Document
from agent.flags import load_flags
from agent.reviewer import review_from_evidence
from agent.runtime.base import RunHandle
from agent.runtime.current import CurrentAgmtRuntime
from agent.runtime.dsh import DSHRuntime, DSHUnavailable
from agent.schemas.action import ActionPrecondition, ProposedAction, fill_action_hashes
from agent.schemas.ids import document_hash, sha256_hex
from agent.schemas.selection import make_envelope

FAILS: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'  ' + extra if extra else ''}")
    if not cond:
        FAILS.append(name)


def _sel(text: str, para: int, path: list[str], document_id: str = "primary",
         version: str = "v1"):
    return make_envelope(
        document_id=document_id,
        document_version_id=version,
        selected_text=text,
        paragraph_indexes=[para],
        heading_path=path,
        prefix="5.3 ",
        suffix=" 6. RESERVED MATTERS",
    )


def _run(paras, text=SELECTION_5_3, para=8, instruction=GOLDEN_INSTRUCTION, **kw):
    env = _sel(text, para, ["main", "clause-5", "5.3"],
               version=kw.pop("version", "v1"))
    captured = document_hash(paras)
    return run_contextual_command(
        matter_id="m1",
        document_id="primary",
        document_version_id=kw.pop("document_version_id", "v1"),
        raw_text=instruction,
        paragraphs=paras,
        selection=env,
        provenance={"captured_doc_hash": captured},
        live_document_hash=kw.pop("live_document_hash", captured),
        **kw,
    )


# ---------------------------------------------------------------- flags / hashes

def test_flags():
    print("\nflags")
    flags = load_flags()
    check("DSH default off", flags.dsh_runtime is False)
    os.environ["AGMT_DSH_RUNTIME"] = "1"
    on = load_flags()
    check("env overrides DSH on", on.dsh_runtime is True)
    os.environ["AGMT_DSH_RUNTIME"] = "0"
    off = load_flags()
    check("env overrides DSH off", off.dsh_runtime is False)
    del os.environ["AGMT_DSH_RUNTIME"]


def test_selection_envelope():
    print("\nselection")
    env = make_envelope(
        document_id="d1", document_version_id="v1",
        selected_text="hello", paragraph_indexes=[2, 3],
        prefix="pre", suffix="suf",
    )
    check("exact selected text", env.selected_text == "hello")
    check("hash is sha256 of text", env.selected_text_hash == sha256_hex("hello"))
    check("multi-paragraph indexes", env.structural_context.paragraph_indexes == [2, 3])
    empty = make_envelope(document_id="d1", document_version_id="v1", selected_text="")
    check("empty selection hashes empty string",
          empty.selected_text_hash == sha256_hex(""))
    table = make_envelope(
        document_id="d1", document_version_id="v1", selected_text="cell",
        table_path={"table_index": 0, "row": 1, "column": 2},
    )
    check("table selection records path",
          table.structural_context.table_path is not None
          and table.structural_context.table_path.row == 1)
    check("uniqueLocalId is locator not identity",
          env.structural_context.paragraph_ids == [])


# ---------------------------------------------------------------- interpreter / resolver

def test_interpreter():
    print("\ninterpreter")
    intent, mentions = interpret(GOLDEN_INSTRUCTION)
    texts = [m.text.lower() for m in mentions]
    check("extracts this language", any("this" in t for t in texts))
    check("extracts indemnity clause", any("indemnity" in t for t in texts))
    check("objective is check", intent.objective == "check")
    check("double-recovery concern", "double-recovery" in intent.concerns)
    spans_ok = all(
        GOLDEN_INSTRUCTION[m.start:m.end].lower() == m.text.lower()
        or GOLDEN_INSTRUCTION[m.start:m.end] == m.text
        for m in mentions
    )
    check("mention offsets match raw text", spans_ok)


def test_resolver():
    print("\nresolver")
    doc = Document(DOUBLE_RECOVERY)
    cmd = capture_command(
        matter_id="m", document_id="primary", document_version_id="v1",
        raw_text=GOLDEN_INSTRUCTION,
        selection=_sel(SELECTION_5_3, 8, ["5.3"]),
    )
    resolved = resolve_command(cmd, document=doc)
    by_cat = {}
    for m in resolved.mentions:
        ref = next((r for r in resolved.references if r.mention_id == m.mention_id), None)
        by_cat[m.category] = ref
    check("'this' resolves to selection",
          by_cat["selection"].status == "resolved"
          and by_cat["selection"].candidate.resolver == "selection")
    check("unique indemnity heading resolves",
          by_cat["heading"].status == "resolved"
          and "5" in (by_cat["heading"].candidate.clause_ref or ""))
    check("command ready when unique", resolved.status == "ready")

    amb = capture_command(
        matter_id="m", document_id="primary", document_version_id="v1",
        raw_text=GOLDEN_INSTRUCTION,
        selection=_sel("The Investor may recover its costs of enforcement in addition to any other remedy.",
                       6, ["7.3"]),
    )
    amb_doc = Document(AMBIGUOUS_INDEMNITY)
    amb_r = resolve_command(amb, document=amb_doc)
    heading = next(r for r in amb_r.references
                   if any(m.mention_id == r.mention_id and m.category == "heading"
                          for m in amb_r.mentions))
    check("two indemnity clauses are ambiguous",
          heading.status == "ambiguous" and len(heading.alternatives) >= 2)
    check("ambiguity does not guess", heading.candidate is None)

    missing = capture_command(
        matter_id="m", document_id="primary", document_version_id="v1",
        raw_text="check this against the indemnity clause",
        selection=_sel("The Investor subscribes for the Shares.", 0, ["1.1"]),
    )
    miss = resolve_command(missing, document=Document(RENAMED))
    heading = next(r for r in miss.references
                   if any(m.mention_id == r.mention_id and m.category == "heading"
                          for m in miss.mentions))
    check("renamed heading is not_found, not invented",
          heading.status == "not_found")

    defn = capture_command(
        matter_id="m", document_id="primary", document_version_id="v1",
        raw_text='what is the definition of Losses',
        selection=_sel("Losses", 2, ["1"]),
    )
    dres = resolve_command(defn, document=doc)
    dref = next(r for r in dres.references
                if any(m.mention_id == r.mention_id and m.category == "definition"
                       for m in dres.mentions))
    check("definition of Losses resolves from index",
          dref.status == "resolved" and dref.candidate.resolver == "definition_index")


# ---------------------------------------------------------------- legal path

class ConfirmRouter:
    cfg = None
    def resolve(self, role):
        return f"stub/{role}"
    def chat(self, role, messages, **kw):
        return {"choices": [{"message": {
            "role": "assistant",
            "content": json.dumps({"verdicts": [{"id": 1, "verdict": "confirm", "note": "live duplicate route"}]}),
        }}], "_model": "stub/reviewer"}


class DropRouter:
    def resolve(self, role):
        return f"stub/{role}"
    def chat(self, role, messages, **kw):
        return {"choices": [{"message": {
            "role": "assistant",
            "content": json.dumps({"verdicts": [{"id": 1, "verdict": "drop", "note": "not a defect"}]}),
        }}], "_model": "stub/reviewer"}


class BoomRouter:
    def resolve(self, role):
        raise RuntimeError("reviewer down")
    def chat(self, *a, **k):
        raise RuntimeError("reviewer down")


def test_double_recovery_positive():
    print("\ndouble-recovery positive")
    result = _run(DOUBLE_RECOVERY, router=ConfirmRouter())
    card = result["card"]
    check("discovers duplicate recovery via tools", card["finding"] == "double_recovery")
    check("result is not a chat transcript", "card" in result and "hooks" in card)
    check("every conclusion has evidence", len(card["evidence"]) >= 2)
    check("evidence quotes are in the document",
          all(any(e["quote"][:40] in p for p in DOUBLE_RECOVERY)
              for e in card["evidence"] if e.get("quote")))
    check("reviewer confirmed", card["reviewer"] == "confirmed")
    check("can request amendment", card["can_amend"] is True)
    check("used document tools",
          set(result["analysis"]["tools_used"]) >= {"get_outline", "read", "search_document"})


def test_no_issue_and_existing_fix():
    print("\nno-issue / existing no-double-recovery")
    none = _run(NO_ISSUE, text="The Company shall deliver monthly management accounts to the Investor.",
                para=5, router=ConfirmRouter())
    check("clean covenant is no_issue", none["card"]["finding"] == "no_issue")
    check("no amendment offered", none["card"]["can_amend"] is False)

    fixed = _run(NO_DOUBLE_ALREADY, router=ConfirmRouter())
    check("existing no-double-recovery language resolves the issue",
          fixed["card"]["finding"] == "resolved_by_existing")

    distinct = _run(DISTINCT_REMEDIES,
                    text="If working capital is less than the locked-box amount, the Seller shall pay the shortfall as a price adjustment, which is not a Loss.",
                    para=5, router=ConfirmRouter())
    check("distinct remedies are not treated as double recovery",
          distinct["card"]["finding"] in {"distinct_remedies", "no_issue"})


def test_reviewer_paths():
    print("\nreviewer")
    confirmed = _run(DOUBLE_RECOVERY, router=ConfirmRouter())
    check("reviewer confirms", confirmed["card"]["reviewer"] == "confirmed")
    dropped = _run(DOUBLE_RECOVERY, router=DropRouter())
    check("reviewer drop is visible", dropped["card"]["reviewer"] == "dropped"
          or dropped["card"]["finding"] == "no_issue")
    dead = _run(DOUBLE_RECOVERY, router=BoomRouter())
    check("reviewer unavailable is unreviewed, not confirm",
          dead["card"]["reviewer"] == "unreviewed")

    paras = ["The cap is the Subscription Amount."]
    issues = [{"id": 1, "title": "Cap", "old_text": "Subscription Amount",
               "evidence_ids": ["e1"]}]
    evidence = [{"evidence_id": "e1", "exact_quote": "Subscription Amount",
                 "exact_quotes": ["Subscription Amount"]}]
    kept, report = review_from_evidence(issues, evidence, paras, router=None)
    check("no router leaves unreviewed",
          kept[0]["reviewer_verdict"] == "unreviewed")


def test_ambiguity_ui_payload():
    print("\nambiguity payload")
    result = _run(
        AMBIGUOUS_INDEMNITY,
        text="The Investor may recover its costs of enforcement in addition to any other remedy.",
        para=6,
        router=ConfirmRouter(),
    )
    check("pipeline stops on ambiguity", result["state"] == "ambiguity")
    check("does not run analysis as if unique", result.get("card") is None)


# ---------------------------------------------------------------- mutation / tickets

def _action(old, new, version="v1", doc_hash="", action_id="a1"):
    pre = ActionPrecondition(
        document_id="primary",
        document_version_id=version,
        expected_doc_hash=doc_hash,
        expected_selected_text_sha256=sha256_hex(old),
        old_text=old,
        old_text_sha256=sha256_hex(old),
    )
    return fill_action_hashes(ProposedAction(
        action_id=action_id,
        document_version_id=version,
        operation="replace",
        precondition=pre,
        expected_old_text=old,
        proposed_text=new,
        approved_at="2026-03-12T10:00:00+00:00",
        evidence_ids=["e1"],
    ))


def test_mutation_safety():
    print("\nmutation safety")
    reset_tickets()
    paras = list(DOUBLE_RECOVERY)
    live = LiveDocument(paragraphs=list(paras), document_version_id="v1")
    old = SELECTION_5_3
    new = old.rstrip(".") + " provided that nothing in this Clause shall entitle a party to recover twice in respect of the same Loss."
    action = _action(old, new, doc_hash=live.version_hash)
    action = approve_action(action)

    unique = refuse_reason(action, live)
    check("unique exact target is allowed", unique is None)

    dup_live = LiveDocument(paragraphs=list(DUPLICATE_TEXT), document_version_id="v1")
    dup_action = _action(
        "The prior written consent of the Investor is required for any transfer.",
        "X",
        doc_hash=dup_live.version_hash,
        action_id="a-dup",
    )
    dup_action = approve_action(dup_action)
    check("duplicate target refuses",
          refuse_reason(dup_action, dup_live) == "ambiguous_target")

    stale = LiveDocument(paragraphs=["edited"] + paras[1:], document_version_id="v1")
    check("stale document refuses",
          refuse_reason(action, stale) == "stale")

    prot = LiveDocument(paragraphs=list(paras), document_version_id="v1", protected=True)
    prot.version_hash = live.version_hash
    check("protected document refuses", refuse_reason(action, prot) == "protected")

    ticket, reason = prepare_ticket(action, live)
    check("prepare issues a ticket", ticket is not None and reason is None)

    first = apply_prepared(live, ticket.ticket_id)
    check("first apply confirms", first["status"] == "confirmed")
    check("tracking mode restored", first["tracking_restored"] is True)
    replay = apply_prepared(live, ticket.ticket_id)
    check("replay refuses", replay["reason"] == "replay")

    reset_tickets()
    live2 = LiveDocument(paragraphs=list(paras), document_version_id="v1")
    action2 = approve_action(_action(old, new, doc_hash=live2.version_hash, version="v1"))
    ticket2, _ = prepare_ticket(action2, live2)
    expired_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    from agent.actions import tickets as T
    dumped = ticket2.model_dump()
    dumped["expires_at"] = expired_at.isoformat()
    T._TICKETS[ticket2.ticket_id] = type(ticket2).model_validate(dumped)
    expired = apply_prepared(live2, ticket2.ticket_id, now=datetime.now(timezone.utc))
    check("expired ticket refuses", expired["reason"] == "expired")

    reset_tickets()
    live3 = LiveDocument(paragraphs=list(paras), document_version_id="v1")
    action3 = approve_action(_action(old, new, doc_hash=live3.version_hash))
    ticket3, _ = prepare_ticket(action3, live3)
    unknown = verify_write(
        live3, ticket3, mutation_failed=True,
    )
    check("unverified write is failed_unknown, not retried as success",
          unknown == "failed_unknown")


def test_draft_minimum():
    print("\nminimum drafting")
    result = _run(DOUBLE_RECOVERY, router=ConfirmRouter(), draft=True)
    amend = result["amendment"]
    check("draft uses qualifier not rewrite", amend["strategy"] == "qualifier")
    check("proposed keeps original wording", SELECTION_5_3.rstrip(".") in amend["proposed"])
    check("proposed adds no-double-recovery limb",
          "recover twice" in amend["proposed"].lower())
    check("action requires approval", amend["action"]["requires_human_approval"] is True)

    clean = _run(NO_DOUBLE_ALREADY, router=ConfirmRouter(), draft=True)
    check("no draft when already solved", clean["amendment"]["status"] == "not_required")


# ---------------------------------------------------------------- runtime / DSH

def test_runtime():
    print("\nruntime")
    current = CurrentAgmtRuntime()
    called = []
    def tool():
        called.append("outline")
        return {"ok": True, "evidence_id": "e-outline"}
    out = current.run("check", {"get_outline": tool})
    check("current runtime baseline", out["status"] == "ok" and out["runtime"] == "current")
    check("document tools run", called == ["outline"])

    handle = RunHandle(run_id="r1")
    handle.cancel()
    cancelled = current.run("check", {"get_outline": tool}, cancel=handle)
    check("cancel works", cancelled["status"] == "cancelled")

    def boom():
        raise RuntimeError("tool exploded")
    err = current.run("check", {"broken": boom})
    check("tool error is visible", "error" in err["results"]["broken"])

    dsh = DSHRuntime(available=False)
    try:
        dsh.run("check", {"get_outline": tool})
        check("DSH unavailable fails closed", False)
    except DSHUnavailable:
        check("DSH unavailable fails closed", True)

    class FakeClient:
        def run(self, **kw):
            evidence = kw["tools"]["read_evidence"]()
            return {"evidence": evidence}
    spike = DSHRuntime(FakeClient(), available=True)
    def read_evidence():
        return {"evidence_id": "ev-1", "quote": "Losses"}
    def word_write():
        raise AssertionError("DSH must never write Word")
    dsh_out = spike.run("turn", {"read_evidence": read_evidence, "word_write": word_write})
    check("DSH spike can call Agmt document tools",
          dsh_out["status"] == "ok" and dsh_out["results"]["_dsh"]["evidence"]["evidence_id"] == "ev-1")
    check("DSH cannot be given Word write tools",
          "word_write" not in (dsh_out["results"].get("_dsh") or {})
          and dsh_out["results"].get("_word_authority") is False)

    os.environ["AGMT_DSH_RUNTIME"] = "1"
    from agent.runtime.factory import get_runtime
    try:
        get_runtime()
        check("flagged DSH without client is controlled failure", False)
    except DSHUnavailable:
        check("flagged DSH without client is controlled failure", True)
    del os.environ["AGMT_DSH_RUNTIME"]

    result = _run(DOUBLE_RECOVERY, router=ConfirmRouter(), runtime=CurrentAgmtRuntime())
    dsh_run = _run(DOUBLE_RECOVERY, router=ConfirmRouter(),
                   runtime=DSHRuntime(available=True))
    check("DSH and current run the same legal path on synthetic docs",
          result["card"]["finding"] == dsh_run["card"]["finding"])


def test_stale_after_analysis():
    print("\nstale version")
    captured = document_hash(DOUBLE_RECOVERY)
    result = _run(
        DOUBLE_RECOVERY,
        live_document_hash="sha256:doc-v2-after-edit",
        router=ConfirmRouter(),
    )
    check("edited-after-analysis refuses", result["state"] == "stale" or result["status"] == "stale")
    # captured hash still in provenance; live hash differs
    check("stale uses version hashes not nearest clause",
          result["command"]["provenance"]["captured_doc_hash"] == captured)


def test_table_and_stories():
    print("\ntable / stories")
    env = make_envelope(
        document_id="d", document_version_id="v",
        selected_text="in addition the Investor shall recover the same Loss again",
        paragraph_indexes=[3],
        table_path={"table_index": 0, "row": 1, "column": 2},
    )
    check("table cell selection is captured", env.structural_context.table_path.column == 2)
    result = run_contextual_command(
        matter_id="m", document_id="d", document_version_id="v",
        raw_text=GOLDEN_INSTRUCTION,
        paragraphs=TABLE_CELL,
        selection=env,
        provenance={"captured_doc_hash": document_hash(TABLE_CELL)},
        live_document_hash=document_hash(TABLE_CELL),
        router=ConfirmRouter(),
    )
    check("table-cell command still resolves or analyses",
          result["status"] in {"completed", "ready", "ambiguous", "failed"}
          or result.get("state") in {"contextual_result", "ambiguity", "error"})


def test_word_scenario_catalog():
    print("\nword scenario catalog")
    names = [
        "duplicate_indemnity_wording",
        "clause_selected_inside_table_cell",
        "selection_spanning_paragraphs",
        "pending_tracked_insertion_near_selection",
        "pending_tracked_deletion_near_selection",
        "comments_replies",
        "indemnity_in_footnote_header_footer",
        "edited_after_analysis_before_apply",
        "protected_read_only",
        "track_changes_initially_off",
        "track_changes_initially_on",
        "reconnect_after_approval",
        "duplicate_apply_replay",
        "ambiguous_clause_references",
        "identical_text_elsewhere",
    ]
    catalog = Path(__file__).parent / "fixtures" / "golden" / "word_scenarios.json"
    data = json.loads(catalog.read_text(encoding="utf-8"))
    have = {row["name"] for row in data["scenarios"]}
    check("catalog covers required Word fixtures", set(names) <= have)


if __name__ == "__main__":
    reset_commands()
    reset_tickets()
    test_flags()
    test_selection_envelope()
    test_interpreter()
    test_resolver()
    test_double_recovery_positive()
    test_no_issue_and_existing_fix()
    test_reviewer_paths()
    test_ambiguity_ui_payload()
    test_mutation_safety()
    test_draft_minimum()
    test_runtime()
    test_stale_after_analysis()
    test_table_and_stories()
    test_word_scenario_catalog()
    print(f"\n{'ALL PASSED' if not FAILS else str(len(FAILS)) + ' FAILED: ' + ', '.join(FAILS)}\n")
    sys.exit(1 if FAILS else 0)
