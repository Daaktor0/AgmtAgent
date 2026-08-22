"""Offline tests for the provider gateway and usage provenance (plan commit 7).

Exit criterion: stub-router tests prove fail-closed selection and complete
provenance on every response.

Run as a script: PASS/FAIL lines, ends ALL PASSED. No network.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-gw-"))

from agent.gateway import ProviderGateway, build_provenance, normalize_usage  # noqa: E402
from agent.config import Config  # noqa: E402

FAILS: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        FAILS.append(name)


class StubRouter:
    """Records what the gateway asked for; returns a canned response."""

    def __init__(self, with_key: bool = True):
        self.cfg = Config()
        self.cfg.api_key = "or-sk-test" if with_key else ""
        self.cfg.pinned = {"supervisor": "test/fixed-model"}
        self.asked: list[str] = []
        self.chat_calls: list[dict] = []

    def resolve(self, role: str) -> str:
        self.asked.append(role)
        return self.cfg.pinned.get(role, "test/fallback")

    def chat(self, role, messages, tools=None, model=None,
             temperature=None, max_tokens=None):
        self.chat_calls.append({"role": role, "model": model})
        return {"choices": [{"message": {"role": "assistant", "content": "ok"}}],
                "usage": {"prompt_tokens": 11, "completion_tokens": 7,
                          "cost": 0.003}}


def main() -> None:
    print("\nusage normalisation")
    n = normalize_usage({"prompt_tokens": 3, "completion_tokens": 4})
    check("openrouter field names map", (n["tokens_in"], n["tokens_out"]) == (3, 4))
    n2 = normalize_usage({"tokens_in": 5, "tokens_out": 6, "cost_usd": 0.01})
    check("gateway field names map", (n2["tokens_in"], n2["tokens_out"]) == (5, 6))
    n3 = normalize_usage(None)
    check("missing usage normalises to zeros",
          n3 == {"tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0})

    print("\nprovenance record")
    prov = build_provenance(role="supervisor", slug="anthropic/claude-opus",
                            usage={"prompt_tokens": 10, "completion_tokens": 2})
    check("provider extracted from slug", prov["provider"] == "anthropic")
    check("gateway identified", prov["gateway"] == "openrouter")
    check("usage carried", prov["tokens_in"] == 10 and prov["tokens_out"] == 2)
    prov2 = build_provenance(role="analyst", slug="x", usage=None,
                             request_meta={"request_id": "r-9"})
    check("request context attached when given", prov2["request_id"] == "r-9")

    print("\ngateway fail-closed")
    gw_nokey = ProviderGateway(StubRouter(with_key=False))
    try:
        gw_nokey.chat("supervisor", [{"role": "user", "content": "hi"}])
        check("no key refuses to call", False)
    except Exception as exc:
        check("no key refuses to call", "API key" in str(exc))
    check("no key means no resolution attempted", gw_nokey.calls == [])

    print("\ngateway happy path")
    stub = StubRouter()
    gw = ProviderGateway(stub)
    resp = gw.chat("supervisor", [{"role": "user", "content": "hi"}])
    check("response passes through", resp["choices"][0]["message"]["content"] == "ok")
    check("_provenance attached", resp["_provenance"]["role"] == "supervisor")
    check("provenance has usage", resp["_provenance"]["tokens_in"] == 11
          and resp["_provenance"]["cost_usd"] == 0.003)
    check("in-process trail records the call",
          gw.calls and gw.calls[0]["model"] == "test/fixed-model")
    check("router saw the resolved slug", stub.chat_calls[0]["model"] == "test/fixed-model")

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
