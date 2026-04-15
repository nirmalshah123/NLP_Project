"""Simple async rate limiter for cloud API calls.

Groq free tier: ~30 requests/min across all endpoints.
ElevenLabs free tier: varies by plan.

This enforces a minimum gap between consecutive calls to each provider,
and optionally notifies the frontend via a WebSocket callback when
throttling occurs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Callable, Coroutine, Optional

logger = logging.getLogger(__name__)

MIN_INTERVAL_GROQ = 2.2
MIN_INTERVAL_ELEVENLABS = 0.5

_last_call: dict[str, float] = {}
_locks: dict[str, asyncio.Lock] = {}

NotifyFn = Callable[[str, float], Coroutine]

_notify_fn: Optional[NotifyFn] = None


def set_notify(fn: Optional[NotifyFn]) -> None:
    """Register a coroutine to be called when a throttle wait starts.

    The coroutine receives (provider, delay_seconds).
    """
    global _notify_fn
    _notify_fn = fn


def _get_lock(provider: str) -> asyncio.Lock:
    if provider not in _locks:
        _locks[provider] = asyncio.Lock()
    return _locks[provider]


async def wait_for(provider: str) -> None:
    """Wait until enough time has passed since the last call to this provider."""
    intervals = {
        "groq": MIN_INTERVAL_GROQ,
        "elevenlabs": MIN_INTERVAL_ELEVENLABS,
    }
    min_interval = intervals.get(provider, 1.0)

    lock = _get_lock(provider)
    async with lock:
        now = time.monotonic()
        last = _last_call.get(provider, 0.0)
        elapsed = now - last
        if elapsed < min_interval:
            delay = min_interval - elapsed
            logger.debug("Rate limiter: waiting %.1fs before %s call", delay, provider)
            if _notify_fn is not None:
                try:
                    await _notify_fn(provider, delay)
                except Exception:
                    pass
            await asyncio.sleep(delay)
        _last_call[provider] = time.monotonic()
