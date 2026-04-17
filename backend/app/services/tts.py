from __future__ import annotations

import logging
import re

import httpx

logger = logging.getLogger(__name__)


async def synthesize(text: str) -> bytes:
    """Convert text to audio bytes using ElevenLabs TTS API. Returns MP3."""
    from app.config import ELEVENLABS_API_KEY, ELEVENLABS_MODEL, ELEVENLABS_VOICE_ID, TTS_OUTPUT_FORMAT
    from app.services.rate_limiter import wait_for

    text = text.strip()
    if not text:
        return b""

    await wait_for("elevenlabs")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }

    payload = {
        "text": text,
        "model_id": ELEVENLABS_MODEL,
        "voice_settings": {
            "stability": 0.4,
            "similarity_boost": 0.8,
            "style": 0.6,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url,
                json=payload,
                headers=headers,
                params={"output_format": TTS_OUTPUT_FORMAT},
            )
            if resp.status_code == 402:
                logger.error(
                    "ElevenLabs TTS: HTTP 402 Payment Required — no usable credits or billing inactive. "
                    "Check https://elevenlabs.io/app/subscription and backend/.env ELEVENLABS_API_KEY. Body: %s",
                    (resp.text or "")[:400],
                )
                return b""
            resp.raise_for_status()
            return resp.content
    except httpx.HTTPStatusError as e:
        logger.error(
            "ElevenLabs TTS failed: %s — %s",
            e,
            (e.response.text[:400] if e.response is not None else ""),
        )
        return b""
    except Exception as e:
        logger.error("ElevenLabs TTS failed: %s", e)
        return b""


async def synthesize_sentences(text: str) -> list[bytes]:
    """Split on sentence boundaries and synthesize each independently."""
    sentences = _split_sentences(text)
    results: list[bytes] = []
    for s in sentences:
        if s.strip():
            audio = await synthesize(s)
            if audio:
                results.append(audio)
    return results


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]
