from __future__ import annotations

from typing import Any

from agent.flags import load_flags
from agent.runtime.current import CurrentAgmtRuntime
from agent.runtime.dsh import DSHRuntime, DSHUnavailable


def get_runtime(router: Any | None = None, *, dsh_client: Any | None = None):
    flags = load_flags()
    if flags.dsh_runtime:
        runtime = DSHRuntime(dsh_client, available=dsh_client is not None)
        if dsh_client is None and not runtime.available:
            raise DSHUnavailable("AGMT_DSH_RUNTIME is on but no harness client is configured.")
        return runtime
    return CurrentAgmtRuntime(router)
