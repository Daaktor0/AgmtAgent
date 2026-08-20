"""Document version identity for the golden slice."""
from __future__ import annotations

from pydantic import BaseModel, Field

from .ids import document_hash, new_id, utc_now


class DocumentSnapshot(BaseModel):
    paragraphs: list[str]
    list_prefixes: list[str] = Field(default_factory=list)
    unique_local_ids: list[str] = Field(default_factory=list)
    list_levels: list[int | None] = Field(default_factory=list)
    comments: list[dict] | None = None
    revisions: list[dict] | None = None
    tables: list[dict] | None = None
    stories: dict[str, list[str]] = Field(default_factory=dict)


class DocumentVersion(BaseModel):
    document_id: str
    document_version_id: str
    version_hash: str
    captured_at: str
    snapshot: DocumentSnapshot


def version_from_paragraphs(
    paragraphs: list[str],
    *,
    document_id: str,
    document_version_id: str | None = None,
    **extra,
) -> DocumentVersion:
    snap = DocumentSnapshot(paragraphs=list(paragraphs), **{
        k: v for k, v in extra.items()
        if k in DocumentSnapshot.model_fields
    })
    digest = document_hash(snap.paragraphs)
    return DocumentVersion(
        document_id=document_id,
        document_version_id=document_version_id or new_id(),
        version_hash=digest,
        captured_at=utc_now(),
        snapshot=snap,
    )
