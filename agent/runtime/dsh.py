"""DeepSeek Harness adapter spike.

Isolated. No Word mutation tools. No privileged client data. Feature-flagged.
DSH never owns legal state, evidence, issues, drafts, approval or tenancy.
"""
from __future__ import annotations

from typing import Any, Callable

from agent.runtime.base import RunHandle
from agent.schemas.ids import new_id

FORBIDDEN_TOOLS = {
    "apply", "apply_action", "word_write", "insert_text", "delete_text",
    "track", "comment_write", "shell", "filesystem", "web", "code_mode",
}


class DSHUnavailable(RuntimeError):
    pass


class DSHRuntime:
    """Private execution interval. Transport only.

    A real DeepSeek Harness process is not required for the spike. When the
    adapter is constructed with `available=False` (the default unless a harness
    client is injected), run() fails closed.
    """

    name = "dsh"

    def __init__(self, client: Any | None = None, *, available: bool | None = None):
        self.client = client
        self.available = bool(client) if available is None else available

    def cancel(self, handle: RunHandle) -> None:
        handle.cancel()
        if self.client is not None and hasattr(self.client, "cancel"):
            self.client.cancel(handle.run_id)

    def run_specialist(
        self,
        role: str,
        instruction: str,
        tools: dict[str, Callable[..., Any]],
        *,
        cancel: RunHandle | None = None,
    ) -> dict[str, Any]:
        return self.run(
            instruction, tools, system=f"agmt-specialist:{role}", cancel=cancel,
        )

    def _guard_tools(self, tools: dict[str, Callable[..., Any]]) -> dict[str, Callable[..., Any]]:
        safe: dict[str, Callable[..., Any]] = {}
        for name, fn in tools.items():
            if name.lower() in FORBIDDEN_TOOLS or name.lower().startswith("word_"):
                continue
            safe[name] = fn
        return safe

    def run(
        self,
        instruction: str,
        tools: dict[str, Callable[..., Any]],
        *,
        system: str = "",
        cancel: RunHandle | None = None,
    ) -> dict[str, Any]:
        handle = cancel or RunHandle(run_id=new_id())
        if not self.available and self.client is None:
            raise DSHUnavailable("DeepSeek Harness is not available in this process.")
        if handle.cancelled:
            return {"status": "cancelled", "run_id": handle.run_id, "results": {}, "runtime": self.name}

        safe_tools = self._guard_tools(tools)
        results: dict[str, Any] = {}
        # Private interval: the client, if any, may call only the safelisted tools.
        if self.client is not None and hasattr(self.client, "run"):
            try:
                payload = self.client.run(
                    instruction=instruction,
                    system=system,
                    tools=safe_tools,
                    run_id=handle.run_id,
                )
                results["_dsh"] = payload
            except Exception as exc:
                return {
                    "status": "failed",
                    "reason": "provider_error",
                    "error": str(exc),
                    "run_id": handle.run_id,
                    "runtime": self.name,
                }
        else:
            for name, fn in safe_tools.items():
                if handle.cancelled:
                    return {"status": "cancelled", "run_id": handle.run_id, "results": results, "runtime": self.name}
                try:
                    results[name] = fn()
                except TypeError:
                    results[name] = fn(instruction)
                except Exception as exc:
                    results[name] = {"error": str(exc)}
                handle.events.append({"tool": name, "runtime": "dsh"})
        results["_word_authority"] = False
        return {"status": "ok", "run_id": handle.run_id, "results": results, "runtime": self.name}
