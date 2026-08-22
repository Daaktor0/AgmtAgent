"""Production hardening middleware (plan commit 15).

- Structured request logging (method, path, status, ms) without document text.
- Security headers on every response.
- Uniform error envelope: {"error": {"code", "message", "request_id"}} for
  unhandled exceptions — no stack traces leak to clients.
- Payload size cap: the add-in can send large documents; refuse absurd ones.
"""

from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("agmt")

MAX_BODY_BYTES = 20 * 1024 * 1024  # 20 MB — generous for big agreements

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    # Document confidentiality: never cache agreement text anywhere.
    "Cache-Control": "no-store",
}


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Request id + timing log + security headers."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("unhandled error request_id=%s path=%s",
                             request_id, request.url.path)
            response = JSONResponse(
                status_code=500,
                content={"error": {
                    "code": "internal_error",
                    "message": "Something went wrong. The details are in the "
                               "server log under this request id.",
                    "request_id": request_id,
                }})
        duration_ms = int((time.perf_counter() - start) * 1000)
        logger.info("%s %s -> %s %dms rid=%s",
                    request.method, request.url.path,
                    response.status_code, duration_ms, request_id)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        response.headers["X-Request-Id"] = request_id
        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content={"error": {
                    "code": "payload_too_large",
                    "message": "Document payload exceeds the size limit.",
                }})
        return await call_next(request)


def configure_logging(*, level: int = logging.INFO) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
