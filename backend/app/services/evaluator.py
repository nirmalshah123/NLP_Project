from __future__ import annotations

import logging

from app.prompts.evaluator import EVALUATOR_SYSTEM_PROMPT, build_evaluator_prompt
from app.services import llm, rag

logger = logging.getLogger(__name__)


async def evaluate_call(
    transcript: str, scenario_id: int
) -> dict:
    """Run the post-call evaluation pipeline and return scores dict."""
    rag_index = rag.get_rag(scenario_id)
    rag_context = ""
    if rag_index:
        chunks = rag_index.query("company policies and procedures")
        rag_context = "\n---\n".join(chunks)

    user_prompt = build_evaluator_prompt(transcript, rag_context)
    return await llm.evaluate_transcript(EVALUATOR_SYSTEM_PROMPT, user_prompt)
