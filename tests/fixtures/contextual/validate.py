"""Structural validator for Contextual Command fixtures.

    .venv/Scripts/python.exe tests/fixtures/contextual/validate.py
"""
from __future__ import annotations

import hashlib
import json
import sys
import uuid
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
FIXTURE = HERE / "commands.json"
FAILS: list[str] = []

# Plan 5.2 / 5.3 enums. Authoritative; do not extend.
MODALITY = {"voice", "text", "context_menu", "ribbon", "palette"}
ACTIVATION = {
    "hold_to_talk", "click", "keyboard_shortcut", "context_menu", "ribbon", "typed",
}
OBJECTIVE = {
    "explain", "check", "compare", "find_uses", "find_definition",
    "draft", "comment", "navigate", "delete_everywhere", "summarise",
}
REQUESTED_OUTPUT = {
    "answer", "issues", "minimum_amendment", "bubble_comment",
    "tracked_change", "locations", "comparison",
}
URGENCY = {"normal", "fast", "high_risk"}
MENTION_CATEGORY = {
    "selection", "relative_clause", "heading", "definition",
    "concept", "party", "document", "unknown",
}
RESOLVER = {
    "selection", "exact", "definition_index", "outline", "concept_search", "model_choice",
}
REFERENCE_STATUS = {"resolved", "ambiguous", "not_found"}
COMMAND_STATUS = {
    "received", "interpreting", "ambiguous", "ready", "running",
    "waiting_user", "completed", "cancelled", "failed", "stale",
}
OPERATION = {"navigate", "replace", "delete", "comment"}
RISK = {"low", "medium", "high"}
ANCHOR_METHOD = {"block_id", "unique_local_id", "scoped_exact", "candidate_confirmation"}

CASE_KEYS = {"name", "why", "command", "candidates", "expected"}
FILE_KEYS = {"version", "plan_sections", "cases"}
EXPECTED_REQUIRED = {"references", "action_policy", "write_permitted", "expected_command_status"}
EXPECTED_OPTIONAL = {"proposed_action", "notes", "live_document_hash"}
COMMAND_KEYS = {
    "command_id", "parent_command_id", "matter_id", "document_id",
    "document_version_id", "selection", "context_refs", "raw_input",
    "interpreted_intent", "mentions", "references", "status",
    "provenance", "run_id", "idempotency_key", "created_at",
}
CANDIDATE_REQUIRED = {
    "ref_id", "label", "document_id", "document_version_id", "score", "resolver",
}


def check(name: str, cond: bool, extra: str = "") -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'  ' + extra if extra else ''}")
    if not cond:
        FAILS.append(name)


def is_uuid(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def walk_ref_ids(obj: Any) -> list[str]:
    found: list[str] = []
    if isinstance(obj, dict):
        ref = obj.get("ref_id")
        if isinstance(ref, str) and ref:
            found.append(ref)
        for value in obj.values():
            found.extend(walk_ref_ids(value))
    elif isinstance(obj, list):
        for item in obj:
            found.extend(walk_ref_ids(item))
    return found


def enum_ok(value: Any, allowed: set[str]) -> bool:
    return isinstance(value, str) and value in allowed


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def errors_for_candidate(cand: Any, prefix: str) -> list[str]:
    errs: list[str] = []
    if not isinstance(cand, dict):
        return [f"{prefix} is not an object"]
    missing = CANDIDATE_REQUIRED - set(cand)
    if missing:
        errs.append(f"{prefix} missing {sorted(missing)}")
    if "ref_id" in cand and not (isinstance(cand["ref_id"], str) and cand["ref_id"]):
        errs.append(f"{prefix}.ref_id must be a non-empty string")
    for field in ("document_id", "document_version_id"):
        if field in cand and cand[field] is not None and not is_uuid(cand[field]):
            errs.append(f"{prefix}.{field} is not a UUID")
    if "block_ids" in cand:
        if not isinstance(cand["block_ids"], list) or not all(is_uuid(b) for b in cand["block_ids"]):
            errs.append(f"{prefix}.block_ids must be a list of UUIDs")
    if "score" in cand and not isinstance(cand["score"], (int, float)):
        errs.append(f"{prefix}.score must be a number")
    if "resolver" in cand and not enum_ok(cand["resolver"], RESOLVER):
        errs.append(f"{prefix}.resolver {cand['resolver']!r} is not a plan 5.3 resolver")
    return errs


def errors_for_selection(sel: Any) -> list[str]:
    if sel is None:
        return []
    if not isinstance(sel, dict):
        return ["command.selection is not an object"]
    errs: list[str] = []
    if "selected_text" not in sel or not isinstance(sel["selected_text"], str):
        errs.append("selection.selected_text must be a string")
        return errs
    digest = sel.get("selected_text_sha256")
    expected = sha256_hex(sel["selected_text"])
    if digest != expected:
        errs.append(
            f"selection.selected_text_sha256 is {digest!r}, expected {expected}"
        )
    for field in ("block_ids",):
        if field in sel:
            if not isinstance(sel[field], list) or not all(is_uuid(b) for b in sel[field]):
                errs.append("selection.block_ids must be a list of UUIDs")
    if "unique_local_ids" in sel and not isinstance(sel["unique_local_ids"], list):
        errs.append("selection.unique_local_ids must be a list")
    if "structural_path" in sel and not isinstance(sel["structural_path"], list):
        errs.append("selection.structural_path must be a list")
    return errs


def errors_for_raw_input(raw: Any) -> list[str]:
    if not isinstance(raw, dict):
        return ["command.raw_input is not an object"]
    errs: list[str] = []
    if not enum_ok(raw.get("modality"), MODALITY):
        errs.append(f"raw_input.modality {raw.get('modality')!r} is not a plan 5.3 value")
    if not enum_ok(raw.get("activation"), ACTIVATION):
        errs.append(f"raw_input.activation {raw.get('activation')!r} is not a plan 5.3 value")
    if not isinstance(raw.get("raw_text"), str):
        errs.append("raw_input.raw_text must be a string")
    if "stt_confidence" in raw and raw["stt_confidence"] is not None:
        conf = raw["stt_confidence"]
        if not isinstance(conf, (int, float)) or not 0 <= float(conf) <= 1:
            errs.append("raw_input.stt_confidence must be a float in [0, 1]")
    return errs


def errors_for_intent(intent: Any) -> list[str]:
    if intent is None:
        return []
    if not isinstance(intent, dict):
        return ["command.interpreted_intent is not an object"]
    errs: list[str] = []
    if not enum_ok(intent.get("objective"), OBJECTIVE):
        errs.append(f"interpreted_intent.objective {intent.get('objective')!r} is not a plan 5.3 value")
    if not enum_ok(intent.get("requested_output"), REQUESTED_OUTPUT):
        errs.append(
            f"interpreted_intent.requested_output {intent.get('requested_output')!r} is not a plan 5.3 value"
        )
    urgency = intent.get("urgency", "normal")
    if not enum_ok(urgency, URGENCY):
        errs.append(f"interpreted_intent.urgency {urgency!r} is not a plan 5.3 value")
    conf = intent.get("confidence")
    if not isinstance(conf, (int, float)) or not 0 <= float(conf) <= 1:
        errs.append("interpreted_intent.confidence must be a float in [0, 1]")
    return errs


def errors_for_mentions(mentions: Any, raw_text: str) -> list[str]:
    if not isinstance(mentions, list):
        return ["command.mentions must be a list"]
    errs: list[str] = []
    seen: set[str] = set()
    for i, mention in enumerate(mentions):
        prefix = f"mentions[{i}]"
        if not isinstance(mention, dict):
            errs.append(f"{prefix} is not an object")
            continue
        mid = mention.get("mention_id")
        if not isinstance(mid, str) or not mid:
            errs.append(f"{prefix}.mention_id must be a non-empty string")
        elif mid in seen:
            errs.append(f"{prefix}.mention_id {mid!r} is duplicated")
        else:
            seen.add(mid)
        if not enum_ok(mention.get("category"), MENTION_CATEGORY):
            errs.append(f"{prefix}.category {mention.get('category')!r} is not a plan 5.3 value")
        text = mention.get("text")
        start = mention.get("start")
        end = mention.get("end")
        if not isinstance(text, str):
            errs.append(f"{prefix}.text must be a string")
            continue
        if not isinstance(start, int) or not isinstance(end, int):
            errs.append(f"{prefix}.start/end must be ints")
            continue
        if not 0 <= start <= end <= len(raw_text):
            errs.append(f"{prefix} offsets [{start}:{end}] outside raw_text len {len(raw_text)}")
            continue
        slice_ = raw_text[start:end]
        if slice_ != text:
            errs.append(
                f"{prefix} offset integrity: raw_text[{start}:{end}] is {slice_!r}, mention.text is {text!r}"
            )
    return errs


def errors_for_resolved(ref: Any, prefix: str) -> list[str]:
    if not isinstance(ref, dict):
        return [f"{prefix} is not an object"]
    errs: list[str] = []
    if not isinstance(ref.get("mention_id"), str) or not ref["mention_id"]:
        errs.append(f"{prefix}.mention_id must be a non-empty string")
    if not enum_ok(ref.get("status"), REFERENCE_STATUS):
        errs.append(f"{prefix}.status {ref.get('status')!r} is not a plan 5.3 ResolvedReference.status")
    cand = ref.get("candidate")
    if cand is not None:
        errs.extend(errors_for_candidate(cand, f"{prefix}.candidate"))
    alts = ref.get("alternatives") or []
    if not isinstance(alts, list):
        errs.append(f"{prefix}.alternatives must be a list")
    else:
        for j, alt in enumerate(alts):
            errs.extend(errors_for_candidate(alt, f"{prefix}.alternatives[{j}]"))
    return errs


def errors_for_proposed_action(action: Any) -> list[str]:
    if not isinstance(action, dict):
        return ["expected.proposed_action is not an object"]
    errs: list[str] = []
    if not is_uuid(action.get("action_id")):
        errs.append("proposed_action.action_id is not a UUID")
    if action.get("issue_id") is not None and not is_uuid(action.get("issue_id")):
        errs.append("proposed_action.issue_id is not a UUID")
    if not enum_ok(action.get("operation"), OPERATION):
        errs.append(f"proposed_action.operation {action.get('operation')!r} is not a plan 5.2 value")
    if not enum_ok(action.get("risk"), RISK):
        errs.append(f"proposed_action.risk {action.get('risk')!r} is not a plan 5.2 value")
    pre = action.get("precondition")
    if not isinstance(pre, dict):
        errs.append("proposed_action.precondition is not an object")
        return errs
    for field in ("document_id", "document_version_id"):
        if not is_uuid(pre.get(field)):
            errs.append(f"precondition.{field} is not a UUID")
    if not isinstance(pre.get("expected_doc_hash"), str) or not pre["expected_doc_hash"]:
        errs.append("precondition.expected_doc_hash must be a non-empty string")
    old = pre.get("old_text")
    if not isinstance(old, str) or not old:
        errs.append("precondition.old_text must be a non-empty exact quote")
    elif pre.get("old_text_sha256") != sha256_hex(old):
        errs.append("precondition.old_text_sha256 does not match old_text")
    methods = pre.get("anchor_method_allowed", [])
    if not isinstance(methods, list) or not all(m in ANCHOR_METHOD for m in methods):
        errs.append("precondition.anchor_method_allowed has a value outside plan 5.2")
    if "anchor" in pre:
        errs.extend(errors_for_selection(pre["anchor"]))
    digest = pre.get("expected_selected_text_sha256")
    if digest is not None:
        corresponding = None
        anchor = pre.get("anchor")
        if isinstance(anchor, dict) and isinstance(anchor.get("selected_text"), str):
            corresponding = anchor["selected_text"]
        if corresponding is None:
            errs.append(
                "precondition.expected_selected_text_sha256 has no corresponding selected text"
            )
        elif digest != sha256_hex(corresponding):
            errs.append(
                "precondition.expected_selected_text_sha256 does not match the corresponding selected text"
            )
    return errs


def validate_case(case: Any) -> list[str]:
    if not isinstance(case, dict):
        return ["case is not an object"]
    errs: list[str] = []
    keys = set(case)
    extra = keys - CASE_KEYS
    missing = CASE_KEYS - keys
    if extra:
        errs.append(f"unknown top-level keys {sorted(extra)}")
    if missing:
        errs.append(f"missing top-level keys {sorted(missing)}")
        return errs

    name = case["name"]
    if not isinstance(name, str) or not name:
        errs.append("name must be a non-empty string")
    if not isinstance(case["why"], str) or not case["why"]:
        errs.append("why must be a non-empty string")

    command = case["command"]
    if not isinstance(command, dict):
        errs.append("command is not an object")
        return errs
    cmd_extra = set(command) - COMMAND_KEYS
    if cmd_extra:
        errs.append(f"command has unknown keys {sorted(cmd_extra)}")
    for field in ("command_id", "matter_id", "document_id", "document_version_id"):
        if not is_uuid(command.get(field)):
            errs.append(f"command.{field} is not a UUID")
    if command.get("parent_command_id") is not None and not is_uuid(command["parent_command_id"]):
        errs.append("command.parent_command_id is not a UUID")
    if command.get("run_id") is not None and not is_uuid(command["run_id"]):
        errs.append("command.run_id is not a UUID")
    if not enum_ok(command.get("status"), COMMAND_STATUS):
        errs.append(f"command.status {command.get('status')!r} is not a plan 5.3 value")
    if not isinstance(command.get("idempotency_key"), str) or not command["idempotency_key"]:
        errs.append("command.idempotency_key must be a non-empty string")
    if not isinstance(command.get("provenance"), dict):
        errs.append("command.provenance must be an object")
    if not isinstance(command.get("created_at"), str) or not command["created_at"]:
        errs.append("command.created_at must be a non-empty string")

    errs.extend(errors_for_selection(command.get("selection")))
    errs.extend(errors_for_raw_input(command.get("raw_input")))
    errs.extend(errors_for_intent(command.get("interpreted_intent")))
    raw_text = ""
    if isinstance(command.get("raw_input"), dict) and isinstance(command["raw_input"].get("raw_text"), str):
        raw_text = command["raw_input"]["raw_text"]
    errs.extend(errors_for_mentions(command.get("mentions") or [], raw_text))
    mention_ids = {
        m["mention_id"]
        for m in (command.get("mentions") or [])
        if isinstance(m, dict) and isinstance(m.get("mention_id"), str)
    }

    candidates = case["candidates"]
    if not isinstance(candidates, list):
        errs.append("candidates must be a list")
        return errs
    cand_ids: list[str] = []
    for i, cand in enumerate(candidates):
        errs.extend(errors_for_candidate(cand, f"candidates[{i}]"))
        if isinstance(cand, dict) and isinstance(cand.get("ref_id"), str):
            cand_ids.append(cand["ref_id"])
    if len(cand_ids) != len(set(cand_ids)):
        errs.append(f"candidate ref_id values are not unique: {cand_ids}")
    cand_id_set = set(cand_ids)

    expected = case["expected"]
    if not isinstance(expected, dict):
        errs.append("expected is not an object")
        return errs
    exp_keys = set(expected)
    if EXPECTED_REQUIRED - exp_keys:
        errs.append(f"expected missing {sorted(EXPECTED_REQUIRED - exp_keys)}")
    unknown_exp = exp_keys - EXPECTED_REQUIRED - EXPECTED_OPTIONAL
    if unknown_exp:
        errs.append(f"expected has unknown keys {sorted(unknown_exp)}")

    if not enum_ok(expected.get("expected_command_status"), COMMAND_STATUS):
        errs.append(
            f"expected_command_status {expected.get('expected_command_status')!r} is not a plan 5.3 ContextualCommand.status"
        )
    if not isinstance(expected.get("write_permitted"), bool):
        errs.append("expected.write_permitted must be a bool")
    policy = expected.get("action_policy")
    if not isinstance(policy, dict) or not isinstance(policy.get("decision"), str) or not isinstance(policy.get("reason"), str):
        errs.append("expected.action_policy must be an object with string decision and reason")

    refs = expected.get("references")
    if not isinstance(refs, list):
        errs.append("expected.references must be a list")
        refs = []
    for i, ref in enumerate(refs):
        errs.extend(errors_for_resolved(ref, f"expected.references[{i}]"))
        if isinstance(ref, dict) and ref.get("mention_id") not in mention_ids:
            errs.append(
                f"expected.references[{i}].mention_id {ref.get('mention_id')!r} is not in command.mentions"
            )

    expected_ref_ids = walk_ref_ids(expected)
    unknown_ids = [rid for rid in expected_ref_ids if rid not in cand_id_set]
    if unknown_ids:
        errs.append(f"expected ref_id values not in candidates: {unknown_ids}")

    ambiguous_refs = [r for r in refs if isinstance(r, dict) and r.get("status") == "ambiguous"]
    not_found_refs = [r for r in refs if isinstance(r, dict) and r.get("status") == "not_found"]
    is_ambiguous = (
        expected.get("expected_command_status") == "ambiguous" or bool(ambiguous_refs)
    )
    if is_ambiguous:
        if len(cand_ids) < 2:
            errs.append("ambiguous case must have 2+ candidates")
        for ref in ambiguous_refs:
            alts = ref.get("alternatives") or []
            if len(alts) < 2:
                errs.append(
                    f"ambiguous mention {ref.get('mention_id')!r} must list 2+ alternative candidate IDs"
                )
            if ref.get("candidate") is not None:
                errs.append(
                    f"ambiguous mention {ref.get('mention_id')!r} must not pick a candidate (that is a guess)"
                )
        if expected.get("write_permitted") is not False:
            errs.append("ambiguous case must set write_permitted false")
        if expected.get("proposed_action"):
            errs.append("ambiguous case must not authorise a proposed_action")

    for ref in not_found_refs:
        if ref.get("candidate") is not None:
            errs.append(f"not_found mention {ref.get('mention_id')!r} must not have a candidate")
        alts = ref.get("alternatives") or []
        if alts:
            errs.append(f"not_found mention {ref.get('mention_id')!r} must not list alternatives")
        leftover = walk_ref_ids(ref)
        if leftover:
            errs.append(
                f"not_found mention {ref.get('mention_id')!r} references candidate IDs {leftover}"
            )

    if refs and all(isinstance(r, dict) and r.get("status") == "not_found" for r in refs):
        leftover = walk_ref_ids(expected)
        if leftover:
            errs.append(f"not_found case references candidate IDs {leftover}")

    if expected.get("write_permitted") is True:
        sel = command.get("selection") or {}
        quote = sel.get("selected_text") if isinstance(sel, dict) else None
        action = expected.get("proposed_action")
        if not quote:
            errs.append("write-authorising case must carry an exact selected quote")
        if not command.get("document_version_id"):
            errs.append("write-authorising case must carry document_version_id")
        if not isinstance(action, dict):
            errs.append("write-authorising case must include proposed_action")
        else:
            errs.extend(errors_for_proposed_action(action))
            pre = action.get("precondition") if isinstance(action.get("precondition"), dict) else {}
            if not (pre.get("expected_doc_hash") or "").strip():
                errs.append("write-authorising case must carry a document version hash")
            if not (pre.get("old_text") or "").strip():
                errs.append("write-authorising case must carry an exact old_text quote")
    elif expected.get("proposed_action"):
        errs.extend(errors_for_proposed_action(expected["proposed_action"]))

    return errs


def list_cases(doc: dict[str, Any]) -> int:
    for case in doc.get("cases") or []:
        if isinstance(case, dict):
            print(f"{case.get('name', '<unnamed>')}: {case.get('why', '')}")
    return 0


def validate(doc: dict[str, Any]) -> None:
    extra = set(doc) - FILE_KEYS
    missing = FILE_KEYS - set(doc)
    check("file_keys", not extra and not missing,
          f"extra={sorted(extra)} missing={sorted(missing)}" if extra or missing else "")
    check("version_int", isinstance(doc.get("version"), int),
          "" if isinstance(doc.get("version"), int) else f"got {doc.get('version')!r}")
    sections = doc.get("plan_sections")
    check("plan_sections", isinstance(sections, list) and all(isinstance(s, str) for s in sections or []))
    cases = doc.get("cases")
    check("cases_list", isinstance(cases, list) and bool(cases),
          "cases must be a non-empty list" if not cases else "")
    if not isinstance(cases, list):
        return

    names = [c.get("name") for c in cases if isinstance(c, dict)]
    dupes = sorted({n for n in names if names.count(n) > 1})
    check("unique_names", not dupes, f"duplicates: {dupes}" if dupes else "")

    valid = 0
    for case in cases:
        name = case.get("name") if isinstance(case, dict) else "<invalid>"
        errs = validate_case(case)
        if errs:
            check(str(name), False, "; ".join(errs))
        else:
            check(str(name), True)
            valid += 1
    print(f"contextual fixtures: {valid}/{len(cases)} cases valid")


def main(argv: list[str]) -> int:
    if not FIXTURE.is_file():
        print(f"missing fixture file: {FIXTURE}", file=sys.stderr)
        return 1
    try:
        doc = json.loads(FIXTURE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"invalid JSON: {exc}", file=sys.stderr)
        return 1
    if not isinstance(doc, dict):
        print("commands.json must be a JSON object", file=sys.stderr)
        return 1
    if argv[1:] == ["--list"]:
        return list_cases(doc)
    if argv[1:]:
        print("usage: validate.py [--list]", file=sys.stderr)
        return 1
    validate(doc)
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
