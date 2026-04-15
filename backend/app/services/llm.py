from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator

import httpx

logger = logging.getLogger(__name__)

MAX_RETRIES = 3


async def chat_stream(
    system_prompt: str,
    history: list[dict[str, str]],
    user_message: str,
) -> AsyncGenerator[str, None]:
    """Stream LLM response tokens from Groq API with retry on rate limit."""
    from app.config import GROQ_API_KEY, GROQ_LLM_MODEL, LLM_HISTORY_WINDOW, LLM_MAX_TOKENS, LLM_TEMPERATURE

    messages = [{"role": "system", "content": system_prompt}]
    for turn in history[-LLM_HISTORY_WINDOW:]:
        messages.append(turn)
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": GROQ_LLM_MODEL,
        "messages": messages,
        "stream": True,
        "temperature": LLM_TEMPERATURE,
        "max_tokens": LLM_MAX_TOKENS,
    }

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    from app.services.rate_limiter import wait_for

    for attempt in range(MAX_RETRIES):
        await wait_for("groq")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                async with client.stream(
                    "POST",
                    "https://api.groq.com/openai/v1/chat/completions",
                    json=payload,
                    headers=headers,
                ) as resp:
                    if resp.status_code == 429:
                        retry_after = float(resp.headers.get("retry-after", "2"))
                        wait = max(retry_after, 1.0 * (attempt + 1))
                        logger.warning("Groq rate limited, retrying in %.1fs (attempt %d/%d)", wait, attempt + 1, MAX_RETRIES)
                        await asyncio.sleep(wait)
                        continue

                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            token = delta.get("content", "")
                            if token:
                                yield token
                        except json.JSONDecodeError:
                            continue
                    return
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                wait = 2.0 * (attempt + 1)
                logger.warning("Groq rate limited (exception), retrying in %.1fs", wait)
                await asyncio.sleep(wait)
                continue
            raise

    logger.error("Groq rate limit exceeded after %d retries", MAX_RETRIES)


async def chat(
    system_prompt: str,
    history: list[dict[str, str]],
    user_message: str,
) -> str:
    """Non-streaming variant for evaluation and other one-shot calls."""
    full_text: list[str] = []
    async for token in chat_stream(system_prompt, history, user_message):
        full_text.append(token)
    return "".join(full_text)


async def evaluate_transcript(
    evaluator_system: str, evaluator_user: str
) -> dict:
    """Call the LLM with evaluator prompts using dedicated eval settings."""
    from app.config import EVAL_MAX_TOKENS, EVAL_TEMPERATURE, GROQ_API_KEY, GROQ_LLM_MODEL
    from app.services.rate_limiter import wait_for

    messages = [
        {"role": "system", "content": evaluator_system},
        {"role": "user", "content": evaluator_user},
    ]

    payload = {
        "model": GROQ_LLM_MODEL,
        "messages": messages,
        "stream": False,
        "temperature": EVAL_TEMPERATURE,
        "max_tokens": EVAL_MAX_TOKENS,
    }

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    raw = ""
    for attempt in range(MAX_RETRIES):
        await wait_for("groq")
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    json=payload,
                    headers=headers,
                )
                if resp.status_code == 429:
                    retry_after = float(resp.headers.get("retry-after", "3"))
                    wait = max(retry_after, 2.0 * (attempt + 1))
                    logger.warning("Eval rate limited, retrying in %.1fs", wait)
                    await asyncio.sleep(wait)
                    continue

                resp.raise_for_status()
                data = resp.json()
                raw = data["choices"][0]["message"]["content"]
                logger.info("Evaluation LLM raw response (%d chars): %s", len(raw), raw[:300])
                break
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                wait = 3.0 * (attempt + 1)
                logger.warning("Eval rate limited (exception), retrying in %.1fs", wait)
                await asyncio.sleep(wait)
                continue
            logger.exception("Evaluation LLM HTTP error")
            return _default_scores()
        except Exception:
            logger.exception("Evaluation LLM call failed")
            return _default_scores()

    if not raw:
        logger.error("Evaluation LLM returned empty response after %d retries", MAX_RETRIES)
        return _default_scores()

    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start == -1 or end == 0:
        logger.error("LLM did not return valid JSON: %s", raw[:500])
        return _default_scores()
    try:
        result = json.loads(raw[start:end])
    except json.JSONDecodeError:
        logger.error("Failed to parse evaluation JSON: %s", raw[:500])
        return _default_scores()

    logger.info("Parsed evaluation scores: %s", {k: result.get(k) for k in ("empathy", "de_escalation", "policy_adherence", "professionalism", "resolution")})

    for key in ("empathy", "de_escalation", "policy_adherence", "professionalism", "resolution"):
        result.setdefault(key, 0)
        try:
            result[key] = max(0.0, min(10.0, float(result[key])))
        except (ValueError, TypeError):
            result[key] = 0.0
    result.setdefault("mistakes", [])
    result.setdefault("coaching", "")
    if isinstance(result["mistakes"], list):
        result["mistakes"] = json.dumps(result["mistakes"])
    return result


def _default_scores() -> dict:
    return {
        "empathy": 0,
        "de_escalation": 0,
        "policy_adherence": 0,
        "professionalism": 0,
        "resolution": 0,
        "mistakes": "[]",
        "coaching": "Evaluation failed — please review the transcript manually.",
    }
