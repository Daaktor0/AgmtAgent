"""Load the offline eval corpus."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass
class CorpusDoc:
    doc_id: str
    paragraphs: list[str]
    prefixes: list[str]
    labels: list[dict]


def load_corpus(corpus_dir: Path) -> list[CorpusDoc]:
    root = Path(corpus_dir)
    if not root.is_dir():
        raise FileNotFoundError(f"corpus directory not found: {root}")
    docs: list[CorpusDoc] = []
    for path in sorted(p for p in root.iterdir() if p.is_dir()):
        if path.name.startswith("_"):
            continue
        ingested_path = path / "ingested.json"
        labels_path = path / "labels.yaml"
        if not ingested_path.is_file() or not labels_path.is_file():
            continue
        ingested = json.loads(ingested_path.read_text(encoding="utf-8"))
        labels = yaml.safe_load(labels_path.read_text(encoding="utf-8")) or []
        docs.append(CorpusDoc(
            doc_id=path.name,
            paragraphs=list(ingested["paragraphs"]),
            prefixes=list(ingested.get("prefixes") or []),
            labels=list(labels),
        ))
    return docs
