"""Deterministic reference resolver. A model may rank candidates, never invent them."""
from __future__ import annotations

import re
from typing import Iterable

from agent.document import Document
from agent.schemas.command import (
    ContextualCommand,
    ReferenceCandidate,
    ReferenceMention,
    ResolvedReference,
)
from agent.schemas.ids import sha256_hex

_INDEMNITY = re.compile(r"\bindemnit", re.I)
_CLAUSE_NUM = re.compile(
    r"\b(?:clause|section|article)\s+(\d+(?:\.\d+)*)\b",
    re.I,
)


def _selection_candidate(command: ContextualCommand) -> ReferenceCandidate | None:
    sel = command.selection
    if sel is None or not (sel.selected_text or "").strip():
        return None
    indexes = []
    if sel.first_block_idx is not None:
        indexes.append(sel.first_block_idx)
    clause_ref = None
    if sel.structural_path:
        clause_ref = sel.structural_path[-1]
    return ReferenceCandidate(
        ref_id="sel-" + sha256_hex(sel.selected_text)[:12],
        label="Selected language",
        document_id=command.document_id,
        document_version_id=command.document_version_id,
        block_ids=list(sel.block_ids),
        clause_ref=clause_ref,
        score=1.0,
        resolver="selection",
        para=sel.first_block_idx,
        excerpt=(sel.selected_text or "")[:240],
    )


def candidates_from_document(
    doc: Document,
    command: ContextualCommand,
) -> list[ReferenceCandidate]:
    """Build the only pool a model may choose from."""
    out: list[ReferenceCandidate] = []
    sel = _selection_candidate(command)
    if sel:
        out.append(sel)

    for clause in doc.clauses:
        if not clause.number:
            continue
        heading = (clause.heading or "").strip()
        label = f"{clause.ref} {heading}".strip()
        text = " ".join(doc.paras[clause.start:clause.end + 1])
        score = 0.5
        kind: str = "outline"
        if heading:
            kind = "exact"
            score = 0.8
        out.append(ReferenceCandidate(
            ref_id=f"clause-{clause.ref}".replace(" ", "-").lower(),
            label=label or clause.ref,
            document_id=command.document_id,
            document_version_id=command.document_version_id,
            clause_ref=clause.ref,
            score=score,
            resolver=kind,  # type: ignore[arg-type]
            para=clause.start,
            heading=heading,
            excerpt=text[:240],
        ))

    for term, definition in doc.definitions.items():
        out.append(ReferenceCandidate(
            ref_id="def-" + sha256_hex(term)[:12],
            label=f'Definition of "{term}"',
            document_id=command.document_id,
            document_version_id=command.document_version_id,
            clause_ref=(doc.clause_at(definition.para).ref
                        if doc.clause_at(definition.para) else None),
            score=0.99,
            resolver="definition_index",
            para=definition.para,
            heading=term,
            excerpt=definition.text[:240],
        ))
    return out


def _pool_by_id(candidates: Iterable[ReferenceCandidate]) -> dict[str, ReferenceCandidate]:
    return {c.ref_id: c for c in candidates}


def _resolve_this(
    mention: ReferenceMention,
    command: ContextualCommand,
    pool: list[ReferenceCandidate],
) -> ResolvedReference:
    sel = next((c for c in pool if c.resolver == "selection"), None)
    if sel is None:
        sel = _selection_candidate(command)
    if sel is None or not (command.selection and command.selection.selected_text.strip()):
        return ResolvedReference(
            mention_id=mention.mention_id,
            status="not_found",
            reason="Empty or missing selection; 'this' has nothing to bind to.",
        )
    return ResolvedReference(
        mention_id=mention.mention_id,
        status="resolved",
        candidate=sel,
        reason="SelectionAnchor captured at activation; exact selected range.",
    )


def _heading_matches(mention_text: str, candidate: ReferenceCandidate) -> bool:
    needle = mention_text.lower()
    needle = re.sub(r"^the\s+", "", needle)
    needle = re.sub(r"\s+clause$", "", needle).strip()
    if not needle:
        return False
    blob = f"{candidate.clause_ref or ''} {candidate.label} {candidate.heading}".lower()
    if needle in blob:
        return True
    if needle == "indemnity" and _INDEMNITY.search(blob):
        return True
    return False


def _unique_clause_groups(matches: list[ReferenceCandidate]) -> list[ReferenceCandidate]:
    """Collapse a heading and its children into the parent when they share a prefix."""
    by_ref: dict[str, ReferenceCandidate] = {}
    for cand in matches:
        ref = (cand.clause_ref or cand.ref_id).strip()
        by_ref[ref] = cand
    parents: list[ReferenceCandidate] = []
    refs = list(by_ref)
    for ref, cand in by_ref.items():
        if any(
            other != ref and ref.startswith(other.rstrip(".") + ".")
            for other in refs
        ):
            continue
        parents.append(cand)
    return parents


def _resolve_heading(
    mention: ReferenceMention,
    pool: list[ReferenceCandidate],
    chosen_ids: set[str],
) -> ResolvedReference:
    numbered = _CLAUSE_NUM.search(mention.text)
    if numbered:
        want = numbered.group(1)
        exact = [
            c for c in pool
            if (c.clause_ref or "").rstrip(".") == want
            or (c.clause_ref or "").rstrip(".").endswith(" " + want)
        ]
        if len(exact) == 1:
            return ResolvedReference(
                mention_id=mention.mention_id,
                status="resolved",
                candidate=exact[0],
                reason="Exact clause number index.",
            )
        if not exact:
            return ResolvedReference(
                mention_id=mention.mention_id,
                status="not_found",
                reason=f"No clause {want} in the document index.",
            )

    heading_hits = [
        c for c in pool
        if c.resolver in {"exact", "outline"} and _heading_matches(mention.text, c)
    ]
    grouped = _unique_clause_groups(heading_hits)
    if chosen_ids:
        picked = [c for c in grouped if c.ref_id in chosen_ids]
        if len(picked) == 1:
            return ResolvedReference(
                mention_id=mention.mention_id,
                status="resolved",
                candidate=picked[0],
                alternatives=[c for c in grouped if c.ref_id != picked[0].ref_id],
                reason="Lawyer chose among deterministically produced candidates.",
            )

    if len(grouped) == 1:
        return ResolvedReference(
            mention_id=mention.mention_id,
            status="resolved",
            candidate=grouped[0],
            reason="Unique heading/outline match.",
        )
    if len(grouped) > 1:
        return ResolvedReference(
            mention_id=mention.mention_id,
            status="ambiguous",
            alternatives=grouped,
            reason="More than one materially plausible target.",
        )

    concept = [
        c for c in pool
        if c.resolver == "concept_search" and _heading_matches(mention.text, c)
    ]
    if not concept:
        # Last resort: lexical scan of excerpts already in the pool. Still no invention.
        concept = [
            c for c in pool
            if c.resolver != "selection" and _heading_matches(mention.text, c)
        ]
        for c in concept:
            if c.resolver not in {"exact", "outline", "definition_index"}:
                c.resolver = "concept_search"
    grouped = _unique_clause_groups(concept)
    if len(grouped) == 1:
        return ResolvedReference(
            mention_id=mention.mention_id,
            status="resolved",
            candidate=grouped[0],
            reason="Bounded concept search over indexed clauses.",
        )
    if len(grouped) > 1:
        return ResolvedReference(
            mention_id=mention.mention_id,
            status="ambiguous",
            alternatives=grouped,
            reason="Concept search produced multiple plausible clauses.",
        )
    return ResolvedReference(
        mention_id=mention.mention_id,
        status="not_found",
        reason="No indexed clause matches that heading.",
    )


def _resolve_definition(
    mention: ReferenceMention,
    pool: list[ReferenceCandidate],
) -> ResolvedReference:
    text = mention.text
    m = re.search(r"definition of\s+[“\"']?([^”\"']+)[”\"']?", text, re.I)
    term = (m.group(1) if m else text).strip().strip("\"'")
    defs = [c for c in pool if c.resolver == "definition_index"]
    exact = [c for c in defs if c.heading.lower() == term.lower()]
    if len(exact) == 1:
        return ResolvedReference(
            mention_id=mention.mention_id,
            status="resolved",
            candidate=exact[0],
            reason="Definition index exact match.",
        )
    near = [c for c in defs if term.lower() in c.heading.lower()]
    if len(near) == 1:
        return ResolvedReference(
            mention_id=mention.mention_id,
            status="resolved",
            candidate=near[0],
            reason="Definition index case-normalized match.",
        )
    if len(near) > 1:
        return ResolvedReference(
            mention_id=mention.mention_id,
            status="ambiguous",
            alternatives=near,
            reason="Multiple definitions match that term.",
        )
    return ResolvedReference(
        mention_id=mention.mention_id,
        status="not_found",
        reason=f'No definition of "{term}" in the index.',
    )


def resolve_command(
    command: ContextualCommand,
    *,
    document: Document | None = None,
    candidates: list[ReferenceCandidate] | None = None,
    live_document_hash: str | None = None,
) -> ContextualCommand:
    """Fill command.references. Never invent a candidate id."""
    work = command.model_copy(deep=True)
    captured = (work.provenance or {}).get("captured_doc_hash")
    if (
        live_document_hash
        and captured
        and live_document_hash != captured
    ):
        work.status = "stale"
        work.references = []
        return work

    pool: list[ReferenceCandidate] = []
    if document is not None:
        pool.extend(candidates_from_document(document, work))
    if candidates:
        known = {c.ref_id for c in pool}
        for extra in candidates:
            if extra.ref_id not in known:
                pool.append(extra)
                known.add(extra.ref_id)

    chosen = set(work.chosen_ref_ids or [])
    resolved: list[ResolvedReference] = []
    for mention in work.mentions:
        if mention.category == "selection":
            resolved.append(_resolve_this(mention, work, pool))
        elif mention.category == "definition":
            resolved.append(_resolve_definition(mention, pool))
        elif mention.category in {"heading", "concept", "relative_clause"}:
            resolved.append(_resolve_heading(mention, pool, chosen))
        else:
            resolved.append(ResolvedReference(
                mention_id=mention.mention_id,
                status="not_found",
                reason="Unsupported mention category for this slice.",
            ))

    work.references = resolved
    if any(r.status == "ambiguous" for r in resolved):
        work.status = "ambiguous"
    elif any(r.status == "not_found" for r in resolved):
        work.status = "failed" if work.status != "stale" else work.status
        if work.status != "stale":
            work.status = "failed"
    else:
        work.status = "ready"
    return work


def ambiguity_prompt(command: ContextualCommand) -> str:
    lines = ["I found more than one potentially relevant provision:"]
    seen: set[str] = set()
    for ref in command.references:
        if ref.status != "ambiguous":
            continue
        for cand in ref.alternatives:
            if cand.ref_id in seen:
                continue
            seen.add(cand.ref_id)
            label = cand.label or cand.clause_ref or cand.ref_id
            lines.append(label)
        lines.append("")
        lines.append("Which one should I compare this against?")
    return "\n".join(lines).strip()
