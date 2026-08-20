"""UUID and hash helpers."""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone


def sha256_hex(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def new_id() -> str:
    return str(uuid.uuid4())


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def document_hash(paragraphs: list[str]) -> str:
    body = "\n".join(paragraphs or [])
    return "sha256:" + sha256_hex(body)
