"""SelectionEnvelope (Word capture) and SelectionAnchor (plan §5.2)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .ids import new_id, sha256_hex, utc_now

Story = Literal["body", "header", "footer", "footnote", "endnote", "other"]
StoryType = Literal["main", "header", "footer", "footnote", "endnote", "other"]

_STORY_TO_TYPE: dict[str, StoryType] = {
    "body": "main",
    "header": "header",
    "footer": "footer",
    "footnote": "footnote",
    "endnote": "endnote",
    "other": "other",
}
_TYPE_TO_STORY: dict[str, Story] = {
    "main": "body",
    "header": "header",
    "footer": "footer",
    "footnote": "footnote",
    "endnote": "endnote",
    "other": "other",
}


class TablePath(BaseModel):
    model_config = ConfigDict(frozen=True)
    table_index: int
    row: int | None = None
    column: int | None = None


class StructuralContext(BaseModel):
    model_config = ConfigDict(frozen=True)
    paragraph_ids: list[str] = Field(default_factory=list)
    paragraph_indexes: list[int] = Field(default_factory=list)
    table_path: TablePath | None = None
    heading_path: list[str] = Field(default_factory=list)


class SurroundingContext(BaseModel):
    model_config = ConfigDict(frozen=True)
    prefix: str = ""
    suffix: str = ""
    prefix_hash: str = ""
    suffix_hash: str = ""


class SelectionEnvelope(BaseModel):
    """Immutable Word capture. Paragraph.uniqueLocalId is a locator, not identity."""

    model_config = ConfigDict(frozen=True)
    selection_id: str
    document_id: str
    document_version_id: str
    story: Story = "body"
    selected_text: str
    selected_text_hash: str
    structural_context: StructuralContext = Field(default_factory=StructuralContext)
    surrounding_context: SurroundingContext = Field(default_factory=SurroundingContext)
    captured_at: str
    source_word_api: str = "Document.getSelection"


class SelectionAnchor(BaseModel):
    """Plan §5.2 durable envelope stored on ContextualCommand."""

    story_type: StoryType = "main"
    selected_text: str
    selected_text_sha256: str
    ooxml_sha256: str | None = None
    block_ids: list[str] = Field(default_factory=list)
    unique_local_ids: list[str] = Field(default_factory=list)
    first_block_idx: int | None = None
    last_block_idx: int | None = None
    prefix_text: str = ""
    suffix_text: str = ""
    structural_path: list[str] = Field(default_factory=list)
    captured_at: str = ""
    source_word_api: str = "Document.getSelection"


def make_envelope(
    *,
    document_id: str,
    document_version_id: str,
    selected_text: str,
    story: Story = "body",
    paragraph_ids: list[str] | None = None,
    paragraph_indexes: list[int] | None = None,
    table_path: TablePath | dict | None = None,
    heading_path: list[str] | None = None,
    prefix: str = "",
    suffix: str = "",
    captured_at: str | None = None,
    source_word_api: str = "Document.getSelection",
    selection_id: str | None = None,
) -> SelectionEnvelope:
    path = table_path
    if isinstance(path, dict):
        path = TablePath(**path)
    surrounding = SurroundingContext(
        prefix=prefix,
        suffix=suffix,
        prefix_hash=sha256_hex(prefix) if prefix else "",
        suffix_hash=sha256_hex(suffix) if suffix else "",
    )
    return SelectionEnvelope(
        selection_id=selection_id or new_id(),
        document_id=document_id,
        document_version_id=document_version_id,
        story=story,
        selected_text=selected_text,
        selected_text_hash=sha256_hex(selected_text),
        structural_context=StructuralContext(
            paragraph_ids=list(paragraph_ids or []),
            paragraph_indexes=list(paragraph_indexes or []),
            table_path=path,
            heading_path=list(heading_path or []),
        ),
        surrounding_context=surrounding,
        captured_at=captured_at or utc_now(),
        source_word_api=source_word_api,
    )


def envelope_to_anchor(envelope: SelectionEnvelope) -> SelectionAnchor:
    ctx = envelope.structural_context
    indexes = ctx.paragraph_indexes
    return SelectionAnchor(
        story_type=_STORY_TO_TYPE.get(envelope.story, "other"),
        selected_text=envelope.selected_text,
        selected_text_sha256=envelope.selected_text_hash,
        block_ids=list(ctx.paragraph_ids),
        unique_local_ids=list(ctx.paragraph_ids),
        first_block_idx=indexes[0] if indexes else None,
        last_block_idx=indexes[-1] if indexes else None,
        prefix_text=envelope.surrounding_context.prefix,
        suffix_text=envelope.surrounding_context.suffix,
        structural_path=list(ctx.heading_path),
        captured_at=envelope.captured_at,
        source_word_api=envelope.source_word_api,
    )


def anchor_to_envelope(
    anchor: SelectionAnchor,
    *,
    document_id: str,
    document_version_id: str,
    selection_id: str | None = None,
) -> SelectionEnvelope:
    indexes: list[int] = []
    if anchor.first_block_idx is not None:
        start = anchor.first_block_idx
        end = anchor.last_block_idx if anchor.last_block_idx is not None else start
        indexes = list(range(start, end + 1))
    return make_envelope(
        document_id=document_id,
        document_version_id=document_version_id,
        selected_text=anchor.selected_text,
        story=_TYPE_TO_STORY.get(anchor.story_type, "other"),
        paragraph_ids=list(anchor.unique_local_ids or anchor.block_ids),
        paragraph_indexes=indexes,
        heading_path=list(anchor.structural_path),
        prefix=anchor.prefix_text,
        suffix=anchor.suffix_text,
        captured_at=anchor.captured_at or utc_now(),
        source_word_api=anchor.source_word_api,
        selection_id=selection_id,
    )
