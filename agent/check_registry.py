"""Compatibility re-export: the registry moved to agent/document/check_registry.py."""
from agent.document.check_registry import (  # noqa: F401
    BY_LEGACY, CHECKS, Check, run_registered, stamp,
)
