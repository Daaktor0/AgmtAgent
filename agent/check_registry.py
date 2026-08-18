"""Versioned mechanical-check registry.

Each check has a stable id, a legacy name (what findings still carry for the
eval corpus), a runner on Document, and the ingestion capabilities it needs.
A missing capability suppresses the check and is reported — it is not a pass.
"""
from __future__ import annotations

from dataclasses import dataclass

from .document import Document, Issue


@dataclass(frozen=True)
class Check:
    id: str
    legacy: str
    family: str
    version: int
    default_severity: str
    precision_target: float
    requires: tuple[str, ...]
    scope: str
    runner: str
    certainty: str


# One row per check id. Several ids may share a runner; the runner is invoked
# once if any of its checks is eligible.
CHECKS: tuple[Check, ...] = (
    Check("structure.broken_xref", "broken_cross_reference", "structure", 1,
          "high", 0.95, (), "document", "_check_xrefs", "exact"),
    Check("structure.orphan_schedule", "orphan_schedule", "structure", 1,
          "medium", 0.90, (), "document", "_check_orphan_schedules", "exact"),
    Check("structure.empty_schedule", "empty_schedule", "structure", 1,
          "medium", 0.90, (), "document", "_check_empty_schedules", "exact"),
    Check("structure.numbering_gap", "numbering_gap", "structure", 1,
          "medium", 0.90, (), "document", "_check_numbering", "exact"),
    Check("structure.duplicate_number", "duplicate_numbering", "structure", 1,
          "medium", 0.95, (), "document", "_check_numbering", "exact"),
    Check("structure.missing_chapeau", "missing_chapeau", "structure", 1,
          "low", 0.85, (), "document", "_check_missing_chapeau", "exact"),
    Check("structure.xref_implausible", "xref_implausible", "structure", 1,
          "medium", 0.70, (), "document", "_check_xref_implausible", "heuristic"),
    Check("structure.depth_anomaly", "depth_anomaly", "structure", 1,
          "low", 0.70, (), "document", "_check_depth_anomaly", "heuristic"),
    Check("defterm.duplicate", "duplicate_definition", "defterm", 1,
          "high", 0.95, (), "document", "_check_definitions", "exact"),
    Check("defterm.unused", "defined_but_unused", "defterm", 1,
          "low", 0.80, (), "document", "_check_definitions", "exact"),
    Check("defterm.undefined_candidate", "possibly_undefined_term", "defterm", 1,
          "low", 0.60, (), "document", "_check_definitions", "heuristic"),
    Check("defterm.case_drift", "defined_term_case_drift", "defterm", 1,
          "medium", 0.90, (), "document", "_check_case_drift", "exact"),
    Check("defterm.forward_use", "forward_defined_term", "defterm", 1,
          "medium", 0.85, (), "document", "_check_forward_defs", "exact"),
    Check("defterm.circular", "circular_definition", "defterm", 1,
          "high", 0.95, (), "document", "_check_circular_defs", "exact"),
    Check("defterm.scope_mismatch", "scope_mismatch", "defterm", 1,
          "medium", 0.70, (), "document", "_check_scope_mismatch", "heuristic"),
    Check("amount.figure_word_mismatch", "amount_mismatch", "amount", 1,
          "high", 0.95, (), "document", "_check_amounts", "exact"),
    Check("amount.currency_inconsistency", "currency_inconsistency", "amount", 1,
          "medium", 0.70, (), "document", "_check_currency", "heuristic"),
    Check("amount.percentage_sum", "percentage_sum", "amount", 1,
          "high", 0.90, (), "document", "_check_percentage_sum", "exact"),
    Check("date.logic_conflict", "date_logic_conflict", "date", 1,
          "high", 0.90, (), "document", "_check_date_logic", "exact"),
    Check("threshold.conflict", "threshold_conflict", "threshold", 1,
          "high", 0.70, (), "document", "_check_thresholds", "heuristic"),
    Check("party.name_drift", "party_name_drift", "party", 1,
          "medium", 0.80, (), "document", "_check_party_name_drift", "exact"),
    Check("party.capacity_inconsistency", "capacity_inconsistency", "party", 1,
          "medium", 0.70, (), "document", "_check_capacity", "heuristic"),
    Check("exec.signature_block_mismatch", "signature_block_mismatch", "exec", 1,
          "medium", 0.85, (), "document", "_check_signature_blocks", "exact"),
    Check("exec.unfilled_placeholder", "unfilled_placeholder", "exec", 1,
          "high", 0.95, (), "document", "_check_placeholders", "exact"),
    Check("exec.unresolved_comment", "unresolved_comment", "exec", 1,
          "medium", 0.95, ("comments",), "document", "_check_unresolved_comments", "exact"),
    Check("exec.pending_tracked_change", "pending_tracked_change", "exec", 1,
          "high", 0.95, ("revisions",), "document", "_check_pending_revisions", "exact"),
    Check("xdoc.defterm_conflict", "xdoc_defterm_conflict", "xdoc", 1,
          "high", 0.90, ("companions",), "matter", "_check_cross_document", "exact"),
    Check("xdoc.threshold_conflict", "xdoc_threshold_conflict", "xdoc", 1,
          "medium", 0.70, ("companions",), "matter", "_check_cross_document", "heuristic"),
    Check("xdoc.orphan_reference", "xdoc_orphan_reference", "xdoc", 1,
          "high", 0.90, ("companions",), "matter", "_check_cross_document", "exact"),
    Check("xdoc.disclosure_mapping_gap", "xdoc_disclosure_mapping_gap", "xdoc", 1,
          "high", 0.85, ("companions",), "matter", "_check_cross_document", "exact"),
)

BY_LEGACY = {c.legacy: c for c in CHECKS}
BY_ID = {c.id: c for c in CHECKS}


def stamp(issue: Issue) -> Issue:
    spec = BY_LEGACY.get(issue.check)
    if spec is None:
        return issue
    issue.check_id = spec.id
    issue.check_version = spec.version
    issue.family = spec.family
    if spec.certainty == "heuristic" and issue.certainty == "exact":
        issue.certainty = "heuristic"
    return issue


def run_registered(doc: Document, family: str | None = None) -> tuple[list[Issue], list[dict]]:
    """Run eligible checks. Returns (findings, suppressed)."""
    caps = doc.capabilities
    findings: list[Issue] = []
    suppressed: list[dict] = []
    ran: set[str] = set()
    want_family = (family or "").strip().lower() or None

    for spec in CHECKS:
        if want_family and spec.family != want_family and not spec.id.startswith(want_family):
            continue
        missing = [req for req in spec.requires if req not in caps]
        if missing:
            suppressed.append({
                "id": spec.id, "check": spec.legacy, "missing": missing,
            })
            continue
        if spec.runner in ran:
            continue
        ran.add(spec.runner)
        fn = getattr(doc, spec.runner, None)
        if fn is None:
            continue
        findings.extend(fn())

    stamped = [stamp(i) for i in findings]
    if want_family:
        stamped = [
            i for i in stamped
            if i.family == want_family or (i.check_id or "").startswith(want_family)
            or i.check.startswith(want_family)
        ]
    order = {"high": 0, "medium": 1, "low": 2}
    stamped.sort(key=lambda x: (order.get(x.severity, 9), x.para))
    return stamped, suppressed
