"""Simple latency profiler for the voice pipeline.

Usage in the orchestrator:
    with profile_step("stt"):
        text = stt.transcribe(audio)

After a call ends, call `get_report(call_id)` to see per-step breakdowns.
"""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Dict, List

logger = logging.getLogger(__name__)

_call_profiles: Dict[int, List[dict]] = {}


@contextmanager
def profile_step(call_id: int, step_name: str):
    """Context manager that records wall-clock time for a pipeline step."""
    t0 = time.perf_counter()
    yield
    elapsed_ms = (time.perf_counter() - t0) * 1000
    entry = {"step": step_name, "ms": round(elapsed_ms, 1)}
    _call_profiles.setdefault(call_id, []).append(entry)
    logger.info("call=%d step=%s time=%.1fms", call_id, step_name, elapsed_ms)


def get_report(call_id: int) -> dict:
    """Return aggregated latency stats for a finished call."""
    entries = _call_profiles.pop(call_id, [])
    if not entries:
        return {"call_id": call_id, "turns": 0, "steps": {}}

    step_totals: Dict[str, List[float]] = {}
    for e in entries:
        step_totals.setdefault(e["step"], []).append(e["ms"])

    summary = {}
    for step, times in step_totals.items():
        summary[step] = {
            "count": len(times),
            "avg_ms": round(sum(times) / len(times), 1),
            "min_ms": round(min(times), 1),
            "max_ms": round(max(times), 1),
            "total_ms": round(sum(times), 1),
        }

    return {
        "call_id": call_id,
        "turns": len(step_totals.get("stt", {}) or [0]),
        "steps": summary,
    }
