"""Fixed-window rate limits in Redis, keyed by client IP and the bucket name."""

import logging
import time
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Request
from redis.asyncio import Redis
from redis.exceptions import RedisError

from vaada.deps import client_ip

log = logging.getLogger(__name__)


def rate_limit(bucket: str, *, times: int, seconds: int) -> Callable[[Request], Awaitable[None]]:
    async def check(request: Request) -> None:
        ctx = request.app.state.ctx
        redis: Redis | None = request.app.state.redis
        if not ctx.settings.rate_limit_enabled or redis is None:
            return
        ip = client_ip(request, ctx.settings.trust_proxy_headers) or "unknown"
        window = int(time.time()) // seconds
        key = f"rl:{bucket}:{ip}:{window}"
        try:
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, seconds + 1)
        except RedisError as exc:
            # Failing open: a Redis outage shouldn't take payments down with it.
            log.warning("rate limiter unavailable: %s", type(exc).__name__)
            return
        if count > times:
            raise HTTPException(
                status_code=429,
                detail="Too many requests from here. Wait a minute and try again.",
                headers={"Retry-After": str(seconds)},
            )

    return check
