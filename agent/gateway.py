"""Provider gateway with usage provenance (plan commit 7).

Wraps the OpenRouter HTTP client behind an Agmt-owned interface. Every chat
response carries a ``_provenance`` block recording who was called, with what,
what it cost, and which key/config produced it — normalised across providers
so the run event log can store one shape.

Fail-closed: no API key, no call. Selection errors never silently fall back
to a different provider.
"""

from __future__ import annotations

from typing import Any

from .config import Config
from .router import Router, RouterError


def normalize_usage(raw: dict | None) -> dict:
    """One usage shape from OpenRouter's occasionally inconsistent fields."""
    raw = raw or {}
    return {
        "tokens_in": int(raw.get("prompt_tokens") or raw.get("tokens_in") or 0),
        "tokens_out": int(raw.get("completion_tokens") or raw.get("tokens_out") or 0),
        "cost_usd": float(raw.get("cost") or raw.get("cost_usd") or 0.0),
    }


def build_provenance(*, role: str, slug: str, usage: dict | None,
                     request_meta: dict | None = None) -> dict:
    """The provenance record attached to every gateway response."""
    n = normalize_usage(usage)
    return {
        "role": role,
        "model": slug,
        "provider": slug.split("/", 1)[0] if "/" in slug else "unknown",
        "gateway": "openrouter",
        "tokens_in": n["tokens_in"],
        "tokens_out": n["tokens_out"],
        "cost_usd": n["cost_usd"],
        **(request_meta or {}),
    }


class ProviderGateway:
    """Agmt-owned front door for model calls. Backed by the Router today;
    swappable later without touching the supervisor or tools."""

    def __init__(self, router: Router):
        self._router = router
        self.calls: list[dict] = []  # in-process provenance trail

    @property
    def has_credentials(self) -> bool:
        return bool(self._router.cfg.api_key)

    def resolve(self, role: str) -> str:
        return self._router.resolve(role)

    def resolved_roles(self) -> dict[str, str]:
        return self._router.resolved_roles()

    def catalog(self, force: bool = False) -> list[dict[str, Any]]:
        return self._router.catalog(force=force)

    def chat(self, role: str, messages: list[dict], *,
             tools: list[dict] | None = None, model: str | None = None,
             temperature: float | None = None,
             max_tokens: int | None = None,
             request_context: Any | None = None) -> dict:
        if not self.has_credentials:
            raise RouterError(
                "No OpenRouter API key set. Add it in the task pane settings.")
        slug = model or self.resolve(role)
        resp = self._router.chat(
            role, messages, tools=tools, model=slug,
            temperature=temperature, max_tokens=max_tokens)
        prov = build_provenance(
            role=role, slug=slug, usage=resp.get("usage"),
            request_meta={
                "request_id": getattr(request_context, "request_id", None),
                "actor_id": getattr(request_context, "actor_id", None),
            })
        resp["_provenance"] = prov
        self.calls.append(prov)
        return resp
