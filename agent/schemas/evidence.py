"""Evidence, provenance and issue records — plan §5.4."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .ids import new_id, sha256_hex, utc_now

RetrievalMethod = Literal[
    "outline", "exact_read", "definition", "use_site", "search", "overlap", "selection",
]


class Evidence(BaseModel):
    evidence_id: str
    document_version_id: str
    block_ids: list[str] = Field(default_factory=list)
    refs: list[str] = Field(default_factory=list)
    exact_quotes: list[str] = Field(default_factory=list)
    quote_sha256: list[str] = Field(default_factory=list)
    block_or_clause_ref: str = ""
    exact_quote: str = ""
    quote_hash: str = ""
    retrieval_method: RetrievalMethod = "exact_read"
    producer: str = "agmt"
    created_at: str = ""
    para: int | None = None
    anchor_verified: bool | None = None
    anchor_method: str | None = None

    def quotes(self) -> list[str]:
        if self.exact_quotes:
            return list(self.exact_quotes)
        if self.exact_quote:
            return [self.exact_quote]
        return []


class Provenance(BaseModel):
    tool_call_ids: list[str] = Field(default_factory=list)
    model_calls: list[dict] = Field(default_factory=list)
    provider_calls: list[dict] = Field(default_factory=list)
    overlap_trace: list[str] = Field(default_factory=list)
    plan_step_ids: list[str] = Field(default_factory=list)
    input_command_id: str | None = None
    captured_doc_hash: str | None = None


class IssueRecord(BaseModel):
    issue_id: str
    run_id: str = ""
    document_version_id: str
    local_id: int = 0
    ref: str
    block_id: str | None = None
    para: int = -1
    title: str
    classification: str = "legal_defect"
    severity: Literal["high", "medium", "low"] = "medium"
    position: str = "clarify"
    consequence: str = ""
    old_text: str = ""
    new_text: str = ""
    comment: str = ""
    evidence_tier: Literal[1, 2, 3] = 2
    evidence: Evidence | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    consequential_refs: list[str] = Field(default_factory=list)
    reviewer_verdict: str | None = None
    reviewer_note: str | None = None
    provenance: Provenance = Field(default_factory=Provenance)


def make_evidence(
    *,
    document_version_id: str,
    quote: str,
    ref: str = "",
    para: int | None = None,
    retrieval_method: RetrievalMethod = "exact_read",
    producer: str = "agmt",
    block_ids: list[str] | None = None,
) -> Evidence:
    digest = sha256_hex(quote)
    return Evidence(
        evidence_id=new_id(),
        document_version_id=document_version_id,
        block_ids=list(block_ids or []),
        refs=[ref] if ref else [],
        exact_quotes=[quote],
        quote_sha256=[digest],
        block_or_clause_ref=ref,
        exact_quote=quote,
        quote_hash=digest,
        retrieval_method=retrieval_method,
        producer=producer,
        created_at=utc_now(),
        para=para,
        anchor_verified=True,
        anchor_method="verbatim",
    )
