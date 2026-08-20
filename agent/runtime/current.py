"""Current Agmt runtime: OpenRouter via Router, or a deterministic tool walk."""
from __future__ import annotations

from typing import Any, Callable

from agent.runtime.base import RunHandle
from agent.schemas.ids import new_id


class CurrentAgmtRuntime:
    name = "current"

    def __init__(self, router: Any | None = None):
        self.router = router

    def cancel(self, handle: RunHandle) -> None:
        handle.cancel()

    def run_specialist(
        self,
        role: str,
        instruction: str,
        tools: dict[str, Callable[..., Any]],
        *,
        cancel: RunHandle | None = None,
    ) -> dict[str, Any]:
        return self.run(instruction, tools, system=f"role:{role}", cancel=cancel)

    def run(
        self,
        instruction: str,
        tools: dict[str, Callable[..., Any]],
        *,
        system: str = "",
        cancel: RunHandle | None = None,
    ) -> dict[str, Any]:
        handle = cancel or RunHandle(run_id=new_id())
        if handle.cancelled:
            return {"status": "cancelled", "run_id": handle.run_id, "results": {}}
        results: dict[str, Any] = {}
        # Deterministic tool walk: the legal layer decides which tools to expose.
        for name, fn in tools.items():
            if handle.cancelled:
                return {"status": "cancelled", "run_id": handle.run_id, "results": results}
            try:
                results[name] = fn()
            except TypeError:
                results[name] = fn(instruction)
            except Exception as exc:  # tool failure is visible, not swallowed as success
                results[name] = {"error": str(exc)}
            handle.events.append({"tool": name})
        if self.router is not None:
            try:
                messages = [
                    {"role": "system", "content": system or "Agmt legal runtime."},
                    {"role": "user", "content": instruction},
                ]
                resp = self.router.chat("supervisor", messages)
                results["_model"] = (resp.get("choices") or [{}])[0].get("message", {}).get("content")
                results["_model_id"] = resp.get("_model")
            except Exception as exc:
                results["_model_error"] = str(exc)
        return {"status": "ok", "run_id": handle.run_id, "results": results, "runtime": self.name}
