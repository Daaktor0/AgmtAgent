"""OpenRouter client. One API, any provider.

Model selection is resolved against the *live* catalogue so the tool follows
whatever the providers have shipped, rather than a slug frozen at build time.
"""
from __future__ import annotations

import time
from typing import Any

import httpx

from .config import Config

BASE = "https://openrouter.ai/api/v1"
HEADERS_EXTRA = {
    "HTTP-Referer": "http://localhost/agreement-agent",
    "X-Title": "Agreement Review & Drafting Agent",
}


class RouterError(RuntimeError):
    pass


class Router:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self._catalog: list[dict[str, Any]] = []
        self._catalog_at: float = 0.0
        self._client = httpx.Client(timeout=httpx.Timeout(600.0, connect=30.0))

    # ---------------- catalogue ----------------

    def catalog(self, force: bool = False) -> list[dict[str, Any]]:
        if self._catalog and not force and time.time() - self._catalog_at < 3600:
            return self._catalog
        r = self._client.get(f"{BASE}/models")
        r.raise_for_status()
        data = r.json().get("data", [])
        self._catalog = data
        self._catalog_at = time.time()
        return data

    def _is_free(self, m: dict) -> bool:
        p = m.get("pricing") or {}
        try:
            return float(p.get("prompt", 1)) == 0 and float(p.get("completion", 1)) == 0
        except (TypeError, ValueError):
            return False

    def _supports_tools(self, m: dict) -> bool:
        params = m.get("supported_parameters") or []
        return "tools" in params

    def resolve(self, role: str) -> str:
        """Pick a model slug for a role.

        Pinned config wins. Otherwise walk the preference list and, for the
        first prefix with live matches, take the most recently released one.
        """
        pin = self.cfg.pinned.get(role)
        if pin:
            return pin
        try:
            models = self.catalog()
        except Exception as exc:  # offline / bad key
            raise RouterError(
                f"Could not reach OpenRouter to choose a model for '{role}': {exc}"
            ) from exc

        if self.cfg.require_only_free:
            models = [m for m in models if self._is_free(m)]
        # The supervisor drives a tool loop; it must support tool calling.
        pool = [m for m in models if self._supports_tools(m)] or models

        for prefix in self.cfg.prefer.get(role, []):
            matches = [m for m in pool if m.get("id", "").startswith(prefix)]
            # Drop dated aliases in favour of the family's newest release.
            if matches:
                matches.sort(key=lambda m: m.get("created", 0), reverse=True)
                return matches[0]["id"]
        if pool:
            return pool[0]["id"]
        raise RouterError(f"No model available for role '{role}'.")

    def resolved_roles(self) -> dict[str, str]:
        out = {}
        for role in self.cfg.prefer:
            try:
                out[role] = self.resolve(role)
            except RouterError as exc:
                out[role] = f"<unresolved: {exc}>"
        return out

    # ---------------- chat ----------------

    def chat(
        self,
        role: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict:
        if not self.cfg.api_key:
            raise RouterError("No OpenRouter API key set. Add it in the task pane settings.")
        slug = model or self.resolve(role)
        body: dict[str, Any] = {
            "model": slug,
            "messages": messages,
            "temperature": self.cfg.temperature if temperature is None else temperature,
        }
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"
        if max_tokens:
            body["max_tokens"] = max_tokens

        r = self._client.post(
            f"{BASE}/chat/completions",
            json=body,
            headers={"Authorization": f"Bearer {self.cfg.api_key}", **HEADERS_EXTRA},
        )
        if r.status_code >= 400:
            raise RouterError(f"OpenRouter {r.status_code} for {slug}: {r.text[:800]}")
        payload = r.json()
        if "choices" not in payload:
            raise RouterError(f"Unexpected OpenRouter response: {str(payload)[:800]}")
        payload["_model"] = slug
        return payload
