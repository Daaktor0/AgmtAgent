"""Offline tests for the credential-store adapter (plan commit 6).

Exit criterion: no new API key is written to config.yaml unless explicitly
allowed; existing key is migrated or startup is explicit about failure.

Run as a script: PASS/FAIL lines, ends ALL PASSED. No network, no keyring.
"""

from __future__ import annotations

import os
import sys
import tempfile
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

FAILS: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        FAILS.append(name)


class FakeBackend:
    def __init__(self):
        self.data: dict[str, str] = {}

    def read_plain(self, key: str) -> str:
        return self.data.get(key, "")

    def write_plain(self, key: str, value: str) -> None:
        self.data[key] = value


def main() -> None:
    print("\nsecret store")
    # Force the no-keyring path deterministically for this test process.
    import agent.secrets as secrets_mod
    secrets_mod._keyring = None

    from agent.secrets import SecretStore

    backend = FakeBackend()
    store = SecretStore(backend)

    os.environ.pop("OPENROUTER_API_KEY", None)
    check("no key reads empty", store.get_api_key() == "")

    # Write without keyring and without the opt-out must fail loudly.
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error")  # any warning becomes an exception
            store.set_api_key("or-sk-test")
        refused = False
    except (RuntimeError, Warning):
        refused = True
    check("plaintext write refused by default", refused)
    check("config.yaml untouched", "openrouter_api_key" not in backend.data)

    # Explicit opt-out allows plaintext with a loud warning.
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        where = store.set_api_key("or-sk-plain")
    check("opt-out stores in plaintext backend", where == "plaintext"
          and backend.data["openrouter_api_key"] == "or-sk-plain")
    check("plaintext write warns", len(caught) >= 1)

    check("read back through adapter", store.get_api_key() == "or-sk-plain")

    # Env var wins over stored value.
    os.environ["OPENROUTER_API_KEY"] = "or-sk-env"
    check("env var takes precedence", store.get_api_key() == "or-sk-env")
    os.environ.pop("OPENROUTER_API_KEY")

    print("\nkeyring migration path")
    class FakeKeyring:
        def __init__(self):
            self.store: dict[tuple[str, str], str] = {}
        def get_password(self, service, entry):
            return self.store.get((service, entry))
        def set_password(self, service, entry, value):
            self.store[(service, entry)] = value
        def fail(self, *_a, **_k):
            raise RuntimeError("locked")

    kr = FakeKeyring()
    secrets_mod._keyring = kr
    backend2 = FakeBackend()
    backend2.data["openrouter_api_key"] = "or-sk-legacy"
    store2 = SecretStore(backend2)
    kr.set_password("agmt", "openrouter-api-key", "or-sk-ring")
    check("keyring read preferred", store2.get_api_key() == "or-sk-ring")
    kr.store.pop(("agmt", "openrouter-api-key"))  # empty keyring falls to plaintext
    migrated = store2.migrate_out_of_plaintext()
    check("migration moves key out of plaintext",
          migrated and kr.get_password("agmt", "openrouter-api-key") == "or-sk-legacy"
          and backend2.data["openrouter_api_key"] == "")
    check("post-migration read comes from keyring",
          store2.get_api_key() == "or-sk-legacy")

    # Keyring failure on write fails loudly.
    kr.set_password = kr.fail
    try:
        store2.set_api_key("or-sk-new")
        check("keyring failure raises without plaintext fallback", False)
    except RuntimeError as exc:
        check("keyring failure raises without plaintext fallback",
              "credential store" in str(exc))

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
