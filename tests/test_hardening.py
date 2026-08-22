"""Production hardening tests (plan commit 15): security headers, request ids,
uniform error envelopes, payload size cap.

Run as a script: PASS/FAIL lines, ends ALL PASSED. No network.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-hard-"))

from fastapi.testclient import TestClient  # noqa: E402
from server.app import app  # noqa: E402

FAILS: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        FAILS.append(name)


def main() -> None:
    client = TestClient(app)

    print("\nsecurity headers")
    r = client.get("/api/health")
    check("health 200", r.status_code == 200)
    check("no-store (document confidentiality)",
          r.headers.get("Cache-Control") == "no-store")
    check("nosniff", r.headers.get("X-Content-Type-Options") == "nosniff")
    check("frame deny", r.headers.get("X-Frame-Options") == "DENY")
    check("referrer policy", r.headers.get("Referrer-Policy") == "no-referrer")

    print("\nrequest correlation")
    rid = "test-rid-123"
    r2 = client.get("/api/health", headers={"X-Request-Id": rid})
    check("client request id honoured", r2.headers.get("X-Request-Id") == rid)
    r3 = client.get("/api/health")
    check("server generates id when absent",
          bool(r3.headers.get("X-Request-Id")))

    print("\nerror envelope")
    os.environ["AGMT_PAIRING_TOKEN"] = "111111"
    try:
        unauth = client.get("/api/positions")
        body = unauth.json()
        check("401 is JSON", unauth.status_code == 401 and "detail" in body)
    finally:
        os.environ.pop("AGMT_PAIRING_TOKEN")

    print("\npayload cap")
    huge = "x" * (21 * 1024 * 1024)
    try:
        big = client.post("/api/checks", content=huge,
                          headers={"Content-Type": "application/json"})
        check("oversized payload refused 413", big.status_code == 413)
    except Exception:
        # httpx may refuse to build the body; simulate via header only
        big = client.post("/api/checks", json={},
                          headers={"Content-Length": str(21 * 1024 * 1024)})
        check("oversized payload refused 413", big.status_code == 413)

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
