"""Legal execution runtime seam. DSH must not own legal state or Word writes."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Protocol


@dataclass
class RunHandle:
    run_id: str
    cancelled: bool = False
    events: list[dict[str, Any]] = field(default_factory=list)

    def cancel(self) -> None:
        self.cancelled = True


class LegalExecutionRuntime(Protocol):
    name: str

    def run(
        self,
        instruction: str,
        tools: dict[str, Callable[..., Any]],
        *,
        system: str = "",
        cancel: RunHandle | None = None,
    ) -> dict[str, Any]:
        ...

    def cancel(self, handle: RunHandle) -> None:
        ...

    def run_specialist(
        self,
        role: str,
        instruction: str,
        tools: dict[str, Callable[..., Any]],
        *,
        cancel: RunHandle | None = None,
    ) -> dict[str, Any]:
        ...
