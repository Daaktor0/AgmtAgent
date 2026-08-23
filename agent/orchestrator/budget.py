"""Run budget: step, token and cost ceilings (plan §7.1 orchestrator/budget.py).

Exhaustion produces a *partial* result flagged as such — never a silent
truncation. The supervisor checks the budget before each model call; when a
ceiling is hit the loop stops, records a `budget_exhausted` event, and the run
finishes with status `partial`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..gateway import normalize_usage


@dataclass
class Budget:
    max_steps: int = 40
    max_tokens_in: int = 400_000
    max_tokens_out: int = 100_000
    max_cost_usd: float = 2.00

    steps_used: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    exhausted_reason: str | None = None
    events: list[dict] = field(default_factory=list)

    # ------------------------------------------------------------- spending

    def record_step(self) -> bool:
        """Count one model step. Returns False when the step ceiling is hit."""
        self.steps_used += 1
        if self.steps_used > self.max_steps:
            self._exhaust("steps", f"step budget of {self.max_steps} reached")
            return False
        return True

    def record_usage(self, usage: dict | None) -> None:
        n = normalize_usage(usage)
        self.tokens_in += n["tokens_in"]
        self.tokens_out += n["tokens_out"]
        self.cost_usd += n["cost_usd"]
        if self.tokens_in + self.tokens_out > self.max_tokens_in + self.max_tokens_out:
            self._exhaust("tokens",
                          f"token budget of {self.max_tokens_in + self.max_tokens_out} reached")
        elif self.cost_usd > self.max_cost_usd:
            self._exhaust("cost", f"cost budget of ${self.max_cost_usd:.2f} reached")

    def _exhaust(self, kind: str, reason: str) -> None:
        if self.exhausted_reason is None:
            self.exhausted_reason = reason
            self.events.append({"kind": "budget_exhausted",
                                "budget": kind, "reason": reason})

    # ------------------------------------------------------------- querying

    @property
    def exhausted(self) -> bool:
        return self.exhausted_reason is not None

    def warn_threshold(self, pct: float = 0.8) -> bool:
        """True once any ceiling is 80% consumed (soft warning point)."""
        steps_pct = self.steps_used / max(1, self.max_steps)
        tokens_pct = ((self.tokens_in + self.tokens_out)
                      / max(1, self.max_tokens_in + self.max_tokens_out))
        cost_pct = self.cost_usd / max(0.01, self.max_cost_usd)
        return max(steps_pct, tokens_pct, cost_pct) >= pct

    def summary(self) -> dict:
        return {
            "steps_used": self.steps_used, "max_steps": self.max_steps,
            "tokens_in": self.tokens_in, "tokens_out": self.tokens_out,
            "cost_usd": round(self.cost_usd, 4),
            "exhausted": self.exhausted,
            "exhausted_reason": self.exhausted_reason,
        }

    def to_json(self) -> str:
        import json
        return json.dumps(self.summary(), ensure_ascii=False)
