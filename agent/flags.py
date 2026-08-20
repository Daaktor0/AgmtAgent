"""Explicit feature flags for the golden vertical slice.

Environment variables override config.yaml. Unknown flags are ignored.
Existing /api/review behaviour does not consult these flags.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from .config import CONFIG_PATH

_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}

# Defaults keep the new surface on (additive) and DSH off.
DEFAULTS = {
    "word_v2": True,
    "contextual_command": True,
    "safe_actions": True,
    "dsh_runtime": False,
}

ENV_NAMES = {
    "word_v2": "AGMT_WORD_V2",
    "contextual_command": "AGMT_CONTEXTUAL_COMMAND",
    "safe_actions": "AGMT_SAFE_ACTIONS",
    "dsh_runtime": "AGMT_DSH_RUNTIME",
}


def _parse_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in _TRUE:
        return True
    if text in _FALSE:
        return False
    return default


def _from_yaml(path: Path) -> dict[str, bool]:
    if not path.exists():
        return {}
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    flags = raw.get("flags") or {}
    if not isinstance(flags, dict):
        return {}
    out: dict[str, bool] = {}
    for key in DEFAULTS:
        if key in flags:
            out[key] = _parse_bool(flags[key], DEFAULTS[key])
    return out


@dataclass(frozen=True)
class Flags:
    word_v2: bool = DEFAULTS["word_v2"]
    contextual_command: bool = DEFAULTS["contextual_command"]
    safe_actions: bool = DEFAULTS["safe_actions"]
    dsh_runtime: bool = DEFAULTS["dsh_runtime"]

    def as_dict(self) -> dict[str, bool]:
        return {
            "word_v2": self.word_v2,
            "contextual_command": self.contextual_command,
            "safe_actions": self.safe_actions,
            "dsh_runtime": self.dsh_runtime,
            "AGMT_WORD_V2": self.word_v2,
            "AGMT_CONTEXTUAL_COMMAND": self.contextual_command,
            "AGMT_SAFE_ACTIONS": self.safe_actions,
            "AGMT_DSH_RUNTIME": self.dsh_runtime,
        }


def load_flags(path: Path | None = None) -> Flags:
    values = dict(DEFAULTS)
    values.update(_from_yaml(path or CONFIG_PATH))
    for key, env_name in ENV_NAMES.items():
        raw = os.environ.get(env_name)
        if raw is not None:
            values[key] = _parse_bool(raw, values[key])
    return Flags(**values)


FLAGS = load_flags()
