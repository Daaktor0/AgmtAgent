"""Configuration: API key, model roles, runtime settings."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.yaml"
SKILL_PATH = ROOT / "skill" / "AGREEMENT-SKILL.md"

# Role -> ordered slug prefixes. The newest live model matching the earliest
# matching prefix wins. Nothing here is a hard-coded version, so the tool keeps
# working when providers ship new models.
DEFAULT_ROLES = {
    # The head. Owns the mandate, the plan, prioritisation and final QC.
    "supervisor": [
        "anthropic/claude-opus",
        "openai/gpt-5",
        "google/gemini-3",
        "anthropic/claude-sonnet",
        "openai/gpt",
        "google/gemini",
        "x-ai/grok",
    ],
    # Reads a bounded slice of the document and reports on it.
    "analyst": [
        "anthropic/claude-sonnet",
        "openai/gpt-5",
        "google/gemini-3",
        "x-ai/grok",
        "anthropic/claude",
        "openai/gpt",
    ],
    # Produces the actual clause language.
    "drafter": [
        "anthropic/claude-opus",
        "anthropic/claude-sonnet",
        "openai/gpt-5",
        "google/gemini-3",
        "openai/gpt",
    ],
    # Bulk extraction and classification. Cheap and fast.
    "extractor": [
        "anthropic/claude-haiku",
        "google/gemini-3-flash",
        "openai/gpt-5-mini",
        "google/gemini-flash",
        "openai/gpt-4o-mini",
    ],
    # Second reader. Sees recorded issues only, not the transcript.
    "reviewer": [
        "anthropic/claude-sonnet",
        "openai/gpt-5",
        "google/gemini-3",
        "anthropic/claude",
        "openai/gpt",
        "x-ai/grok",
    ],
}


@dataclass
class Config:
    api_key: str = ""
    pinned: dict[str, str] = field(default_factory=dict)
    prefer: dict[str, list[str]] = field(default_factory=lambda: dict(DEFAULT_ROLES))
    max_supervisor_steps: int = 40
    temperature: float = 0.2
    port: int = 8787
    require_only_free: bool = False

    @classmethod
    def load(cls) -> "Config":
        raw = {}
        if CONFIG_PATH.exists():
            raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
        prefer = dict(DEFAULT_ROLES)
        for role, slugs in (raw.get("prefer") or {}).items():
            if slugs:
                prefer[role] = list(slugs)
        return cls(
            api_key=os.environ.get("OPENROUTER_API_KEY") or raw.get("openrouter_api_key", "") or "",
            pinned={k: v for k, v in (raw.get("pinned") or {}).items() if v},
            prefer=prefer,
            max_supervisor_steps=int(raw.get("max_supervisor_steps", 40)),
            temperature=float(raw.get("temperature", 0.2)),
            port=int(raw.get("port", 8787)),
            require_only_free=bool(raw.get("require_only_free", False)),
        )

    def save_pins(self, pinned: dict[str, str]) -> None:
        self.pinned = {k: v for k, v in pinned.items() if v}
        if os.environ.get("HOSTED") == "1":
            return
        raw = {}
        if CONFIG_PATH.exists():
            raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
        raw["pinned"] = self.pinned
        CONFIG_PATH.write_text(yaml.safe_dump(raw, sort_keys=False), encoding="utf-8")

    def save_key(self, key: str) -> None:
        self.api_key = key
        if os.environ.get("HOSTED") == "1":
            return
        raw = {}
        if CONFIG_PATH.exists():
            raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
        raw["openrouter_api_key"] = key
        CONFIG_PATH.write_text(yaml.safe_dump(raw, sort_keys=False), encoding="utf-8")


def load_skill() -> str:
    return SKILL_PATH.read_text(encoding="utf-8")
