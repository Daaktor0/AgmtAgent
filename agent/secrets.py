"""Credential-store adapter for API keys (plan commit 6).

Resolution order for the OpenRouter key:

1. ``OPENROUTER_API_KEY`` environment variable (deployment override);
2. OS credential store via ``keyring`` when available;
3. legacy plaintext ``config.yaml`` — read works, but a *write* there is
   refused unless ``AGMT_ALLOW_PLAINTEXT_KEY=1``, and a warning is printed.

Writes prefer the keyring. When the keyring is unavailable (headless server,
no dbus) the write fails loudly instead of silently downgrading to plaintext.
"""

from __future__ import annotations

import os
import warnings
from typing import Any

SERVICE = "agmt"
ENTRY = "openrouter-api-key"

_keyring: Any | None
try:
    import keyring as _keyring_mod

    # Force backend resolution now so failures surface at startup, not on save.
    _keyring = _keyring_mod
    try:
        _keyring_mod.get_keyring()
    except Exception:  # pragma: no cover - platform dependent
        _keyring = None
except ImportError:  # pragma: no cover
    _keyring = None


def keyring_available() -> bool:
    return _keyring is not None


class SecretStore:
    """Read/write API keys through the best available backing store."""

    def __init__(self, config_backend: Any):
        """
        config_backend must expose:
          read_plain(key: str) -> str   (legacy config.yaml read)
          write_plain(key: str, value: str) -> None
        """
        self._config = config_backend

    def get_api_key(self, *, env_var: str = "OPENROUTER_API_KEY") -> str:
        env = os.environ.get(env_var)
        if env:
            return env
        if _keyring is not None:
            try:
                got = _keyring.get_password(SERVICE, ENTRY)
                if got:
                    return got
            except Exception:
                pass
        return self._config.read_plain("openrouter_api_key")

    def set_api_key(self, value: str) -> str:
        """Store the key; returns the backend used ('keyring' or 'plaintext')."""
        if _keyring is not None:
            try:
                _keyring.set_password(SERVICE, ENTRY, value)
                return "keyring"
            except Exception as exc:
                if os.environ.get("AGMT_ALLOW_PLAINTEXT_KEY") != "1":
                    raise RuntimeError(
                        "OS credential store refused to save the key "
                        f"({exc}). Set AGMT_ALLOW_PLAINTEXT_KEY=1 to permit "
                        "plaintext config.yaml storage.") from exc

        warnings.warn(
            "Saving the OpenRouter API key in plaintext config.yaml. Prefer a "
            "working OS keyring.", stacklevel=2)
        self._config.write_plain("openrouter_api_key", value)
        return "plaintext"

    def migrate_out_of_plaintext(self) -> bool:
        """If the key lives only in config.yaml and a keyring exists, move it.
        Returns True when a migration happened."""
        plain = self._config.read_plain("openrouter_api_key")
        if not plain or _keyring is None:
            return False
        try:
            _keyring.set_password(SERVICE, ENTRY, plain)
        except Exception:
            return False
        self._config.write_plain("openrouter_api_key", "")
        print(
            "WARNING: migrated OpenRouter API key from plaintext config.yaml "
            "to the OS credential store. The plaintext entry was cleared.")
        return True
